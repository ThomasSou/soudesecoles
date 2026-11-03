// Affichage des modules d'une page partenaire (page publique ET aperçu du
// bureau/du partenaire). Texte brut uniquement : React échappe tout, aucun
// HTML du partenaire n'est jamais injecté. Images : <img> simple (bucket
// public Supabase), sans cookie ni script tiers.
export function RenduModules({ contenu }) {
  const modules = contenu?.modules || [];
  return (
    <div className="w-full space-y-6 text-left">
      {modules.map((m, i) => {
        if (m.type === "texte")
          return (
            <div key={i}>
              {m.titre && <h2 className="text-lg font-bold text-sou-blue mb-2">{m.titre}</h2>}
              <p className="text-slate-600 whitespace-pre-line">{m.texte}</p>
            </div>
          );
        if (m.type === "photo")
          return (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.legende || ""} loading="lazy" className="w-full rounded-lg border border-slate-200" />
              {m.legende && <figcaption className="text-xs text-slate-500 mt-1">{m.legende}</figcaption>}
            </figure>
          );
        if (m.type === "galerie")
          return (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {m.images.map((im, j) => (
                <figure key={j}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={im.legende || ""} loading="lazy" className="w-full aspect-square object-cover rounded-lg border border-slate-200" />
                  {im.legende && <figcaption className="text-xs text-slate-500 mt-1">{im.legende}</figcaption>}
                </figure>
              ))}
            </div>
          );
        if (m.type === "infos")
          return (
            <div key={i} className="border-t border-slate-100 pt-4 space-y-1 text-sm text-slate-600">
              {m.adresse && <p>{m.adresse}</p>}
              {m.telephone && (
                <p><a href={`tel:${m.telephone.replace(/\s/g, "")}`} className="hover:text-sou-blue">{m.telephone}</a></p>
              )}
              {m.email && <p><a href={`mailto:${m.email}`} className="hover:text-sou-blue">{m.email}</a></p>}
              {m.horaires && <p className="whitespace-pre-line pt-1"><span className="font-semibold">Horaires :</span>{"\n"}{m.horaires}</p>}
              {m.site && (
                <p>
                  <a href={m.site} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 bg-sou-blue text-white font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors">
                    Voir leur site
                  </a>
                </p>
              )}
            </div>
          );
        if (m.type === "bouton")
          return (
            <p key={i} className="text-center">
              <a href={m.url} target="_blank" rel="noopener noreferrer"
                className="inline-block bg-sou-blue text-white font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors">
                {m.libelle}
              </a>
            </p>
          );
        return null;
      })}
    </div>
  );
}
