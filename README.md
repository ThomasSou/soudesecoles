# Site — Sou des Écoles Montmerle-Lurcy

Site Next.js du Sou des Écoles Laïques Montmerle-Lurcy.

## Développement local

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## Déploiement

Ce dépôt est connecté à Netlify (plugin `@netlify/plugin-nextjs`, voir `netlify.toml`) :
chaque push sur la branche `main` déclenche un nouveau déploiement automatique.

Variables d'environnement à définir dans Netlify (Site settings > Environment
variables) — voir `.env.local.example` pour le détail :
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (secret, jamais exposée au navigateur)

## Base de données (Supabase)

Le schéma (tables `families`, `parents`, `children`, `memberships`,
`registration_requests` + policies RLS) est défini dans
`supabase/migrations/` et a été appliqué directement dans le projet
Supabase `Soudesecoles`.

## Comptes famille : comment ça marche

Le parcours normal **n'est pas** une inscription libre sur le site :

1. En début d'année, les listes d'élèves transmises par les écoles sont
   nettoyées et rapprochées par famille (nom/prénom des enfants comme clé de
   rattachement), puis converties dans le format attendu par
   `scripts/import-familles.mjs`.
2. Ce script crée les familles, **invite chaque parent par e-mail** via
   Supabase Auth (lien officiel pour définir son mot de passe) et crée les
   fiches enfants. Voir l'en-tête du script pour le format JSON attendu et
   la commande à lancer.
3. Le parent clique sur le lien reçu, définit son mot de passe, et retrouve
   directement sa fiche famille dans son espace adhérent.

Pour les cas hors import (nouvelle famille en cours d'année, compte
manquant...), la page `/inscription` propose un simple **formulaire de
demande** (nom, prénom, e-mail, téléphone, enfants) stocké dans la table
`registration_requests`, à valider manuellement par le bureau (via le Table
Editor Supabase pour l'instant, en attendant le back-office admin de la
Phase 2) avant d'inviter la personne avec le même mécanisme.

## État du projet (Phase 1)

- [x] Structure Next.js + Tailwind
- [x] Pages publiques : Accueil, Événements, Partenaires, Presse, Contact
- [x] Schéma Supabase (familles, parents, enfants, adhésions) + RLS
- [x] Client Supabase branché dans le site (`app/lib/supabaseClient.js`)
- [x] Connexion + espace adhérent (protégé)
- [x] Formulaire de demande d'inscription (moderation manuelle)
- [x] Script d'import admin + invitation des parents par e-mail
- [ ] Import réel du fichier familles (en attente du fichier 2026-2027)
- [ ] Intégration HelloAsso (cotisations)
- [ ] Carte adhérent + QR code

Voir le document de cadrage complet dans le dossier partagé de l'association
pour le détail des fonctionnalités prévues.
