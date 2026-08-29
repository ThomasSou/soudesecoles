# Espace enseignants / direction — conception

Document de conception rédigé pendant un travail de nuit autonome.
**Rien n'est en production.** Cette livraison contient : le modèle de données,
une migration SQL **non appliquée**, l'échafaudage des pages et des routes API
(le build `npm run build` passe), et la liste des décisions qui restent à
prendre. Le branchement de la page de connexion et des permissions est
volontairement laissé pour « le matin » (points d'intégration ci-dessous).

Date : 29 août 2026.

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
  rib_file_path  text NOT NULL
  created_at     timestamptz
```

Aucune colonne IBAN/BIC : uniquement le chemin du fichier.

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
  rib_file_path      text — OU RIB joint directement à cette facture
  admin_note         text
  reimbursed_at      timestamptz
  reimbursed_by      uuid → parents
  created_at         timestamptz
```

Le RIB d'une facture peut venir de deux sources : `rib_file_path` (fichier
joint au moment du dépôt) **ou** `rib_id` (un RIB déjà déposé). La route de
consultation gère les deux.

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
   avec statut et motif de refus le cas échéant.
2. **Mes factures** — formulaire (intitulé, prestataire, montant, sélecteur
   multi-classes obligatoire, fichier facture obligatoire, RIB : aucun /
   nouveau fichier / réutiliser un RIB déjà déposé) + historique avec statut
   et indication « RIB joint / RIB manquant ».
3. **Mes RIB** — dépôt d'un RIB en fichier (libellé facultatif) + liste.
4. **Écrire au bureau** — sujet + message → `contact_messages`.

Rattachement facultatif d'une facture à un devis : **prévu dans la route API**
(`quoteId`, vérifié comme appartenant à l'enseignant) mais **pas encore
exposé dans le formulaire** (décision D3). Le back-office affiche déjà
« rattachée à un devis » quand le lien existe.

### 5.2 Back-office — `/admin/enseignants` (`app/admin/enseignants/page.js`)

Via `AdminShell`, permission `enseignants`. Quatre onglets internes :

- **Devis** — filtre « À traiter » / « Tous ». Carte par devis : enseignant,
  classes (badges), montant, statut, « Voir le devis » (URL signée), note
  interne, boutons **Valider** / **Refuser** / **Remettre en attente**.
- **Factures** — filtre « À rembourser » / « Toutes ». Carte : enseignant,
  prestataire, classes, montant, statut, « Voir la facture », « Voir le RIB »
  (ou « RIB manquant » en rouge), note, boutons **Marquer remboursée** /
  **Remettre en attente**.
- **RIB** — liste de tous les RIB déposés (enseignant, libellé, date) +
  « Voir le RIB » (URL signée).
- **Comptes** — formulaire d'invitation (prénom, nom, e-mail, rôle) + liste
  des comptes avec état (« invitation en attente » / « compte activé » /
  « désactivé »), boutons **Basculer rôle** et **Désactiver / Réactiver**.

### 5.3 Messages reçus — back-office existant

La distinction d'origine est **écrite en base** (`from_type`,
`sender_teacher_id`) mais **pas encore affichée** : la page
`app/admin/messages/page.js` n'est **pas** modifiée dans cette livraison
(pour ne pas toucher au périmètre en cours). Ajout prévu §8 / décision D5 :
un badge « Parent » / « Partenaire » / « Enseignant » / « Site » sur chaque
message, et un filtre par origine.

---

## 6. Les flux

### 6.1 Invitation d'un enseignant

1. Bureau : onglet **Comptes** → saisit prénom/nom/e-mail/rôle → `POST
   /api/admin/enseignants/comptes`.
2. La route crée la fiche `teachers` (si l'e-mail n'existe pas déjà) puis
   appelle `envoyerInvitationEnseignant` :
   - **Sender configuré** : `createUser` (confirmé d'emblée) → jeton maison
     dans `invitations` (`teacher_id` renseigné) → e-mail Sender vers
     `/activer-compte?jeton=…`.
   - **Sender non configuré** : `inviteUserByEmail` (repli, e-mail Supabase).
3. L'enseignant clique le lien, choisit son mot de passe sur `/activer-compte`
   (route `/api/activer-compte` inchangée : elle affecte le mot de passe par
   `user_id`).
4. `teachers.auth_user_id` est renseigné → l'enseignant peut se connecter.

**Renvoi d'invitation** : re-`POST` sur le même e-mail régénère un jeton (la
fiche existe déjà, on ne la recrée pas). Message spécifique si le compte est
déjà activé (proposer « mot de passe oublié »).

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

### 6.6 Remboursement d'une facture (bureau)

`PATCH /api/admin/enseignants/factures/[id]` avec `{status, adminNote}`.
`status ∈ {soumise, remboursee}`. Sur `remboursee` : `reimbursed_at`,
`reimbursed_by`. **Le virement lui-même reste manuel** : ce statut ne fait
que suivre l'état, comme pour les remboursements parents.

### 6.7 Consultation des fichiers (bureau)

`GET /api/admin/enseignants/devis/[id]/fichier`
`GET /api/admin/enseignants/factures/[id]/fichier?type=facture|rib`
`GET /api/admin/enseignants/rib/[id]/fichier`
Chacune renvoie une **URL signée valable 5 minutes** vers le bucket privé.
Aucune URL publique. Les enseignants ne peuvent pas re-consulter leurs
propres fichiers via l'interface (comme les parents pour leurs factures) —
décision D6.

### 6.8 Message au bureau

`POST /api/enseignant/messages` → `insert contact_messages` avec
`from_type = 'enseignant'`, `sender_teacher_id`, `name`/`email` déduits de la
fiche `teachers` (jamais du client). E-mail de notification au bureau en bonus
(échec sans conséquence sur l'enregistrement), sujet suffixé « (espace
enseignant) ».

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
Ajouter une ligne sur les RIB (voir §9). Fichier concerné :
`app/confidentialite/page.js`.

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
- Filtrer les devis/factures par année scolaire dans le back-office.
- Export CSV des factures remboursées pour la trésorerie.
- Récapitulatif par classe : « combien le Sou a financé pour la classe X
  cette année » (les tables `*_classes` le permettent déjà).
- Laisser l'enseignant rattacher une facture à un de ses devis validés
  directement dans le formulaire (la route l'accepte déjà).
- Laisser l'enseignant re-télécharger ses propres pièces.

---

## 9. RGPD — RIB (donnée sensible)

Le RIB (coordonnées bancaires) est une donnée personnelle sensible.
Dispositions déjà prises dans le code :

- Stockage dans le bucket Supabase **privé** `remboursements` (jamais d'URL
  publique).
- Accès en lecture **uniquement** via des routes serveur protégées par la
  permission `enseignants`, qui renvoient une **URL signée expirant en
  5 minutes**.
- Aucune coordonnée bancaire n'est saisie ni stockée en clair en base : que
  le **chemin d'un fichier**.
- Le back-office ne liste jamais le contenu d'un RIB, seulement son libellé et
  sa date.

**À faire (I5)** : ajouter sur `/confidentialite` une mention du type —
« Les enseignants et prestataires peuvent déposer un relevé d'identité
bancaire (RIB) pour être remboursés de frais engagés pour l'association. Ce
document est stocké de façon privée, accessible aux seuls membres du bureau
habilités, et conservé le temps du traitement comptable puis supprimé. »
Prévoir aussi une procédure de purge (suppression des fichiers RIB après
N mois) — décision D8.

---

## 10. Décisions / ambiguïtés à trancher (Thomas)

| # | Question | Hypothèse retenue dans l'échafaudage |
|---|---|---|
| **D1** | Les enseignants sont-ils une entité **séparée** des parents, ou un enseignant qui est aussi parent a-t-il **un seul compte** ? | Table `teachers` **séparée**. Un enseignant-parent aura potentiellement deux comptes (deux e-mails, ou le même e-mail refusé par l'unicité `auth.users`). À trancher : autoriser un même compte `auth.users` à être lié à la fois à un `parents` et un `teachers` ? La redirection par rôle donne alors priorité au bureau, puis enseignant, puis parent. |
| **D2** | Qui peut inviter des enseignants et traiter leurs devis/factures ? | Permission unique `enseignants`. Faut-il séparer « inviter » de « traiter » ? Faut-il donner ce droit à la direction elle-même (un compte `teachers` avec accès à l'onglet Comptes) ? Non prévu : l'onglet Comptes est back-office only. |
| **D3** | Rattacher une facture à un devis : utile dans le formulaire enseignant ? | Prévu dans l'API, **pas exposé** dans le formulaire. À confirmer : les enseignants voudront-ils faire ce lien, ou c'est au bureau de le constater ? |
| **D4** | Montant : le devis et la facture ont-ils **toujours** un montant connu à la saisie ? | Oui, montant **obligatoire** > 0. Si une facture peut arriver « montant à déterminer », il faut assouplir. |
| **D5** | « Messages reçus » : un simple badge d'origine suffit-il, ou faut-il router les messages enseignants vers une autre boîte / d'autres destinataires ? | Badge + filtre (I6). Même boîte `contact_messages`, même notification `CONTACT_EMAIL`. |
| **D6** | Les enseignants peuvent-ils **re-consulter** leurs pièces déposées (devis, facture, RIB) ? | Non (aligné sur les parents). Facile à ajouter (route `/api/enseignant/fichier` avec vérification de propriété). |
| **D7** | Libellés de classes saisis en **saisie libre** (avant import) : que faire quand l'import arrive avec des libellés différents ? | Rien d'automatique. Le bureau corrige à la main les `*_classes` des dépôts concernés si besoin. Acceptable vu le volume attendu (quelques dépôts en tout début d'année). |
| **D8** | Durée de conservation des RIB et des factures ? Purge automatique ? | Non implémentée. À définir (ex. suppression des fichiers RIB 6 mois après le dernier remboursement associé). |
| **D9** | Rôle `direction` : a-t-il des droits **en plus** de `enseignant` dans l'espace enseignant (voir les devis des collègues, valider à la place du bureau…) ? | Non. `direction` est aujourd'hui juste une étiquette. Même espace, mêmes possibilités qu'un enseignant. |
| **D10** | Taille max des fichiers : 8 Mo (repris des remboursements parents). OK pour des devis/factures scannés ? | Conservé à 8 Mo, image ou PDF uniquement. |
| **D11** | Faut-il un montant total / tableau de bord « budget enseignants engagé cette année » dans le back-office ? | Non fait. Les données le permettent (voir §8). |
| **D12** | Nom de l'espace et de l'URL : `/espace-enseignant` au singulier. OK ? Les remplaçants, ATSEM, intervenants extérieurs sont-ils concernés ? | `/espace-enseignant`. Périmètre = enseignants titulaires + direction. Élargir si besoin (rôle supplémentaire dans le `check`). |

---

## 11. Fichiers livrés

**Migration (NON appliquée)**
- `supabase/migrations/0033_espace_enseignants.sql`

**Modules `app/lib/`**
- `enseignantAuth.js` — `requireEnseignant(request)` (calque de `adminAuth.js`)
- `classes.js` — `listerClassesAnnee(admin, schoolYear)`
- `enseignantFichiers.js` — décodage Data URL, upload bucket privé, URL signée
- `invitationsEnseignants.js` — `envoyerInvitationEnseignant` (calque de `invitations.js`)
- `redirectionRole.js` — `resoudreEspace(admin, authUserId)` (à câbler, I3)

**Routes API espace enseignant** (`app/api/enseignant/…`, toutes `force-dynamic`)
- `moi/route.js` · `classes/route.js` · `devis/route.js` (GET/POST) ·
  `factures/route.js` (GET/POST) · `rib/route.js` (GET/POST) ·
  `messages/route.js` (POST)

**Routes API back-office** (`app/api/admin/enseignants/…`, toutes `force-dynamic`, permission `enseignants`)
- `devis/route.js` (GET) · `devis/[id]/route.js` (PATCH) · `devis/[id]/fichier/route.js` (GET)
- `factures/route.js` (GET) · `factures/[id]/route.js` (PATCH) · `factures/[id]/fichier/route.js` (GET)
- `rib/route.js` (GET) · `rib/[id]/fichier/route.js` (GET)
- `comptes/route.js` (GET/POST/PATCH)

**Pages**
- `app/espace-enseignant/page.js` — espace enseignant (squelette fonctionnel)
- `app/admin/enseignants/page.js` — back-office (onglets Devis / Factures / RIB / Comptes)

**Doc**
- `docs/conception-espace-enseignants.md` (ce fichier)

`npm run build` passe (60 pages générées, aucune erreur de type ni de lint).
