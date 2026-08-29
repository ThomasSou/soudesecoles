# Espace partenaires — conception et échafaudage

Document de conception rédigé pendant un travail de nuit autonome (29 août 2026).
Il accompagne un **échafaudage** : migrations non appliquées, pages et routes
API qui compilent (`npm run build` OK) mais **non testées en conditions
réelles**. À relire et arbitrer avant de finaliser.

Objectif : donner aux partenaires (entreprises, commerçants qui soutiennent le
Sou) un espace connecté sur le même modèle que l'espace famille, et au bureau
un back-office pour les gérer.

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
| `0034_partenaires_periodes_paiements.sql` | `partenaire_periodes`, `partenaire_paiements` |
| `0035_avantages_historique.sql` | `ALTER avantages` (`description`, `updated_at`) ; `avantage_evenements` |
| `0036_partenaire_documents.sql` | `partenaire_documents` + bucket Storage privé `partenaire-documents` |
| `0037_contact_messages_source.sql` | `ALTER contact_messages` (`source`, `auteur_parent_id`, `auteur_partenaire_id`) |

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

### 2.2 `partenaire_periodes` — période de partenariat

```
id                     uuid pk
partenaire_id          uuid  -> partenaires(id) on delete cascade
debut                  date  not null
fin                    date  not null           -- check (fin >= debut)
niveau                 text                       -- "Gold"/"Silver"/"Bronze" (facultatif)
montant_annonce_cents  integer                    -- montant de partenariat annoncé (facultatif)
note                   text
annulee                boolean default false      -- on annule plutôt que de supprimer
created_at, created_by
```

Un partenaire est **« à jour »** si la date du jour tombe dans une période non
annulée (`statutPeriodePartenaire()` dans `app/lib/partenaires.js`).

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

---

## 3. Écrans

### 3.1 Back-office (`/admin/partenaires`, onglet ajouté à `admin-shell.js`)

**Liste — `app/admin/partenaires/page.js`**
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
2. **Période de partenariat** : liste (avec annuler / rétablir / supprimer) +
   formulaire d'ajout (début, fin, niveau, montant annoncé, note).
3. **Paiements reçus** : liste + total encaissé + formulaire d'ajout (montant,
   date de réception, moyen, référence, rattachement facultatif à une période,
   note) ; suppression d'une ligne.
4. **Avantages offerts** : lecture seule (le partenaire les gère lui-même) —
   libellé, quantité/famille, nombre d'utilisations, statut ; puis
   **Historique des offres** (frise `avantage_evenements`).
5. **Documents partagés** : liste (voir / supprimer) + dépôt (titre,
   description, fichier image ou PDF ≤ 10 Mo).

### 3.2 Espace partenaire (`/partenaire`, réécrit)

Authentification Supabase (même `createClient()` que `/espace-adherent`).
États : `chargement` / `anonyme` (invite à `/connexion`) / `refuse` (compte non
rattaché à un partenaire) / `connecte`.

Sections :
1. **En-tête** : nom + statut « Partenariat à jour (jusqu'au …) » ou « Aucune
   période en cours ».
2. **Mes versements** : liste + total, **lecture seule**, avec invitation à
   signaler une erreur via le formulaire de contact.
3. **Les avantages que j'offre** : « + Nouvel avantage » (libellé, précisions,
   quantité par famille, réservé aux adhérents) → **publié immédiatement, sans
   validation** ; par ligne : modifier (libellé + quantité), masquer / remettre
   en ligne. Nombre d'utilisations affiché.
4. **Documents partagés par le bureau** : téléchargement via URL signée.
5. **Contacter le bureau** : sujet + message → `/api/partenaire/contact`.

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

---

## 5. Points d'intégration à faire à la main au matin

> Rien ci-dessous n'a été fait pour ne pas empiéter sur le périmètre interdit
> (adminAuth.js, page de connexion, `components.js`, e-mails) ni sur le
> sous-agent « espace enseignants ».

### 5.1 Renumérotation des migrations — **obligatoire avant application**
Les fichiers sont nommés `0033`…`0037` en supposant que rien ne s'est ajouté
après `0032`. Si d'autres migrations ont été créées entre-temps, **renuméroter
en une série continue** avant de coller dans l'éditeur SQL Supabase. Les
appliquer **dans l'ordre** (0033 d'abord : les suivantes en dépendent). Penser
à **vérifier chaque écriture par un `select` indépendant** (piège Supabase
connu).

### 5.2 `app/lib/adminAuth.js` — permission dédiée (recommandé)
Aujourd'hui tout le module partenaires utilise la permission **`avantages`**
(routes API + onglet). Pour la séparer :
1. ajouter dans le tableau `PERMISSIONS` :
   `{ key: "partenaires", label: "Partenaires (fiches, périodes, paiements, documents)" },`
2. remplacer `"avantages"` par `"partenaires"` dans :
   - `app/admin/admin-shell.js` (ligne de l'onglet `/admin/partenaires`) ;
   - toutes les routes `app/api/admin/partenaires/**` (constante `PERM`).
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

### 5.5 `app/components.js` (navigation) — non modifié
Ajouter un accès « Espace partenaire » si souhaité (p. ex. dans le pied de
page à côté de « Espace adhérent », ou un lien discret depuis `/partenaires`).
Aujourd'hui `/partenaire` n'est atteignable que par URL directe ou après
redirection de connexion.

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

## 6. Décisions / ambiguïtés à trancher par Thomas

1. **PIN au comptoir vs compte connecté.** Retenu : on garde le PIN pour la
   validation d'avantage sur `/verifier-adhesion` (pratique pour un employé à
   la caisse) et on réserve le compte e-mail à l'espace de gestion. OK ? Ou
   veux-tu que la validation au comptoir se fasse aussi avec le compte du
   partenaire (login sur le téléphone) ?

2. **Un compte par partenaire.** Le modèle prévoit **un seul** e-mail/mot de
   passe par partenaire (`partenaires.auth_user_id` unique). Si plusieurs
   personnes d'une même entreprise doivent se connecter, il faut une table de
   liaison `partenaire_membres` (non prévue). Nécessaire ?

3. **Période de partenariat = année scolaire ?** Le modèle est libre
   (`debut`/`fin` quelconques). Faut-il forcer / pré-remplir sur l'année
   scolaire courante comme pour les cotisations familles ?

4. **Niveau (Gold/Silver/Bronze).** Champ libre sur la période. Doit-il être
   une liste fermée et alimenter automatiquement la page publique `/partenaires`
   (aujourd'hui statique dans `data.js`) ? Cela impliquerait de migrer le
   contenu de `data.js` en base — chantier séparé.

5. **Message « erreur sur mes versements ».** Le partenaire voit ses paiements
   en lecture seule et peut signaler une erreur par le formulaire de contact.
   Suffisant, ou faut-il un statut « contesté » sur la ligne de paiement ?

6. **Contact espace famille → `source='parent'`.** Trancher l'option 5.7
   (étendre `/api/contact` vs nouvelle route).

7. **Permission dédiée `partenaires`.** La créer (§5.2) ou laisser sous
   `avantages` ?

8. **Suppression vs archivage.** Périodes et paiements ont un `DELETE` sec dans
   l'échafaudage (pour les saisies erronées). Les périodes ont aussi `annulee`.
   Veux-tu interdire la suppression une fois qu'un paiement est rattaché ?

9. **Types de fichiers des documents.** Limité à image + PDF, 10 Mo. Ajouter
   Word/Excel ? (contrats souvent en PDF, donc probablement inutile.)

10. **E-mail d'invitation partenaire.** Texte rédigé dans
    `app/lib/partenaires.js` (`gabaritInvitationPartenaire`). À relire, et à
    harmoniser si l'équipe e-mails veut un gabarit commun.

11. **Accès à `/partenaire` depuis le site public.** Faut-il un lien visible
    (pied de page, page `/partenaires`) ou l'espace reste-t-il « sur
    invitation » uniquement ?

---

## 7. Inventaire des fichiers livrés

### Migrations (NON appliquées — à renuméroter)
- `supabase/migrations/0033_partenaires_comptes.sql`
- `supabase/migrations/0034_partenaires_periodes_paiements.sql`
- `supabase/migrations/0035_avantages_historique.sql`
- `supabase/migrations/0036_partenaire_documents.sql`
- `supabase/migrations/0037_contact_messages_source.sql`

### Nouveau code
- `app/lib/partenaires.js` — session partenaire, statut période, historique
  d'avantage, invitation.
- Back-office : `app/admin/partenaires/page.js`,
  `app/admin/partenaires/[id]/page.js`.
- Routes bureau : `app/api/admin/partenaires/route.js` (réécrite),
  `.../[id]/route.js` (réécrite), `.../[id]/inviter/route.js`,
  `.../[id]/periodes/route.js`, `.../[id]/periodes/[periodeId]/route.js`,
  `.../[id]/paiements/route.js`, `.../[id]/paiements/[paiementId]/route.js`,
  `.../[id]/documents/route.js`, `.../[id]/documents/[docId]/route.js`.
- Espace partenaire : `app/partenaire/page.js` (réécrite),
  `app/api/partenaire/moi/route.js`,
  `app/api/partenaire/mes-avantages/route.js`,
  `app/api/partenaire/mes-avantages/[id]/route.js`,
  `app/api/partenaire/documents/[id]/route.js`,
  `app/api/partenaire/contact/route.js`.
- `app/api/roles/route.js` — helper de redirection selon le rôle.

### Retouches minimes (hors périmètre interdit)
- `app/activer-compte/page.js` — paramètre `?espace=partenaire`.
- `app/admin/admin-shell.js` — onglet « Partenaires ».

### Non touché volontairement
`app/lib/adminAuth.js`, `app/connexion/page.js`, `app/components.js`,
tout `app/**/emails/**`, `app/api/partenaire/valider`,
`app/api/partenaire/pour-famille`, `app/partenaires/*` (page publique).
