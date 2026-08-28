# Sauvegardes du site

Ce document explique où sont les sauvegardes du site, ce qu'elles contiennent,
et comment les utiliser en cas de problème grave (perte de données, panne
Supabase...). Il est écrit pour qu'un futur président ou une future équipe,
même sans connaissances techniques, puisse comprendre — et pour qu'une aide
technique (une session Claude Code, un développeur) puisse restaurer sans
avoir à deviner.

## En bref

- **Une sauvegarde automatique tourne chaque nuit**, vers 1h du matin (heure
  de Paris), sans intervention humaine.
- Elle est envoyée sur **Google Drive**, sur le compte
  `presidentsoudesecolesmontmerle@gmail.com` (le même compte que celui utilisé
  pour Supabase), dans un dossier dédié (son nom exact est configuré dans les
  paramètres du dépôt GitHub — voir plus bas).
- **Elle garde 30 jours d'historique** : chaque jour a son propre dossier
  daté (ex. `2026-08-28`), et les dossiers de plus de 30 jours sont supprimés
  automatiquement.
- Le mécanisme lui-même (le programme qui fait la sauvegarde) est un
  « GitHub Action » : un robot qui tourne sur les serveurs de GitHub, pas sur
  un ordinateur de l'association — rien à allumer, rien à surveiller au
  quotidien. Son réglage se trouve dans le fichier
  [`.github/workflows/sauvegarde-supabase.yml`](../.github/workflows/sauvegarde-supabase.yml)
  du dépôt.

## Ce qui est couvert

Chaque sauvegarde quotidienne contient deux fichiers, dans le dossier du jour :

1. **`base-AAAA-MM-JJ.sql.gz`** — toutes les données de l'association :
   familles, parents, enfants, adhésions, achats de la boutique, messages de
   contact, demandes d'inscription, produits de la boutique, statistiques de
   fréquentation, bénévoles, partenaires... c'est-à-dire tout le contenu utile
   du site.
2. **`fichiers-AAAA-MM-JJ.tar.gz`** — les fichiers réels stockés par le site
   (pas les données, les fichiers eux-mêmes) : les photos de produits de la
   boutique, les images utilisées dans les e-mails, et les justificatifs
   déposés pour les demandes de remboursement.

## Ce qui n'est volontairement PAS couvert

- **Les comptes de connexion (mots de passe).** La sauvegarde ne contient pas
  la liste des comptes ni les mots de passe (même sous forme chiffrée) — pour
  ne pas stocker cette information sensible sur un Drive personnel. Ce n'est
  pas gênant : sur ce site, la fiche d'un parent (nom, e-mail, famille,
  enfants, adhésions...) est complètement séparée de son compte de connexion.
  Si les comptes étaient perdus, **aucune donnée réelle ne serait perdue** —
  chaque parent redéfinirait simplement son mot de passe via « mot de passe
  oublié », ou l'équipe du bureau lui renverrait une invitation depuis le
  back-office (page Familles).
- **La structure des tables (le schéma technique de la base).** Elle n'a pas
  besoin d'être sauvegardée séparément : elle est déjà conservée en
  permanence dans le dossier [`supabase/migrations/`](../supabase/migrations/)
  du dépôt GitHub, avec tout l'historique du code — c'est même plus durable
  qu'un simple export, puisque c'est versionné et jamais supprimé.
- **Les mots de passe et clés secrètes du site** (SMTP, HelloAsso, Sender,
  clé Supabase...). Ils vivent uniquement dans les réglages de Netlify (Site
  settings → Environment variables) et ne doivent jamais se retrouver dans
  une sauvegarde ni dans un fichier — c'est une règle du projet. Gardez-en une
  copie de votre côté, dans un endroit sécurisé (gestionnaire de mots de
  passe), séparément de ce système.
- **Les réglages du tableau de bord Supabase qui ne sont pas dans une table**
  (configuration de l'envoi d'e-mails d'authentification, adresses de
  redirection...). En cas de recréation complète du projet Supabase — un
  événement extrêmement rare — il faudrait les reconfigurer à la main. Voir
  `CLAUDE.md` à la racine du dépôt pour le détail de ces réglages.

## Comment vérifier que ça fonctionne

1. Sur GitHub, dans le dépôt, onglet **Actions**.
2. Chercher le workflow **« Sauvegarde quotidienne Supabase »**.
3. Une ligne verte par jour = tout va bien. Une ligne rouge = la sauvegarde du
   jour a échoué (voir les logs en cliquant dessus pour comprendre pourquoi).
4. On peut aussi la déclencher à la main à tout moment, pour tester, via le
   bouton « Run workflow » sur cette même page.

## Comment restaurer (en cas de problème grave)

Ces étapes demandent une aide technique (une session Claude Code, ou toute
personne à l'aise avec une ligne de commande). Elles ne sont normalement
utiles qu'en cas de perte de données réelle — pas pour une consultation
ponctuelle.

### 1. Retrouver la sauvegarde voulue

Sur Google Drive (compte `presidentsoudesecolesmontmerle@gmail.com`), dans le
dossier de sauvegardes, ouvrir le sous-dossier de la date souhaitée. On y
trouve `base-AAAA-MM-JJ.sql.gz` et `fichiers-AAAA-MM-JJ.tar.gz`. Les
télécharger.

### 2. Restaurer les données (la base)

Avec `psql` installé (l'outil en ligne de commande de PostgreSQL) et la
chaîne de connexion directe à la base Supabase (Project Settings → Database
→ Connection string, dans le tableau de bord Supabase) :

```bash
gunzip -c base-AAAA-MM-JJ.sql.gz | psql "chaine-de-connexion-supabase"
```

(Chaîne de connexion : Direct connection ou Session pooler conviennent
toutes les deux ici, tant que la machine qui lance la commande a accès en
IPv6 ou passe par le pooler — voir la remarque plus bas sur `SUPABASE_DB_URL`
si la Direct connection ne répond pas.)

⚠️ Cette commande ajoute les données du fichier à celles déjà présentes dans
la base cible — elle ne les remplace pas automatiquement. Si l'objectif est
de revenir exactement à l'état d'un jour donné (et donc d'effacer ce qui a
été fait depuis), il faut d'abord vider les tables concernées, avec
prudence et si possible en présence de quelqu'un qui connaît le projet.
**Ne jamais faire ça directement sur la base de production sans avoir
d'abord testé sur un projet Supabase à part.**

### 3. Restaurer les fichiers (images, justificatifs)

Extraire `fichiers-AAAA-MM-JJ.tar.gz` : on obtient un dossier par bucket
(`shop-images`, `email-images`, `remboursements`). Dans le tableau de bord
Supabase (Storage), recréer les buckets s'ils n'existent plus (mêmes noms
exacts), puis réimporter les fichiers de chaque dossier dedans — soit à la
main depuis l'interface Supabase, soit avec `rclone copy` (l'outil utilisé
pour créer la sauvegarde, capable aussi de la restaurer dans l'autre sens).

### 4. Cas des comptes de connexion perdus

Si la base Supabase a dû être entièrement recréée (nouveau projet), les
comptes de connexion (`auth.users`) n'existent plus, même une fois les
données restaurées. C'est normal (voir plus haut) : chaque parent doit
simplement redéfinir son mot de passe via « mot de passe oublié » sur le
site, ou l'équipe du bureau renvoie une invitation depuis le back-office.
Aucune donnée (familles, adhésions, historique) n'est perdue pour autant.

## Réglages techniques (pour mémoire)

Le workflow utilise trois éléments secrets, enregistrés dans GitHub (Settings
→ Secrets and variables → Actions du dépôt) — jamais visibles en clair
nulle part, y compris pas par Claude Code :

- `SUPABASE_DB_URL` — la chaîne de connexion à la base Postgres. **Attention :
  pas la connexion « directe »** (Project Settings → Database → Connection
  string → Direct connection) : elle est en IPv6 uniquement, injoignable
  depuis GitHub Actions (réseau IPv4 uniquement). Utiliser la chaîne
  **« Session pooler »** à la place (même page), au format
  `postgresql://postgres.giztqbbgfcuehseehbfg:[MOT-DE-PASSE]@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`
  — elle passe par un relais IPv4 et se comporte comme une connexion directe
  pour `pg_dump` (contrairement au mode « Transaction » du pooler, port 6543,
  qui ne convient pas à `pg_dump`).
- `RCLONE_CONFIG` — le fichier de configuration de l'outil `rclone`, qui
  contient à la fois l'accès à Google Drive (compte
  `presidentsoudesecolesmontmerle@gmail.com`) et l'accès aux fichiers
  Supabase Storage.
- `GDRIVE_BACKUP_FOLDER` — le nom du dossier Drive de destination.

La procédure de création initiale de ces trois éléments (à faire une seule
fois) est documentée à part, transmise directement à Thomas.
