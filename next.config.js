/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Lecture des attestations HelloAsso (PDF) : ce module doit rester un
    // vrai module Node côté serveur plutôt qu'être empaqueté.
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};
module.exports = nextConfig;
