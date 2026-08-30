# Espace enseignants / direction — conception

Document de conception rédigé pendant un travail de nuit autonome.
**Rien n'est en production.** Cette livraison contient : le modèle de données,
une migration SQL **non appliquée**, l'échafaudage des pages et des routes API
(le build `npm run build` passe), et la liste des décisions.
Le branchement de la page de connexion et des permissions est volontairement
laissé pour « le matin » (points d'intégration ci-dessous).

Date : 29 août 2026. **Mise à jour 30 août 2026 : les 12 décisions de Thomas
ont été appliquées** (voir §10 pour le détail de ce qui a changé). Les
nouveautés de cette 2ᵉ passe : purge automatique du RIB au remboursement (D8),
re-consultation de ses pièces par l'enseignant (D6), tableau de bord + récap
par classe dans le back-office (D11), rattachement d'une fiche enseignant à un
compte parent/bureau existant (D1).

---

## 1. Besoin (rappel de la demande)

Les enseignants et le/la directeur·rice de l'école doivent pouvoir se
connecter au site, comme les parents, pour :

- **Devis** : soumettre un devis de prestation à faire financer par le Sou.
  Le bureau valide. Statuts : `soumis` → `validé` → `refusé`.
- **Factures** : envoyer une facture de prestataire pour remboursement.
  Statuts : `soumise` → `remboursée`. **Pas de devis préalable obligatoire** ;
  une facture peut arriver seule, sans rattachement.
- **Fichiers** : déposer devis, factures et **RIB** en fichier (PDF ou photo).
  Le RIB se dépose **en fichier uniquement** — aucune saisie IBAN/BIC, pour
  éviter les erreurs de frappe.
- **Classes concernées** : à chaque dépôt de devis ou de facture, cocher
  **une ou plusieurs classes**. Les transports regroupent souvent plusieurs
  classes, les enseignants se mettent ensemble : le bureau doit savoir
  exactement qui est financé.
- **Messages** : écrire au bureau, avec les mêmes « Messages reçus » que les
  parents et partenaires, mais l'origine clairement distinguée.

Back-office (bureau) : voir les devis et factures soumis, avec les classes
concernées et les fichiers ; valider/refuser un devis ; marquer une facture
remboursée ; voir les RIB.

---

## 2. Ce qui a été réutilisé de l'existant

| Brique existante | Réutilisation |
|---|---|
| Fiche découplée du compte de connexion (`parents.auth_user_id`, migration 0025) | Même schéma pour `teachers` : la fiche existe avant l'activation du compte |
| Circuit d'invitation maison (`invitations` + jeton, migration 0021, `app/lib/invitations.js`, `/api/activer-compte`) | `invitations.teacher_id` ajouté ; `app/lib/invitationsEnseignants.js` décalque `envoyerInvitation` |
| Page `/activer-compte` | **Aucune modification nécessaire** : elle définit le mot de passe par `user_id`, quel que soit le type de compte |
| Bucket privé `remboursements` (migration 0024) | Réutilisé tel quel, préfixe `enseignants/<teacher_id>/…` ; **pas de nouveau bucket** |
| Logique fichier des remboursements parents (`decodeDataUrl`, upload, URL signée 5 min) | Factorisée dans `app/lib/enseignantFichiers.js` |
| `contact_messages` + « Messages reçus » du back-office | Étendue par colonnes d'origine, formulaire public inchangé |
| `AdminShell`, `requirePermission`, `/api/admin/moi` | Le back-office enseignants suit exactement le même moule que `remboursements` |
| `currentSchoolYear()` (`app/lib/anneeScolaire.js`) | Sert de clé pour dériver la liste des classes de l'année |

---

## 3. Modèle de données

Migration : **`supabase/migrations/0033_espace_enseignants.sql`** (numéro
**provisoire** — à renuméroter avant application, voir §7). RLS activé partout,
**aucune policy publique** : tout passe par des routes API serveur avec la clé
de service, comme le reste du back-office et l'espace remboursements.

### 3.1 `teachers` — identité + rôle

```
teachers
  id             uuid  PK
  auth_user_id   uuid  → auth.users (nullable, unique) — lien vers le compte
  first_name     text
  last_name      text
  email          text  NOT NULL, unique (lower(email))
  role           text  'enseignant' | 'direction'  (défaut 'enseignant')
  active         boolean  défaut true — désactive l'accès sans supprimer
  created_at     timestamptz
  invited_at     timestamptz — date du dernier envoi d'invitation
```

Découplé du compte comme `parents` : `auth_user_id` reste nul entre la
création de la fiche (par le bureau) et l'activation de l'invitation.

### 3.2 `invitations.teacher_id`

Une seule colonne ajoutée à la table `invitations` existante.
`parent_id` et `teacher_id` sont mutuellement exclusifs (un enregistrement
d'invitation concerne soit un parent, soit un enseignant).

### 3.3 `teacher_quotes` — devis

```
teacher_quotes
  id               uuid PK
  teacher_id       uuid → teachers (cascade)
  title            text NOT NULL
  description      text
  amount_cents     integer NOT NULL, > 0
  school_year      text NOT NULL — figé à la création (currentSchoolYear())
  status           text 'soumis' | 'valide' | 'refuse'  (défaut 'soumis')
  quote_file_path  text NOT NULL — chemin dans le bucket privé
  admin_note       text — note interne du bureau ; sert de motif de refus
  decided_at       timestamptz
  decided_by       uuid → parents (qui a validé/refusé)
  created_at       timestamptz
```

### 3.4 `teacher_quote_classes` — classes d'un devis (1..n)

```
teacher_quote_classes
  quote_id     uuid → teacher_quotes (cascade)
  class_label  text — LIBELLÉ figé de la classe (ex. "CE1", "CE2-CM1")
  PK (quote_id, class_label)
```

On stocke le **libellé** tel qu'il apparaît dans `children.class_level` pour
l'année concernée, **pas une clé étrangère** : il n'y a pas de table
`classes`, et les regroupements changent chaque année. Ce libellé est un
instantané, il reste lisible même si les fiches enfants évoluent ensuite.

### 3.5 `teacher_ribs` — RIB en fichier

```
teacher_ribs
  id             uuid PK
  teacher_id     uuid → teachers (cascade)
  label          text — ex. "Coopérative CE2", "compte perso"
  rib_file_path  text — NULL une fois le fichier purgé après remboursement (D8)
  purged_at      timestamptz — date de suppression du fichier
  created_at     timestamptz
```

Aucune colonne IBAN/BIC : uniquement le chemin du fichier. La ligne est
**conservée après purge** (trace « ce RIB a existé »), seul le fichier
disparaît et `purged_at` est horodaté.

### 3.6 `teacher_invoices` — factures

```
teacher_invoices
  id                 uuid PK
  teacher_id         uuid → teachers (cascade)
  quote_id           uuid → teacher_quotes (nullable, ON DELETE SET NULL) — rattachement FACULTATIF
  label              text NOT NULL
  supplier_name      text — prestataire
  description        text
  amount_cents       integer NOT NULL, > 0
  school_year        text NOT NULL
  status             text 'soumise' | 'remboursee'  (défaut 'soumise')
  invoice_file_path  text NOT NULL
  rib_id             uuid → teacher_ribs (nullable) — RIB réutilisé
  rib_file_path      text — OU RIB joint directement (NULL après purge / si rib_id)
  rib_received       boolean NOT NULL défaut false — un RIB a été fourni à un moment
  admin_note         text
  reimbursed_at      timestamptz
  reimbursed_by      uuid → parents
  created_at         timestamptz
```

Le RIB d'une facture peut venir de deux sources : `rib_file_path` (fichier
joint au moment du dépôt) **ou** `rib_id` (un RIB déjà déposé). La route de
consultation gère les deux. **Au passage à `remboursee` (D8), le fichier RIB
est supprimé** (voir §6.6) ; `rib_received` reste à `true` pour l'historique.

### 3.7 `teacher_invoice_classes` — classes d'une facture (1..n)

Identique à `teacher_quote_classes`, pour les factures.

### 3.8 `contact_messages` — origine du message

Colonnes **ajoutées** (non destructif, le formulaire public ne change pas) :

```
from_type             text NOT NULL défaut 'public'
                      check ('public' | 'parent' | 'partenaire' | 'enseignant')
sender_parent_id      uuid → parents      (nullable)
sender_teacher_id     uuid → teachers     (nullable)
sender_partenaire_id  uuid → partenaires  (nullable)
```

- Les lignes existantes prennent `from_type = 'public'`.
- La route `/api/contact` actuelle continue de fonctionner sans modification
  (elle n'écrit pas `from_type`, le défaut s'applique).
- La route enseignant écrit `from_type = 'enseignant'` + `sender_teacher_id`.
- Brancher `from_type = 'parent'` sur le formulaire de l'espace adhérent et
  `from_type = 'partenaire'` sur l'espace partenaire est **hors périmètre**
  (fichiers partenaires verrouillés, un autre chantier en parallèle) — c'est
  une amélioration ultérieure simple : voir §8.

---

## 4. La liste des classes de l'année

**Problème.** Il faut proposer aux enseignants la liste des classes réelles de
l'école, qui change chaque année (classes créées/supprimées, regroupements
qui varient : CE1-CE2 une année, CE1-CM une autre).

**Source retenue.** Les classes distinctes de `children.class_level` pour
`school_year = currentSchoolYear()`. Pas de table `classes` : la seule donnée
fiable est celle des fiches enfants, et elle se met à jour à chaque import.

**Implémentation.** `app/lib/classes.js` → `listerClassesAnnee(admin, year)` :
`select class_level from children where school_year = year and class_level is
not null`, puis `distinct` + `trim` + tri alphabétique côté application
(Supabase REST ne fait pas de `select distinct`). Exposé par
`GET /api/enseignant/classes` — **recalculé à chaque appel**, jamais mis en
cache : la liste se corrige d'elle-même à mesure que les fiches de l'année
sont importées.

**Cas « aucune classe ».** Aujourd'hui les fiches de l'année en cours ne sont
pas encore importées → la liste sera vide ou incomplète. Géré ainsi :

- Back-office : un devis/une facture sans classe est signalé en rouge
  (« aucune classe indiquée »).
- Espace enseignant : quand la liste dérivée est vide, le sélecteur multi-
  classes bascule sur une **saisie libre** (« CE1, CE2-CM1 », séparées par des
  virgules). Dès que l'import est fait, les cases à cocher réapparaissent.
- Le libellé saisi est stocké tel quel : quand l'import arrivera, il faudra
  éventuellement corriger à la main les libellés des dépôts déjà faits pour
  qu'ils correspondent exactement (décision D7).

---

## 5. Les écrans

### 5.1 Espace enseignant — `/espace-enseignant` (`app/espace-enseignant/page.js`)

Garde d'accès sur le même modèle que `/espace-adherent` :
`getSession()` → `GET /api/enseignant/moi`. Si 403 → écran « Accès réservé »
avec lien vers l'espace famille.

Sections (une page, pas d'onglets) :

1. **Mes devis** — formulaire (intitulé, détail, montant, sélecteur multi-
   classes **obligatoire**, fichier PDF/photo **obligatoire**) + historique
   avec statut, lien **« Voir le devis »** (D6), et motif de refus le cas échéant.
2. **Mes factures** — formulaire (intitulé, prestataire, montant, sélecteur
   multi-classes obligatoire, fichier facture obligatoire, RIB : aucun /
   nouveau fichier / réutiliser un RIB déjà déposé) + historique avec statut,
   liens **« Voir la facture » / « Voir le RIB »** (D6), et mention
   « RIB joint » / « RIB reçu (supprimé après remboursement) » / « RIB manquant ».
3. **Mes RIB** — dépôt d'un RIB en fichier (libellé facultatif) + liste avec
   lien **« Voir »** ou mention « supprimé après remboursement ».
4. **Écrire au bureau** — sujet + message → `contact_messages`.

Re-consultation des pièces (D6) : `GET /api/enseignant/fichier?kind=…&id=…`
vérifie que la ligne appartient bien à l'enseignant du jeton, puis renvoie une
URL signée 5 min. Les RIB purgés renvoient un 404 explicite.

Rattachement facultatif d'une facture à un devis : **prévu dans la route API**
(`quoteId`, vérifié comme appartenant à l'enseignant) mais **pas exposé dans
le formulaire** (décision D3 confirmée). Le back-office affiche déjà
« rattachée à un devis » quand le lien existe.

### 5.2 Back-office — `/admin/enseignants` (`app/admin/enseignants/page.js`)

Via `AdminShell`, permission `enseignants`. Cinq onglets internes :

- **Bilan** (D11) — sélecteur d'année scolaire ; cartes chiffrées (engagé sur
  l'année = devis validés + factures, devis validés / en attente, factures
  remboursées / en attente / total) ; **tableau de financement par classe**
  (montant des devis validés et des factures concernant chaque classe).
  Source : `GET /api/admin/enseignants/bilan?annee=YYYY-YYYY`.
- **Devis** — filtre « À traiter » / « Tous ». Carte par devis : enseignant,
  classes (badges), montant, statut, « Voir le devis » (URL signée), note
  interne, boutons **Valider** / **Refuser** / **Remettre en attente**.
- **Factures** — filtre « À rembourser » / « Toutes ». Carte : enseignant,
  prestataire, classes, montant, statut, « Voir la facture », « Voir le RIB »
  (ou « RIB reçu — supprimé après remboursement », ou « RIB manquant » en
  rouge), note, boutons **Marquer remboursée** / **Remettre en attente**.
- **RIB** — liste de tous les RIB déposés (enseignant, libellé, date) +
  « Voir le RIB » (URL signée) ou mention « supprimé le … (après remboursement) ».
- **Comptes** — formulaire d'invitation (prénom, nom, e-mail, rôle) + liste
  des comptes avec état (« invitation en attente » / « compte activé » /
  « désactivé »), boutons **Basculer rôle** et **Désactiver / Réactiver**.
  Si l'e-mail correspond à un compte déjà existant (parent / bureau), la fiche
  enseignant y est rattachée sans e-mail d'invitation (D1) et un message
  l'explique.

### 5.3 Messages reçus — back-office existant

La distinction d'origine est **écrite en base** (`from_type = 'enseignant'`,
`sender_teacher_id`). L'**affichage** du badge et du filtre dans
`app/admin/messages/page.js` est un **point d'intégration partagé** (I6) —
non fait ici pour ne pas empiéter sur le chantier en cours. Décision D5 :
badge « Parent » / « Partenaire » / « Enseignant » / « Site » + filtre par
origine, même boîte, même notification `CONTACT_EMAIL`.

---

## 6. Les flux

### 6.1 Invitation d'un enseignant

1. Bureau : onglet **Comptes** → saisit prénom/nom/e-mail/rôle → `POST
   /api/admin/enseignants/comptes`.
2. La route crée la fiche `teachers` (si l'e-mail n'existe pas déjà) puis
   appelle `envoyerInvitationEnseignant`, qui distingue trois cas :
   - **Compte déjà existant et confirmé** (D1 — la personne est déjà parent ou
     membre du bureau) : aucune création, aucun e-mail. La fiche `teachers`
     est simplement rattachée à ce `auth.users`. Réponse `compteExistant:true`
     + message expliquant qu'elle se connecte avec son mot de passe habituel.
   - **Sender configuré** : `createUser` (confirmé d'emblée) → jeton maison
     dans `invitations` (`teacher_id` renseigné) → e-mail Sender vers
     `/activer-compte?jeton=…`.
   - **Sender non configuré** : `inviteUserByEmail` (repli, e-mail Supabase).
3. L'enseignant clique le lien, choisit son mot de passe sur `/activer-compte`
   (route `/api/activer-compte` inchangée : elle affecte le mot de passe par
   `user_id`).
4. `teachers.auth_user_id` est renseigné → l'enseignant peut se connecter.

**Renvoi d'invitation** : re-`POST` sur le même e-mail régénère un jeton (la
fiche existe déjà, on ne la recrée pas).

### 6.2 Connexion et redirection par rôle — **À BRANCHER (voir §7)**

Une seule page `/connexion`. Aujourd'hui elle redirige **toujours** vers
`/espace-adherent`. Il faut, après `signInWithPassword`, aiguiller :

- membre du bureau (`parents.is_admin`) → `/admin`
- enseignant actif (`teachers.active`) → `/espace-enseignant`
- sinon → `/espace-adherent`

Le helper est **fourni prêt à l'emploi** : `app/lib/redirectionRole.js` →
`resoudreEspace(admin, authUserId)`. Il reste à créer une petite route
(`GET /api/moi/espace` par ex.) qui l'appelle avec le jeton, et à câbler
`app/connexion/page.js` + `app/activer-compte/page.js` dessus. **Non fait ici**
car la consigne était de ne pas toucher à la page de connexion.

### 6.3 Dépôt d'un devis

Formulaire → `fichierEnDataUrl` (base64) → `POST /api/enseignant/devis` avec
`{title, description, amount, classes[], quoteFileDataUrl}`.
La route : `requireEnseignant` → vérifie montant > 0 et **au moins une
classe** → `televerserFichier` (bucket privé, préfixe `enseignants/<id>/`) →
`insert teacher_quotes` (statut `soumis`, `school_year` figé) → `insert
teacher_quote_classes` (une ligne par classe). Le devis apparaît immédiatement
côté bureau dans « À traiter ».

### 6.4 Dépôt d'une facture (avec classes + RIB)

`POST /api/enseignant/factures` avec `{label, supplierName, amount,
classes[], invoiceFileDataUrl, ribFileDataUrl?, ribId?, quoteId?}`.
La route : mêmes contrôles (montant, au moins une classe) → si `quoteId`
fourni, vérifie qu'il appartient à l'enseignant → si `ribId` fourni, idem →
upload facture (obligatoire) → upload RIB si `ribFileDataUrl` **et** pas de
`ribId` → `insert teacher_invoices` (statut `soumise`) + `teacher_invoice_classes`.

### 6.5 Validation / refus d'un devis (bureau)

`PATCH /api/admin/enseignants/devis/[id]` avec `{status, adminNote}`.
`status ∈ {soumis, valide, refuse}`. Sur `valide`/`refuse` : `decided_at` =
maintenant, `decided_by` = membre du bureau connecté. C'est **ce changement**
qui fait apparaître « Validé »/« Refusé » côté enseignant — jamais avant.
En cas de refus, `admin_note` sert de motif et s'affiche à l'enseignant.

### 6.6 Remboursement d'une facture + purge du RIB (bureau, D8)

`PATCH /api/admin/enseignants/factures/[id]` avec `{status, adminNote}`.
`status ∈ {soumise, remboursee}`. Sur `remboursee` : `reimbursed_at`,
`reimbursed_by`. **Le virement lui-même reste manuel** : ce statut ne fait
que suivre l'état, comme pour les remboursements parents.

**Purge automatique du RIB (D8).** Logique de Thomas : une fois le virement
fait, le bénéficiaire est enregistré côté banque, le RIB ne sert plus et ne
doit pas rester stocké. Au passage à `remboursee` (et seulement à la
transition, pas si la facture y était déjà) :

1. On note `rib_received = true` sur la facture (trace « un RIB avait été
   fourni »).
2. Si `rib_file_path` (fichier joint à la facture) : le fichier du bucket est
   supprimé, la colonne repasse à `NULL`.
3. Si `rib_id` (RIB réutilisable de `teacher_ribs`) : on vérifie qu'**aucune
   autre facture non remboursée** ne référence ce même `rib_id`. Si c'est le
   cas, le fichier du bucket est supprimé, `teacher_ribs.rib_file_path`
   repasse à `NULL` et `purged_at` est horodaté. La **ligne `teacher_ribs`
   est conservée** (trace). Si une autre facture non remboursée l'utilise
   encore, on ne touche pas au fichier (il sera purgé au dernier
   remboursement).
4. La suppression de fichier se fait **après** le changement de statut : si
   elle échoue, la facture est quand même « remboursée » (réponse avec un
   `avertissement`), on ne bloque pas le suivi comptable.

Conséquences côté lecture : `rib_consultable` (fichier encore présent) vs
`a_rib` (un RIB a existé). Les routes de consultation (`/fichier`) renvoient
un 404 explicite « supprimé après remboursement » quand le fichier a été
purgé. Remettre une facture en `soumise` **ne restaure pas** le fichier
(irréversible) — le cas est rare et documenté ; l'enseignant peut re-déposer
un RIB si besoin.

### 6.7 Consultation des fichiers

**Bureau :**
`GET /api/admin/enseignants/devis/[id]/fichier`
`GET /api/admin/enseignants/factures/[id]/fichier?type=facture|rib`
`GET /api/admin/enseignants/rib/[id]/fichier`

**Enseignant (D6) :** `GET /api/enseignant/fichier?kind=devis|facture|rib&id=…`
(`&partie=facture|rib` pour une facture). La route vérifie **strictement**
que la ligne appartient au `teacher_id` du jeton avant de signer l'URL.

Toutes renvoient une **URL signée valable 5 minutes** vers le bucket privé,
aucune URL publique. Un RIB purgé (D8) renvoie un 404 explicite.

### 6.8 Message au bureau

`POST /api/enseignant/messages` → `insert contact_messages` avec
`from_type = 'enseignant'`, `sender_teacher_id`, `name`/`email` déduits de la
fiche `teachers` (jamais du client). E-mail de notification au bureau en bonus
(échec sans conséquence sur l'enregistrement), sujet suffixé « (espace
enseignant) ».

### 6.9 Bilan / tableau de bord (bureau, D11)

`GET /api/admin/enseignants/bilan?annee=YYYY-YYYY` (année en cours par défaut).
Renvoie :
- `annees` : les années scolaires présentes dans `teacher_quotes` /
  `teacher_invoices` (pour le sélecteur).
- `totaux` : par statut (devis validés / soumis / refusés, factures totales /
  remboursées / en attente) en montant + nombre ; `engage_cents` = devis
  validés + total factures.
- `classes` : une ligne par `class_label` rencontré, avec le cumul des devis
  validés et des factures **qui concernent cette classe**. Le montant entier
  est attribué à chaque classe concernée (un car partagé par 3 classes compte
  pour les 3) : les lignes peuvent se recouper, c'est voulu. `note_double_compte`
  rappelle qu'une facture rattachée à un devis validé est comptée dans les deux.

---

## 7. Points d'intégration pour le matin

Rien de tout cela n'est fait dans cette livraison (consigne : ne pas toucher
à `adminAuth.js`, à la page de connexion, à `components.js`).

### D0 — Renuméroter la migration
`supabase/migrations/0033_espace_enseignants.sql` : vérifier le dernier
numéro présent dans `supabase/migrations/` au moment de l'application et
renuméroter si besoin. **Puis l'appliquer à la main** dans l'éditeur SQL
Supabase et **vérifier par un `select` indépendant** (le « Success » de
l'éditeur peut être périmé). Ordre interne des `create table` : `teacher_ribs`
est créée **avant** `teacher_invoices` (qui la référence) — ne pas réordonner.

### I1 — Permission back-office (`app/lib/adminAuth.js`)
Ajouter au tableau `PERMISSIONS` :
```js
{ key: "enseignants", label: "Devis et factures des enseignants" },
```
Tant que ce n'est pas fait, l'onglet n'apparaît pas et les routes
`/api/admin/enseignants/*` renvoient 403 (échec sûr). Ensuite, accorder le
droit `enseignants` aux membres du bureau concernés depuis l'onglet « Accès ».

### I2 — Navigation back-office (`app/admin/admin-shell.js`)
Ajouter au tableau `ONGLETS` (par ex. juste après `remboursements`) :
```js
{ href: "/admin/enseignants", label: "Enseignants", perm: "enseignants" },
```

### I3 — Redirection par rôle
- Créer une route type `GET /api/moi/espace` qui lit le jeton et renvoie
  `resoudreEspace(admin, user.id)` (`app/lib/redirectionRole.js`, fourni).
- `app/connexion/page.js` : remplacer `router.push("/espace-adherent")` par
  un appel à cette route puis `router.push(cible)`.
- `app/activer-compte/page.js` : même chose après `signInWithPassword`
  (2 endroits : circuit jeton maison et circuit session Supabase).

### I4 — Lien vers l'espace enseignant (`app/components.js`)
Optionnel : ajouter un lien « Espace enseignant » dans le pied de page ou à
côté de « Espace adhérent ». La redirection par rôle depuis `/connexion` suffit
fonctionnellement ; un lien direct est un confort.

### I5 — Page `/confidentialite` (RGPD)
Ajouter une ligne sur les RIB (voir §9), en mentionnant la **suppression
automatique au remboursement** (D8). Fichier : `app/confidentialite/page.js`.

### I6 — Affichage de l'origine dans « Messages reçus »
`app/admin/messages/page.js` + `app/api/admin/messages/route.js` : renvoyer
`from_type` (déjà présent en base après migration) et afficher un badge +
un filtre par origine.

### I7 — Fusion des deux circuits d'invitation
`app/lib/invitationsEnseignants.js` est une copie de `app/lib/invitations.js`
avec `teacher_id` au lieu de `parent_id`. À terme, généraliser `invitations.js`
avec un paramètre `{ rattachement: { table, id } }` et supprimer la copie.
Laissé séparé cette nuit pour ne pas toucher au circuit parents en pleine
campagne de rentrée.

---

## 8. Améliorations ultérieures (non bloquantes)

- Brancher `from_type = 'parent'` sur le formulaire de contact de l'espace
  adhérent (`app/espace-adherent/page.js` utilise `FormulaireContact` avec
  `context="espace-adherent"` → passer aussi l'identité du parent connecté à
  une route dédiée, ou enrichir `/api/contact`).
- Idem `from_type = 'partenaire'` côté espace partenaire.
- Notification e-mail au(x) membre(s) du bureau ayant le droit `enseignants`
  à chaque nouveau devis/facture (aujourd'hui : rien, il faut aller voir).
- Filtrer les devis/factures par année scolaire dans le back-office (le Bilan
  a déjà le filtre ; l'étendre aux onglets Devis et Factures).
- Export CSV des factures remboursées pour la trésorerie.
- Laisser l'enseignant rattacher une facture à un de ses devis validés
  directement dans le formulaire (la route l'accepte déjà — D3 : non exposé
  pour l'instant).
- Purge des devis/factures anciens : politique de rétention à définir (D8 ne
  couvre que le fichier RIB).

**Fait dans la 2ᵉ passe (30 août) :** re-consultation des pièces par
l'enseignant (D6), récap par classe + tableau de bord (D11), purge RIB au
remboursement (D8), compte partagé parent/enseignant (D1).

---

## 9. RGPD — RIB (donnée sensible)

Le RIB (coordonnées bancaires) est une donnée personnelle sensible.
Dispositions prises dans le code :

- Stockage dans le bucket Supabase **privé** `remboursements` (jamais d'URL
  publique).
- Accès en lecture **uniquement** via des routes serveur : côté bureau,
  permission `enseignants` ; côté enseignant, vérification stricte de
  propriété. Les deux renvoient une **URL signée expirant en 5 minutes**.
- Aucune coordonnée bancaire n'est saisie ni stockée en clair en base : que
  le **chemin d'un fichier**.
- Le back-office ne liste jamais le contenu d'un RIB, seulement son libellé et
  sa date.
- **Rétention minimale (D8)** : le fichier RIB est **supprimé automatiquement
  du bucket dès que la facture correspondante passe à « remboursée »**. Une
  fois le virement fait, le RIB ne sert plus. Seule reste une trace booléenne
  (« un RIB avait été fourni ») + la date de suppression. Un RIB réutilisable
  (`teacher_ribs`) n'est purgé qu'au dernier remboursement qui l'utilise.

**Fait (I5)** : mention ajoutée sur `/confidentialite` (bloc « Espaces
partenaires et enseignants ») —
« Les enseignants peuvent déposer, pour obtenir un remboursement, les factures
de prestations engagées pour l'association ainsi que le relevé d'identité
bancaire (RIB) du bénéficiaire du paiement — le leur, ou celui d'un prestataire
à régler. Le RIB est stocké de façon privée, accessible aux seuls membres du
bureau habilités, et supprimé automatiquement dès que le remboursement
correspondant est effectué. Les prestataires n'ont pas d'accès au site. »

Précision : **les prestataires n'ont pas de compte sur le site**. C'est
l'enseignant qui dépose la facture du prestataire ET le RIB du bénéficiaire
(le sien, ou celui du prestataire à régler).

---

## 10. Décisions (tranchées par Thomas le 30 août — appliquées)

| # | Décision | Ce qui a été fait dans le code |
|---|---|---|
| **D1** | Un même compte `auth.users` **peut** être lié à la fois à `parents` et à `teachers`. Redirection : **bureau > enseignant > parent**. | Aucune unicité inter-tables ne l'empêche (commentaire ajouté dans la migration). `envoyerInvitationEnseignant` : si le compte existe déjà et est confirmé, on **rattache la fiche `teachers` sans créer de compte ni envoyer d'e-mail** ; l'UI Comptes affiche un message dédié. Ordre de priorité documenté et implémenté dans `redirectionRole.js`. |
| **D2** | Une seule permission `enseignants` (bureau). La direction **n'a pas** accès à l'onglet Comptes. Rôle `direction` = simple étiquette. | Inchangé : l'onglet Comptes est back-office (`requirePermission("enseignants")`). `role` n'ouvre aucun droit supplémentaire. |
| **D3** | Rattachement facture→devis : reste dans l'API, **pas** dans le formulaire. | Inchangé (route `POST /api/enseignant/factures` accepte `quoteId` avec contrôle de propriété ; formulaire sans ce champ). |
| **D4** | Montant **obligatoire > 0** sur devis et facture. | Inchangé (validation serveur + `check (amount_cents > 0)`). |
| **D5** | Messages enseignants = badge + filtre dans « Messages reçus », même boîte. L'affichage est un **point d'intégration partagé** (I6). | Ici : seule l'**écriture** `from_type='enseignant'` + `sender_teacher_id`. L'affichage n'est pas touché. |
| **D6** | **CHANGEMENT** : les enseignants **peuvent** re-consulter leurs pièces. | Nouvelle route `GET /api/enseignant/fichier?kind=…&id=…` avec vérification stricte de propriété + URL signée 5 min. Liens « Voir » ajoutés dans l'espace enseignant (devis, facture, RIB). |
| **D7** | Saisie libre des classes avant import ; « officialisées » à l'import. Rien d'auto, le bureau corrige. | Inchangé (repli saisie libre quand la liste dérivée est vide). |
| **D8** | **CHANGEMENT** : le fichier RIB est **supprimé au passage de la facture à `remboursee`**. | Migration : `teacher_ribs.rib_file_path` nullable + `purged_at` ; `teacher_invoices.rib_received`. `PATCH .../factures/[id]` purge le fichier (joint ou réutilisé si plus aucune facture non remboursée ne le référence). RGPD §9 + I5 mis à jour. UI : « RIB reçu — supprimé après remboursement ». |
| **D9** | = D2. | — |
| **D10** | 8 Mo, image ou PDF. | Inchangé. |
| **D11** | **OUI** : tableau de bord dans `/admin/enseignants` — total engagé sur l'année + **récap par classe** + filtre par année. | Nouvel onglet **Bilan** + route `GET /api/admin/enseignants/bilan?annee=…` (cartes chiffrées, table par classe sur `teacher_quote_classes` / `teacher_invoice_classes`). |
| **D12** | `/espace-enseignant`, périmètre titulaires + direction. | Inchangé. |

**Points encore ouverts (non bloquants)** : rétention des devis/factures
anciens (D8 ne couvre que le RIB) ; comportement exact si une facture
remboursée est repassée en « soumise » (le fichier RIB ne peut pas être
restauré — l'enseignant re-dépose si besoin).

---

## 11. Fichiers livrés

**Migration (NON appliquée)**
- `supabase/migrations/0033_espace_enseignants.sql`

**Modules `app/lib/`**
- `enseignantAuth.js` — `requireEnseignant(request)` (calque de `adminAuth.js`)
- `classes.js` — `listerClassesAnnee(admin, schoolYear)`
- `enseignantFichiers.js` — décodage Data URL, upload bucket privé, URL signée, `BUCKET`
- `invitationsEnseignants.js` — `envoyerInvitationEnseignant` (calque de `invitations.js`, + cas compte existant D1)
- `redirectionRole.js` — `resoudreEspace(admin, authUserId)` (à câbler, I3)

**Routes API espace enseignant** (`app/api/enseignant/…`, toutes `force-dynamic`)
- `moi/route.js` · `classes/route.js` · `devis/route.js` (GET/POST) ·
  `factures/route.js` (GET/POST) · `rib/route.js` (GET/POST) ·
  `messages/route.js` (POST) · **`fichier/route.js` (GET — D6, re-consultation
  de ses propres pièces)**

**Routes API back-office** (`app/api/admin/enseignants/…`, toutes `force-dynamic`, permission `enseignants`)
- **`bilan/route.js` (GET — D11, tableau de bord + récap par classe)**
- `devis/route.js` (GET) · `devis/[id]/route.js` (PATCH) · `devis/[id]/fichier/route.js` (GET)
- `factures/route.js` (GET) · `factures/[id]/route.js` (PATCH — **purge RIB D8**) · `factures/[id]/fichier/route.js` (GET)
- `rib/route.js` (GET) · `rib/[id]/fichier/route.js` (GET)
- `comptes/route.js` (GET/POST/PATCH)

**Pages**
- `app/espace-enseignant/page.js` — espace enseignant (mes devis / mes factures /
  mes RIB / contact bureau, liens « Voir » D6)
- `app/admin/enseignants/page.js` — back-office (onglets **Bilan** / Devis /
  Factures / RIB / Comptes)

**Doc**
- `docs/conception-espace-enseignants.md` (ce fichier)

`npm run build` passe (63 routes, aucune erreur de type ni de lint).
