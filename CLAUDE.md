# Site du Sou des Écoles Laïques Montmerle-Lurcy

Contexte de travail pour Claude Code. Mis à jour le 21 août 2026.

## Le projet en deux phrases

Site associatif d'une association de parents d'élèves (loi 1901, fondée en 1903)
à Montmerle-sur-Saône (Ain). Il sert à la fois de vitrine publique et d'outil de
gestion : adhésions, boutique en ligne pour les manifestations, envoi d'e-mails
aux familles, back-office pour le bureau.

L'interlocuteur est **Thomas Ondet, président de l'association**. Il n'est pas
développeur : il faut lui expliquer les choses en français clair, sans jargon,
et lui dire franchement quand quelque chose ne marche pas.

## Pile technique

| Élément | Choix |
|---|---|
| Cadre | Next.js 14.2 (App Router), React 18 |
| Style | Tailwind CSS 3.4 (classes utilitaires, pas de CSS séparé) |
| Base de données + authentification | Supabase (projet `giztqbbgfcuehseehbfg`) |
| Hébergement | Netlify, déploiement automatique sur push `main` |
| Paiements | HelloAsso (API Checkout v5) |
| E-mails | SMTP Infomaniak via nodemailer |
| Domaine | **https://sou-montmerle.fr** (ancienne adresse : soumontmerle.netlify.app) |

Dépôt : `github.com/ThomasSou/soudesecoles`, branche `main`.

## Conventions du projet

- **Tout est en français** : interface, textes, noms de variables métier,
  commentaires. Les commentaires expliquent le *pourquoi*, pas le *quoi*.
- **Pas de bibliothèque supplémentaire sans raison forte.** Les dépendances sont
  volontairement peu nombreuses (voir `package.json`).
- **Toute route API sous `app/api/` doit exporter `export const dynamic = "force-dynamic";`**
  sinon Next.js tente de la pré-générer au build et échoue avec
  `supabaseUrl is required`.
- Vérifier systématiquement avec `npm run build` avant de committer.

## Architecture

### Deux clients Supabase, à ne jamais confondre

- `app/lib/supabaseClient.js` — client navigateur, clé anonyme, **soumis au RLS**.
  Pour tout ce qui tourne côté client.
- `app/lib/supabaseServerAdmin.js` — client serveur, clé de service,
  **contourne le RLS**. Uniquement dans les routes API, jamais exposé au navigateur.

### Contrôle d'accès du back-office

`app/lib/adminAuth.js` centralise tout :

- `requireAdmin(request)` — vérifie le jeton porteur et que `parents.is_admin` est vrai.
- `requirePermission(request, "cle")` — idem plus une permission précise.
- Le tableau `PERMISSIONS` est la source de vérité : y ajouter une entrée suffit
  pour qu'elle apparaisse automatiquement dans l'écran de gestion des accès.

Permissions actuelles : `familles`, `demandes`, `messages`, `emails`, `boutique`,
`statistiques`, `acces`.

**Ne jamais faire confiance à un identifiant envoyé par le client** (`parentId`,
`familyId`...). Toujours le déduire du jeton d'authentification.

### Modules métier (`app/lib/`)

| Fichier | Rôle |
|---|---|
| `helloasso.js` | OAuth2 client_credentials, création et relecture des intentions de paiement |
| `boutiqueOrders.js` | Confirme une commande en revérifiant auprès de HelloAsso, puis la recopie dans `purchases` |
| `adhesionPaiement.js` | Même principe pour les cotisations (`memberships`) |
| `emailBlocks.js` | Éditeur d'e-mails par blocs : modèle de données, rendu HTML et texte |
| `mail.js` | Envoi SMTP |
| `stats.js` | Incrémentation des compteurs de fréquentation |
| `anneeScolaire.js` | Année scolaire courante et validité d'une adhésion |
| `adminAuth.js` | Authentification et permissions du back-office |

### Base de données

Tables principales : `families`, `parents`, `children`, `memberships`,
`purchases`, `contact_messages`, `registration_requests`, `shop_products`,
`shop_orders`, `stats_daily`.

**Les migrations dans `supabase/migrations/` ne sont pas exécutées
automatiquement.** Elles sont appliquées à la main dans l'éditeur SQL du tableau
de bord Supabase, puis versionnées ici pour l'historique. Quand tu ajoutes une
migration, dis-le explicitement à Thomas : elle ne prendra effet que
lorsqu'elle aura été exécutée.

### Sauvegardes

Une sauvegarde automatique tourne chaque nuit (GitHub Actions, voir
`.github/workflows/sauvegarde-supabase.yml`) : données de la base (schéma
`public`) + fichiers des buckets Supabase Storage, envoyées vers Google Drive
(compte `presidentsoudesecolesmontmerle@gmail.com`), 30 jours d'historique.
Détail complet (portée, ce qui n'est pas couvert et pourquoi, procédure de
restauration) dans [`docs/sauvegardes.md`](docs/sauvegardes.md) — à lire
avant toute restauration.

## Pièges déjà rencontrés — à ne pas refaire

**HelloAsso refuse d'être affiché dans une iframe.** Une première version du
paiement intégrait la page HelloAsso dans le site : elle était bloquée par
`X-Frame-Options`. Le paiement se fait donc par **redirection pleine page**, avec
retour via `returnUrl` / `errorUrl`. Ne pas tenter de revenir à une iframe.

**Les modèles d'e-mails Supabase sont verrouillés sans SMTP personnalisé.**
C'est réglé (Infomaniak configuré), mais c'est la raison pour laquelle les
invitations partaient en anglais.

**La Site URL de Supabase doit rester `https://sou-montmerle.fr/activer-compte`.**
Les invitations envoyées depuis le tableau de bord Supabase n'ont pas de
`redirectTo` explicite et retombent sur la Site URL. Avec la racine, les invités
atterrissaient sur l'accueil au lieu de la page de création de mot de passe.
Les invitations envoyées depuis le back-office, elles, fixent le `redirectTo`.

**Le message « Success » de l'éditeur SQL Supabase peut être périmé.** Il reste
affiché d'une requête précédente. Toujours vérifier une écriture par un `select`
indépendant : ce piège a déjà provoqué deux pertes de données silencieuses.

**Fins de ligne.** Le dépôt est en LF, le clone Windows en CRLF. Si `git status`
affiche des dizaines de fichiers modifiés que tu n'as pas touchés, c'est ça :
ne pas committer, cela réécrirait tout le dépôt.

**La mesure d'audience ne doit jamais poser de cookie.** C'est un choix assumé :
sans cookie ni identifiant de visiteur, le site n'a pas besoin de bandeau de
consentement. Ne pas introduire Google Analytics ou équivalent sans en parler
d'abord à Thomas — cela obligerait à ajouter un bandeau et à revoir la page
`/confidentialite`.

## Variables d'environnement

Définies dans Netlify (Site settings → Environment variables). Netlify ne
redéploie pas tout seul quand on les modifie : il faut déclencher un déploiement.

Publiques : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SCHOOL_YEAR`.

Secrètes : `SUPABASE_SECRET_KEY`, `HELLOASSO_CLIENT_ID`, `HELLOASSO_CLIENT_SECRET`,
`HELLOASSO_ORG_SLUG`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM`, `CONTACT_EMAIL`, `ADMIN_IMPORT_TOKEN`.

**Ne jamais écrire une valeur secrète dans le dépôt, ni dans la conversation.**
Si une clé doit être saisie quelque part, demander à Thomas de le faire lui-même.

## État actuel (21 août 2026)

En service : site public (accueil, événements, page dédiée Foire, partenaires,
presse, contact), espace famille (adhésion en ligne, carte d'adhérent avec QR
code, historique), boutique en ligne avec paiement HelloAsso, back-office
complet (familles, enfants, demandes, e-mails, boutique, messages, statistiques,
accès), mesure d'audience sans cookie, pages légales.

Le domaine, la messagerie `contact@sou-montmerle.fr`, le SMTP et les invitations
des membres du bureau sont opérationnels et testés.

## Ce qui reste à faire

- Relance des cotisations au 1er septembre (l'envoi d'e-mails est prêt).
- Pages dédiées pour chaque manifestation (seule la Foire en a une).
- Réservation de créneaux bénévoles.
- Segmentation plus fine des destinataires d'e-mails.
- Intégration SumUp pour la buvette et le rapprochement des cotisations (reportée).

## Deux points de méthode

**Vérifier plutôt que supposer.** Plusieurs vrais défauts n'ont été trouvés qu'en
testant réellement : lien d'invitation qui renvoyait sur l'accueil, mot de passe
SMTP refusé, paiement en iframe bloqué. Un `npm run build` qui passe ne prouve
que la compilation.

**Ce que Claude Code ne peut pas faire ici.** Il n'a accès ni au navigateur, ni
aux consoles web (Supabase, Netlify, Infomaniak, HelloAsso), ni à la messagerie.
Pour ces tâches — appliquer une migration, changer un réglage, vérifier un e-mail
réellement reçu — Thomas passe par la session Cowork, qui pilote son navigateur.
Le partage des rôles est donc : **le code ici, les consoles là-bas.**
