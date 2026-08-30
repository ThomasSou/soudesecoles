# Espace partenaires — conception et échafaudage

Document de conception rédigé pendant deux passes de travail de nuit autonome
(29 puis 30 août 2026). Il accompagne un **échafaudage** : migrations non
appliquées, pages et routes API qui compilent (`npm run build` OK) mais **non
testées en conditions réelles**. À relire et arbitrer avant de finaliser.

Objectif : donner aux partenaires (entreprises, commerçants qui soutiennent le
Sou) un espace connecté sur le même modèle que l'espace famille, et au bureau
un back-office pour les gérer.

**Passe 2 (30 août)** — Thomas a tranché les décisions du §6 (voir la colonne
« Tranché » de ce paragraphe). Elles sont appliquées dans le code. Nouvelle
brique ajoutée : **messages « nouveautés » des partenaires** (§3.4, §4, §8).
Migrations ajoutées / modifiées : `0034` (niveaux Or/Argent/Bronze),
`0038` (messages). L'e-mailing mensuel récurrent reste un **chantier de
suite** documenté au §8, non codé.

---

## 1. Ce qui existait déjà avant ce travail

| Élément | État avant |
|---|---|
| Table `partenaires` | `id, nom, pin_code, active, created_at` (migration 0020) |
| Connexion partenaire | **Code PIN à 4 chiffres** stocké en `localStorage`, revérifié à chaque appel API. Pas de compte Supabase. |
| Page `/partenaire` | Saisie du PIN → gestion de ses avantages (créer, activer/désactiver, changer la limite). |
| Avantages | Table `avantages` (`label, type interne/partenaire, partenaire_id, requiert_adhesion, limite, active`). Consommation tracée dans `avantage_utilisations` (`avantage_id, family_id, used_at, used_by`). |
| Validation d'un avantage | La famille montre sa carte (QR) → `/verifier-adhesion/[token]` → le partenaire saisit son PIN → route `/api/partenaire/valider` insère une ligne d'utilisation, dans la limite `avantages.limite`. |
| Back-office partenaires | Section de `/admin/avantages` : créer un partenaire (nom seul, PIN auto), activer/désactiver, régénérer le PIN. |
| Page publique `/partenaires` | **Contenu statique** dans `app/partenaires/data.js` (logos, descriptions). Aucun lien avec la table `partenaires`. |
| Auth des familles | `parents.id` (autonome) + `parents.auth_user_id` (FK `auth.users`, nullable ; découplage migration 0025). Invitation : `app/lib/invitations.js` → jeton maison + Sender si configuré, sinon `inviteUserByEmail`. Activation : `/activer-compte?jeton=…` → `/api/activer-compte` → mot de passe → `/espace-adherent`. |
| `contact_messages` | `name, email, subject, message, handled, reply_body, replied_at, replied_by`. Pas de notion d'origine. |
| Dernière migration | `0032_email_contacts.sql`. |
| Permissions back-office | `app/lib/adminAuth.js` → tableau `PERMISSIONS`. Clé utilisée pour les partenaires/avantages : `avantages`. |

### Choix de fond : on **étend**, on ne remplace pas

Le PIN et la table `partenaires` sont déjà câblés à la consommation d'avantages
au comptoir. On garde ce circuit **intact** et on **ajoute par-dessus** :

- un vrai compte e-mail/mot de passe (`partenaires.auth_user_id`) pour
  **l'espace partenaire** (paiements, période, avantages, documents, contact) ;
- le **PIN reste** l'outil de validation au comptoir sur `/verifier-adhesion`
  (le vendeur à la caisse saisit un PIN, il ne se connecte pas).

Les deux coexistent sur la même ligne `partenaires`.

---

## 2. Modèle de données proposé

Fichiers de migration livrés (numéros **provisoires**, cf. §5) :

| Fichier | Contenu |
|---|---|
| `0033_partenaires_comptes.sql` | `ALTER partenaires` (coordonnées + compte) ; `ALTER invitations` (`partenaire_id`) |
| `0034_partenaires_periodes_paiements.sql` | **`niveaux_partenaire`** (Or/Argent/Bronze + quotas), `partenaire_periodes` (niveau figé, FK vers `niveaux_partenaire`), `partenaire_paiements` |
| `0035_avantages_historique.sql` | `ALTER avantages` (`description`, `updated_at`) ; `avantage_evenements` |
| `0036_partenaire_documents.sql` | `partenaire_documents` + bucket Storage privé `partenaire-documents` |
| `0037_contact_messages_source.sql` | `ALTER contact_messages` (`source`, `auteur_parent_id`, `auteur_partenaire_id`) |
| `0038_partenaire_messages.sql` | **`partenaire_messages`** (messages « nouveautés » email/réseau) + bucket privé `partenaire-messages` |

Toutes : RLS **activé**, **aucune policy publique** — l'accès passe par les
routes serveur (clé de service).

### 2.1 `partenaires` (colonnes ajoutées)

```
email            text     -- sert à l'invitation ; unique (index partiel lower(email))
contact_nom      text     -- personne référente chez le partenaire
telephone        text
adresse          text
code_postal      text
ville            text
site_web         text
notes            text     -- notes internes bureau, JAMAIS renvoyées au partenaire
slug             text     -- rapprochement futur avec app/partenaires/data.js
auth_user_id     uuid     -- FK auth.users(id) on delete set null ; unique partiel
created_by       uuid     -- FK parents(id)
updated_at       timestamptz
```

`pin_code` devient **nullable** (un partenaire « espace seulement », qui ne
valide jamais d'avantage au comptoir, n'a pas besoin de PIN — le back-office en
génère quand même un par défaut à la création).

### 2.1 bis `niveaux_partenaire` — les 3 niveaux et leurs quotas

Liste **fermée** : `or`, `argent`, `bronze`. Créés et pré-remplis par la
migration `0034`. Le bureau les règle depuis `/admin/partenaires/niveaux`.

```
niveau           text pk  check in ('or','argent','bronze')
libelle          text     -- "Or" / "Argent" / "Bronze"
ordre            integer  -- 1 / 2 / 3 (ordre d'affichage et de passage dans l'e-mailing)
quota_email      integer  -- messages « nouveautés » e-mail autorisés par mois
quota_reseau     integer  -- idem type réseaux sociaux (prévu, pas d'écran)
quota_avantages  integer  -- nb max d'avantages ACTIFS (null = illimité)
contreparties    text     -- texte libre décrivant ce que le niveau donne droit
updated_at, updated_by
```

Valeurs semées par défaut (modifiables) : Or 3/3/illimité, Argent 1/1/5,
Bronze 0/0/2.

### 2.2 `partenaire_periodes` — période de partenariat

```
id                     uuid pk
partenaire_id          uuid  -> partenaires(id) on delete cascade
debut                  date  not null            -- 100 % libre, AUCUN calage sur l'année scolaire
fin                    date  not null            -- check (fin >= debut)
niveau                 text  -> niveaux_partenaire(niveau)   -- FIGÉ sur la période (facultatif)
montant_annonce_cents  integer                   -- montant de partenariat annoncé (facultatif)
note                   text
annulee                boolean default false     -- on annule plutôt que de supprimer
created_at, created_by
```

Un partenaire est **« à jour »** si la date du jour tombe dans une période non
annulée (`statutPeriodePartenaire()` dans `app/lib/partenaires.js`). Le
**niveau applicable** à un partenaire à un instant T = le `niveau` de sa
période active (`niveauActifPartenaire()`). Pas de changement de niveau en
cours de période : pour changer, on clôt la période et on en ouvre une autre.

**Suppression d'une période interdite** si un paiement y est rattaché (409
côté route) — utiliser « Annuler ».

### 2.3 `partenaire_paiements` — historique des versements (saisie manuelle)

```
id             uuid pk
partenaire_id  uuid  -> partenaires(id) on delete cascade
periode_id     uuid  -> partenaire_periodes(id) on delete set null   -- rattachement facultatif
montant_cents  integer not null  (> 0)
recu_le        date    not null                 -- date où le virement a été constaté
moyen          text    default 'virement'  in ('virement','cheque','especes','autre')
reference      text                              -- réf. virement / n° chèque
note           text
created_at, created_by
```

Aucune écriture par le partenaire : **lecture seule** côté espace partenaire.
Cette table ne déplace pas d'argent, elle en garde la trace (même principe que
`reimbursement_requests`).

### 2.4 `avantages` (colonnes ajoutées) + `avantage_evenements`

- `avantages.limite` **EST déjà** « la quantité offerte par famille » demandée
  par Thomas. L'espace partenaire l'affiche sous ce nom. Pas de colonne en plus.
- `avantages.description` : texte détaillé facultatif, en plus du libellé court.
- `avantages.updated_at` : pour le suivi.
- **Quota d'avantages actifs** : `niveaux_partenaire.quota_avantages` (selon le
  niveau de la période active ; `null` = illimité). Vérifié à la création d'un
  avantage par le partenaire (`/api/partenaire/mes-avantages` POST → 409 si
  dépassé). Non appliqué hors période active (le partenaire garde la main).

```
avantage_evenements
  id             uuid pk
  avantage_id    uuid -> avantages(id) on delete cascade
  partenaire_id  uuid -> partenaires(id) on delete set null
  action         text in ('cree','modifie','active','desactive','supprime')
  details        jsonb   -- instantané {label, description, limite, requiert_adhesion, active}
  auteur         text    -- "partenaire" ou nom du membre du bureau (libellé libre : un
                          --  partenaire n'a pas de ligne dans `parents`)
  created_at
```

Le **suivi d'usage** demandé se lit sur deux tables :
- **offres proposées** → `avantage_evenements` (frise « qui a proposé quoi, et
  depuis quand ») ;
- **consommation par les familles** → `avantage_utilisations` (déjà existant,
  déjà affiché par avantage dans `/admin/avantages`).

### 2.5 `partenaire_documents` — documents déposés par le bureau

```
id             uuid pk
partenaire_id  uuid -> partenaires(id) on delete cascade
titre          text not null
description    text
chemin         text not null        -- chemin dans le bucket privé "partenaire-documents"
type_mime      text
taille_octets  integer
depose_le      timestamptz
depose_par     uuid -> parents(id)
```

Bucket Storage **privé** `partenaire-documents` (comme `remboursements`). Accès
par **URL signée 5 min** :
- bureau → `GET /api/admin/partenaires/[id]/documents/[docId]` ;
- partenaire → `GET /api/partenaire/documents/[id]` (vérifie que le doc lui
  appartient).

### 2.6 `contact_messages` (colonnes ajoutées)

```
source                text not null default 'public'
                        check in ('public','parent','partenaire','enseignant')
auteur_parent_id      uuid -> parents(id) on delete set null
auteur_partenaire_id  uuid -> partenaires(id) on delete set null
```

Compatibilité : les lignes existantes deviennent `'public'`. La route publique
`/api/contact` **n'est pas modifiée** (valeur par défaut). Seules les routes
authentifiées renseignent une autre source. Le formulaire de l'espace
partenaire passe par **`/api/partenaire/contact`** (nouvelle route) qui écrit
`source='partenaire'` + `auteur_partenaire_id`, et pousse la notification SMTP
comme `/api/contact`.

### 2.7 `partenaire_messages` — messages « nouveautés »

```
id             uuid pk
partenaire_id  uuid -> partenaires(id) on delete cascade
type           text  in ('email','reseau')   -- 'email' construit ; 'reseau' prévu (schéma seulement)
titre          text not null
texte          text not null
image_chemin   text          -- 1 image, bucket privé "partenaire-messages"
lien           text          -- URL libre choisie par le partenaire
statut         text  in ('brouillon','soumis','valide','refuse','publie')  default 'brouillon'
mois_cible     text          -- 'AAAA-MM' pour le type e-mail (mois de parution visé)
motif_refus    text
soumis_le, valide_le, valide_par (-> parents), publie_le
created_at, updated_at
```

- **Quota** = celui du niveau de la période active :
  `niveaux_partenaire.quota_email` (type `email`) ou `quota_reseau`. Le
  décompte du mois ignore `brouillon` et `refuse` (`compterMessagesMois()`).
  Sans période active → quota 0, soumission refusée.
- Le partenaire ne modifie que ses messages en `brouillon` ou `refuse` ;
  `soumis`/`valide`/`publie` sont verrouillés côté route.
- Le bureau **valide** (→ `valide`) ou **refuse avec motif** (→ `refuse`).
- Le passage à `publie` / `publie_le` est réservé au **chantier e-mailing**
  (§8) — jamais fait par les écrans actuels.
- Bucket privé `partenaire-messages` : URL signée 5 min
  (`GET /api/partenaire/messages/[id]` côté partenaire,
  `GET /api/admin/partenaire-messages/[id]` côté bureau). Le chantier e-mailing
  devra décider comment exposer l'image dans un vrai e-mail (bucket public
  dédié / copie / URL signée longue).

---

## 3. Écrans

### 3.1 Back-office (`/admin/partenaires`, onglet ajouté à `admin-shell.js`)

**Liste — `app/admin/partenaires/page.js`**
- Liens en tête : « Messages nouveautés à modérer », « Niveaux et quotas ».
- Bouton « + Nouveau partenaire » → formulaire complet (nom, e-mail, référent,
  téléphone, adresse, CP, ville, site web, notes). PIN de comptoir généré
  d'office. L'invitation part séparément depuis la fiche.
- Une ligne par partenaire : ville, nombre d'avantages, total encaissé, deux
  badges (« Partenariat à jour / Hors période », « Espace activé / non activé »).
  Clic → fiche détail.

**Fiche détail — `app/admin/partenaires/[id]/page.js`** (5 sections)
1. **Coordonnées** : édition de tous les champs ; boutons « Envoyer /
   Renvoyer l'invitation », « Désactiver / Réactiver » ; affichage + régénération
   du PIN comptoir ; état de l'espace (activé ?).
2. **Période de partenariat** : liste (avec annuler / rétablir / supprimer —
   **suppression refusée si un paiement est rattaché**) + formulaire d'ajout
   (début, fin **libres**, niveau = **liste fermée Or / Argent / Bronze**,
   montant annoncé, note).
3. **Paiements reçus** : liste + total encaissé + formulaire d'ajout (montant,
   date de réception, moyen, référence, rattachement facultatif à une période,
   note) ; suppression d'une ligne (autorisée).
4. **Avantages offerts** : lecture seule (le partenaire les gère lui-même) —
   libellé, quantité/famille, nombre d'utilisations, statut ; puis
   **Historique des offres** (frise `avantage_evenements`).
5. **Documents partagés** : liste (voir / supprimer) + dépôt (titre,
   description, fichier image ou PDF ≤ 10 Mo).

**Niveaux et quotas — `app/admin/partenaires/niveaux/page.js`**
Édition des 3 lignes `niveaux_partenaire` : libellé, quota e-mail/mois, quota
réseau/mois, avantages actifs max (vide = illimité), contreparties (texte
libre). Route : `GET`/`PATCH /api/admin/niveaux-partenaire`.

**Modération des messages — `app/admin/partenaires/messages/page.js`**
File d'attente filtrable (à modérer / validés / refusés / publiés / tous).
Chaque carte : partenaire, titre, texte, lien, aperçu image (URL signée),
mois de parution, statut. Actions : **Valider**, **Refuser** (motif
obligatoire). Routes : `GET /api/admin/partenaire-messages?statut=…`,
`PATCH /api/admin/partenaire-messages/[id]` (`{decision:"valide"}` ou
`{decision:"refuse", motif}`), `GET /api/admin/partenaire-messages/[id]`
(URL signée image).

### 3.2 Espace partenaire (`/partenaire`, réécrit)

Authentification Supabase (même `createClient()` que `/espace-adherent`).
États : `chargement` / `anonyme` (invite à `/connexion`) / `refuse` (compte non
rattaché à un partenaire) / `connecte`.

Sections :
1. **En-tête** : nom + statut « Partenariat à jour — niveau X (jusqu'au …) » ou
   « Aucune période en cours » ; contreparties du niveau si renseignées.
2. **Mes versements** : liste + total, **lecture seule**, avec invitation à
   signaler une erreur via le formulaire de contact.
3. **Les avantages que j'offre** : « + Nouvel avantage » (libellé, précisions,
   quantité par famille, réservé aux adhérents) → **publié immédiatement, sans
   validation** ; refus 409 si le quota d'avantages actifs du niveau est
   atteint. Par ligne : modifier (libellé + quantité), masquer / remettre en
   ligne. Nombre d'utilisations affiché.
4. **Mes messages « nouveautés »** : rappel du quota du mois (niveau, total,
   restant) ; « + Rédiger un message » (titre, texte, 1 image, 1 lien) →
   **soumis directement au bureau** ; liste de ses messages avec statut et
   motif de refus éventuel. Routes `/api/partenaire/messages(+/[id])`.
5. **Documents partagés par le bureau** : téléchargement via URL signée.
6. **Contacter le bureau** : sujet + message → `/api/partenaire/contact`.

### 3.3 Page publique `/partenaires`

**Inchangée** (statique). Rapprochement avec la table `partenaires` (colonne
`slug`) : hors périmètre, cf. décisions §6.

---

## 4. Flux

**Création d'un partenaire** — bureau : `/admin/partenaires` → formulaire →
`POST /api/admin/partenaires` (crée la ligne, PIN auto, `created_by`).

**Invitation / activation** — bureau : fiche → « Envoyer l'invitation » →
`POST /api/admin/partenaires/[id]/inviter` → `envoyerInvitationPartenaire()`
(`app/lib/partenaires.js`, copie assumée du circuit familles) :
- Sender configuré → `createUser` (confirmé), ligne `invitations`
  (`partenaire_id` renseigné), e-mail via Sender avec lien
  `/activer-compte?espace=partenaire&jeton=…` ;
- sinon → `inviteUserByEmail(redirectTo=/activer-compte?espace=partenaire)`.
Puis le partenaire choisit son mot de passe → `/api/activer-compte`
(inchangée, ne lit que `user_id`) → redirection vers `/partenaire` grâce au
paramètre `espace` ajouté à `/activer-compte` (cf. §5).

**Période + paiements** — bureau uniquement, via la fiche détail
(`/periodes`, `/paiements` et leurs sous-routes `[periodeId]` / `[paiementId]`).

**Avantages + suivi d'usage** — partenaire : `/api/partenaire/mes-avantages`
(POST) et `/api/partenaire/mes-avantages/[id]` (PATCH), authentifiées par le
jeton Supabase (plus par PIN). Chaque opération écrit dans
`avantage_evenements` (`tracerEvenementAvantage`, best-effort). La consommation
au comptoir (`/api/partenaire/valider`) reste **au PIN**, inchangée.

**Documents** — bureau dépose (`POST …/documents`, fichier en data URL vers le
bucket privé) ; partenaire télécharge (`GET /api/partenaire/documents/[id]` →
URL signée 5 min).

**Contact** — partenaire : `POST /api/partenaire/contact` → insertion
`contact_messages` (`source='partenaire'`, `auteur_partenaire_id`) + e-mail de
notification. Apparaît dans « Messages reçus » ; distinction d'origine à
afficher dans `/admin/messages` (cf. §5).

**Messages « nouveautés »** —
1. Partenaire : rédige (titre, texte, image, lien) et soumet →
   `POST /api/partenaire/messages` avec `soumettre: true`. La route vérifie le
   quota du niveau de la période active pour le mois cible (défaut = mois
   courant). Statut `soumis`.
2. Bureau : `/admin/partenaires/messages` → **Valider** (`valide`) ou
   **Refuser** avec motif (`refuse`). Un message refusé redevient modifiable
   par le partenaire, qui peut le corriger et re-soumettre
   (`PATCH /api/partenaire/messages/[id]` avec `soumettre: true`).
3. Publication mensuelle → **chantier de suite §8** : passage à `publie` /
   `publie_le` lors de la génération de l'e-mail « Les nouveautés de nos
   partenaires ». Non implémenté ici.

**Comptoir (décision 1, NON codé ici)** — la validation d'un avantage sur
`/verifier-adhesion` garde le **PIN** pour le personnel du partenaire ; un
membre du **bureau connecté** doit pouvoir valider **sans PIN** (bouton
direct). `/verifier-adhesion` n'est pas touché ici (un bug y est traité à
part). À l'intégration : le composant `panneau-avantage.js` récupère la
session Supabase et, si `/api/admin/moi` répond OK, propose la validation via
`/api/admin/avantages/valider` sans demander de PIN.

---

## 5. Points d'intégration à faire à la main au matin

> Rien ci-dessous n'a été fait pour ne pas empiéter sur le périmètre interdit
> (adminAuth.js, page de connexion, `components.js`, e-mails) ni sur le
> sous-agent « espace enseignants ».

### 5.1 Renumérotation des migrations — **obligatoire avant application**
Les fichiers sont nommés `0033`…`0038` en supposant que rien ne s'est ajouté
après `0032`. Si d'autres migrations ont été créées entre-temps, **renuméroter
en une série continue** avant de coller dans l'éditeur SQL Supabase. Les
appliquer **dans l'ordre** : `0034` crée `niveaux_partenaire` avant
`partenaire_periodes` (FK), `0038` référence `partenaires` et
`niveaux_partenaire`. Penser à **vérifier chaque écriture par un `select`
indépendant** (piège Supabase connu). Buckets Storage créés par les
migrations : `partenaire-documents` (0036), `partenaire-messages` (0038),
tous deux privés.

### 5.2 `app/lib/adminAuth.js` — permission dédiée `partenaires` (décidé : OUI)
Aujourd'hui tout le module partenaires utilise la permission **`avantages`**
(constante `PERM = "avantages"` dans chaque route). Pour créer la permission
dédiée décidée par Thomas :
1. ajouter dans le tableau `PERMISSIONS` de `app/lib/adminAuth.js` :
   `{ key: "partenaires", label: "Partenaires (fiches, périodes, paiements, documents, messages, niveaux)" },`
2. remplacer `"avantages"` par `"partenaires"` dans la constante `PERM` de :
   - `app/api/admin/partenaires/route.js` et tout `app/api/admin/partenaires/**`
   - `app/api/admin/partenaire-messages/route.js` (+ `[id]`)
   - `app/api/admin/niveaux-partenaire/route.js`
   et dans `app/admin/admin-shell.js` (ligne de l'onglet `/admin/partenaires`).
3. accorder la permission aux membres du bureau concernés (écran `/admin/acces`).

Tant que ce n'est pas fait, **c'est fonctionnel** : les personnes ayant
« Avantages » voient et gèrent les partenaires.

### 5.3 Page de connexion unique + redirection selon le rôle
`app/connexion/page.js` fait aujourd'hui `router.push("/espace-adherent")` en
dur. Pour la connexion unique (parent / partenaire / enseignant / bureau) :
après `signInWithPassword`, appeler **`GET /api/roles`** (déjà écrite, à
compléter par le sous-agent enseignants) qui renvoie
`{ role, estAdmin, estPartenaire, redirect }`, puis `router.push(data.redirect)`.
- `redirect` vaut `/admin` (bureau), `/partenaire` (partenaire),
  `/espace-adherent` (défaut).

### 5.4 `/activer-compte`
**Fait dans l'échafaudage** (hors périmètre interdit) : lecture du paramètre
`?espace=partenaire` → redirection vers `/partenaire` au lieu de
`/espace-adherent`. À revoir si l'équipe préfère que `/activer-compte` appelle
`/api/roles` comme la page de connexion (plus robuste, ignore le paramètre
d'URL).

### 5.5 `app/components.js` (navigation) — non modifié (décidé : lien discret au pied de page)
Ajouter, dans le `Footer()` de `app/components.js`, un lien discret vers
`/partenaire` (à côté de « Espace adhérent » / dans la colonne « Contact » ou
la barre de liens légaux). Libellé suggéré : « Espace partenaire ». Aujourd'hui
`/partenaire` n'est atteignable que par URL directe ou après redirection de
connexion.

### 5.9 Comptoir `/verifier-adhesion` — bouton bureau sans PIN (décidé)
Cf. §4, dernier point. `panneau-avantage.js` doit, quand une session Supabase
admin est présente, valider via `/api/admin/avantages/valider` **sans**
demander de PIN ; le PIN reste la voie pour le personnel du partenaire.
Non fait ici (fichier `/verifier-adhesion` gelé : un bug distinct y est
traité).

### 5.6 `app/admin/messages/page.js` — afficher l'origine
La colonne `contact_messages.source` existe (migration 0037) mais l'écran
« Messages reçus » ne l'affiche pas encore. À ajouter : un badge
parent / partenaire / enseignant / public, en lisant `source` (et
éventuellement un lien vers la fiche via `auteur_partenaire_id`). La route
`app/api/admin/messages/route.js` renvoie déjà `select("*")`, donc `source`
remonte sans changement côté API.

### 5.7 Formulaire de contact de l'espace **famille**
`/espace-adherent` poste toujours vers `/api/contact` (donc `source='public'`).
Pour marquer ces messages `source='parent'`, deux options :
- étendre `/api/contact` pour accepter un `Authorization: Bearer` optionnel et
  résoudre le parent (le plus simple, une seule route) ;
- ou créer `/api/parent/contact` sur le modèle de `/api/partenaire/contact`.
Non tranché — cf. §6.

### 5.8 Anciennes routes PIN devenues orphelines
`/api/partenaire/connexion`, `/api/partenaire/avantages`,
`/api/partenaire/avantages/creer`, `/api/partenaire/avantages/[id]` n'étaient
utilisées que par l'ancienne page `/partenaire` (à code PIN). Elles restent en
place (aucune régression) mais peuvent être supprimées une fois la nouvelle
page validée. **Ne pas toucher** à `/api/partenaire/pour-famille` et
`/api/partenaire/valider` : encore utilisées par `/verifier-adhesion`.

---

## 6. Décisions de Thomas (30 août) — appliquées

| # | Décision | État dans le code |
|---|---|---|
| 1 | Comptoir : **PIN gardé** pour le personnel du partenaire ; **bureau connecté = validation sans PIN** (bouton direct). `/verifier-adhesion` NON modifié (bug traité à part). | Documenté §4 / §5.9. `panneau-avantage.js` à retoucher à l'intégration. |
| 2 | **Un seul compte par partenaire.** | Tel quel (`partenaires.auth_user_id` unique). |
| 3 | Période : **dates 100 % libres**, aucun pré-remplissage sur l'année scolaire. | Appliqué (aucune logique de calage ; `<input type="date">` vides). |
| 4 | Niveau : **liste fermée Or / Argent / Bronze**, **porté par la période** et figé. Le bureau définit **avantages (quota) ET quotas de messages** par niveau. | `niveaux_partenaire` (0034) + écran `/admin/partenaires/niveaux` + `select` fermé sur la période. |
| 5 | Erreur versement = **simple message contact**. | Tel quel (paiements en lecture seule + formulaire de contact). |
| 6 | Contact famille → **étendre `/api/contact`** (documenté, pas fait ici). | §5.7, non codé (périmètre partagé). |
| 7 | **Permission dédiée `partenaires`** : oui (documenter, ne pas toucher `adminAuth.js`). | §5.2, non codé (périmètre interdit). |
| 8 | Paiements : **suppression OK**. Période : **suppression interdite si un paiement rattaché**. | Appliqué (route périodes DELETE → 409 si `partenaire_paiements` liés). |
| 9 | Documents : **image + PDF, 10 Mo**. | Tel quel. |
| 10 | E-mail d'invitation : **garder le gabarit** (relecture Thomas). | `gabaritInvitationPartenaire` inchangé. |
| 11 | **Lien discret** vers `/partenaire` au pied de page. | §5.5, non codé (`components.js` interdit). |

### Nouvelles ambiguïtés apparues avec la brique « messages »

- **« Définir les avantages par niveau »** interprété comme : `quota_avantages`
  (nombre max d'avantages actifs) + `contreparties` (texte libre). Si Thomas
  voulait des *modèles d'avantages* pré-remplis par niveau, c'est un autre
  chantier.
- **Décompte du quota mensuel** : basé sur `mois_cible` (mois de parution visé),
  pas sur la date de soumission. Un message soumis le 26 mars pour avril compte
  sur avril. À confirmer.
- **Brouillons** : l'échafaudage ne propose que « soumettre directement » côté
  partenaire (pas de vrai mode brouillon dans l'UI), même si le schéma et les
  routes le supportent (`statut='brouillon'`, POST sans `soumettre`). Ajouter un
  bouton « Enregistrer sans soumettre » si utile.
- **Type `reseau`** : schéma + quota prêts, aucun écran. Décider quand/comment
  le partenaire publie sur les réseaux (lien vers un outil ? texte copié à la
  main par le bureau ?).
- **Image dans l'e-mail** : le bucket `partenaire-messages` est privé. Le
  chantier §8 doit choisir l'hébergement d'image pour un vrai e-mail.

---

## 7. Inventaire des fichiers livrés

### Migrations (NON appliquées — à renuméroter, appliquer dans l'ordre)
- `0033_partenaires_comptes.sql` — `ALTER partenaires`, `ALTER invitations`
- `0034_partenaires_periodes_paiements.sql` — `niveaux_partenaire` (+ seed),
  `partenaire_periodes`, `partenaire_paiements`
- `0035_avantages_historique.sql` — `ALTER avantages`, `avantage_evenements`
- `0036_partenaire_documents.sql` — table + bucket `partenaire-documents`
- `0037_contact_messages_source.sql` — `ALTER contact_messages`
- `0038_partenaire_messages.sql` — `partenaire_messages` + bucket `partenaire-messages`

### Code — passe 1 (29 août)
- `app/lib/partenaires.js` — session, statut période, historique d'avantage,
  invitation. **Passe 2** : + `moisCourant`, `niveauActifPartenaire`,
  `compterMessagesMois`.
- Back-office : `app/admin/partenaires/page.js`,
  `app/admin/partenaires/[id]/page.js`.
- Routes bureau : `app/api/admin/partenaires/route.js`, `.../[id]/route.js`,
  `.../[id]/inviter/route.js`, `.../[id]/periodes/route.js`,
  `.../[id]/periodes/[periodeId]/route.js`, `.../[id]/paiements/route.js`,
  `.../[id]/paiements/[paiementId]/route.js`, `.../[id]/documents/route.js`,
  `.../[id]/documents/[docId]/route.js`.
- Espace partenaire : `app/partenaire/page.js`, `app/api/partenaire/moi`,
  `.../mes-avantages(+/[id])`, `.../documents/[id]`, `.../contact`.
- `app/api/roles/route.js`.
- Retouches : `app/activer-compte/page.js` (`?espace=partenaire`),
  `app/admin/admin-shell.js` (onglet).

### Code — passe 2 (30 août), nouveaux fichiers
- `supabase/migrations/0038_partenaire_messages.sql`
- `app/api/admin/niveaux-partenaire/route.js` — GET/PATCH config des niveaux
- `app/admin/partenaires/niveaux/page.js` — écran config niveaux/quotas
- `app/api/admin/partenaire-messages/route.js` + `[id]/route.js` — modération
- `app/admin/partenaires/messages/page.js` — file de modération
- `app/api/partenaire/messages/route.js` + `[id]/route.js` — rédaction/soumission

### Code — passe 2, fichiers modifiés
- `supabase/migrations/0034_...` — ajout `niveaux_partenaire` + FK niveau
- `app/lib/partenaires.js` — helpers niveau/quota/mois
- `app/api/admin/partenaires/[id]/periodes/route.js` — niveau = liste fermée
- `app/api/admin/partenaires/[id]/periodes/[periodeId]/route.js` — niveau fermé
  + **DELETE refusé si paiement rattaché**
- `app/api/partenaire/mes-avantages/route.js` — quota d'avantages actifs
- `app/api/partenaire/moi/route.js` — renvoie niveau + contreparties + quota
- `app/admin/partenaires/page.js` — liens vers messages / niveaux
- `app/admin/partenaires/[id]/page.js` — `select` Or/Argent/Bronze
- `app/partenaire/page.js` — section « Mes messages nouveautés » + niveau affiché

### Non touché volontairement
`app/lib/adminAuth.js`, `app/connexion/page.js`, `app/components.js`,
tout `app/**/emails/**`, `app/verifier-adhesion/*`, `app/api/partenaire/valider`,
`app/api/partenaire/pour-famille`, `app/partenaires/*` (page publique).

---

## 8. Chantier de suite : e-mailing mensuel « Les nouveautés de nos partenaires »

**Non codé** (demande explicite). Le schéma est prêt pour l'accueillir sans
nouvelle migration : `partenaire_messages.mois_cible`, `statut='publie'`,
`publie_le`, et l'`ordre` dans `niveaux_partenaire`.

### Spécification cible
- **Planificateur mensuel** : un cron mensuel, sur le modèle de la sauvegarde
  (`.github/workflows/sauvegarde-supabase.yml` + une route protégée par jeton,
  façon `ADMIN_IMPORT_TOKEN`). **Cutoff le 25** : après cette date, plus aucune
  soumission n'est prise pour le mois en cours (les messages `soumis` non
  validés au 25 basculent au mois suivant, ou sont refusés — à trancher).
- **Génération du contenu** : prendre les `partenaire_messages` du mois
  (`mois_cible = AAAA-MM`) au statut `valide`, les ordonner **Or → Argent →
  Bronze** (via `niveaux_partenaire.ordre` du niveau de la période active du
  partenaire au moment de la génération), avec **rotation intra-niveau** d'un
  mois sur l'autre (mémoriser le dernier rang servi par partenaire, ou trier
  par `min(publie_le)` croissant puis `created_at`) pour que ce ne soit pas
  toujours le même partenaire en tête de son niveau.
- **Rendu** : réutiliser l'éditeur de campagnes existant (`app/lib/emailBlocks.js`,
  `email_campaigns`) — générer une campagne « brouillon » à partir des messages,
  relisible par le bureau avant envoi, plutôt qu'un envoi direct.
- **Image** : les images sont dans le bucket **privé** `partenaire-messages`.
  Pour un vrai e-mail il faut une URL publique stable : soit un bucket public
  dédié où l'on **copie** l'image validée, soit une URL signée à très longue
  durée figée dans la campagne. À décider ici.
- **Destinataires** : **tous les contacts e-mail, y compris les anciens
  parents** (`email_contacts` / segmentation `/admin/emails` — inclure le
  segment « anciens »). Respecter le lien de désabonnement existant
  (`/api/emails/desabonner`).
- **Après envoi** : passer les messages inclus à `statut='publie'`,
  `publie_le = now()`. Conserver `mois_cible` pour l'historique et la rotation.

### Points ouverts pour ce chantier
- Cutoff au 25 : comportement exact pour les messages encore `soumis`.
- Rotation intra-niveau : règle précise et où stocker l'état de rotation.
- Un seul e-mail groupé, ou une section par manifestation/thème ?
- Fréquence réelle (tous les mois, seulement en période scolaire ?).
