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

## Base de données (Supabase)

Le schéma (tables `families`, `parents`, `children`, `memberships` + policies
RLS) est défini dans `supabase/migrations/0001_init.sql` et a été appliqué
directement dans le projet Supabase `Soudesecoles`.

## État du projet (Phase 1)

- [x] Structure Next.js + Tailwind
- [x] Pages publiques : Accueil, Événements, Partenaires, Presse, Contact
- [x] Schéma Supabase (familles, parents, enfants, adhésions) + RLS
- [x] Client Supabase branché dans le site (`app/lib/supabaseClient.js`)
- [ ] Pages connexion / inscription + espace adhérent (protégé)
- [ ] Import et rapprochement des listes d'élèves par famille
- [ ] Intégration HelloAsso (cotisations)
- [ ] Carte adhérent + QR code

Voir le document de cadrage complet dans le dossier partagé de l'association
pour le détail des fonctionnalités prévues.
