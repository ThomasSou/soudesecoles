import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import { analyserDictee, consommation, sansAccents } from "../../../lib/stockDictee";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const nombre = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

// Quantité totale par article d'un inventaire.
function totaux(lignes) {
  const m = new Map();
  for (const l of lignes) m.set(l.article_id, (m.get(l.article_id) || 0) + Number(l.quantite));
  return m;
}

// Tout ce qu'il faut à l'écran en un seul appel : le catalogue, les inventaires
// (du plus récent au plus ancien), les achats, le stock estimé aujourd'hui et la
// consommation entre chaque inventaire et le précédent.
export async function GET(request) {
  const auth = await requirePermission(request, "stock");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = createAdminClient();

  const [art, inv, lig, ach] = await Promise.all([
    db.from("stock_articles").select("*").order("categorie", { nullsFirst: false }).order("nom"),
    db.from("stock_inventaires").select("*").order("date_inventaire", { ascending: false }).order("created_at", { ascending: false }),
    db.from("stock_inventaire_lignes").select("*"),
    db.from("stock_achats").select("*").order("date_achat", { ascending: false }),
  ]);
  const err = art.error || inv.error || lig.error || ach.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const inventaires = inv.data.map((i) => ({ ...i, lignes: lig.data.filter((l) => l.inventaire_id === i.id) }));
  const achats = ach.data;

  // Consommation de chaque inventaire par rapport au précédent (ordre chronologique).
  const chrono = [...inventaires].sort((a, b) => (a.date_inventaire + a.created_at).localeCompare(b.date_inventaire + b.created_at));
  const conso = {};
  for (let k = 1; k < chrono.length; k++) {
    const p = chrono[k - 1], c = chrono[k];
    const achatsEntre = new Map();
    for (const a of achats) {
      if (a.date_achat > p.date_inventaire && a.date_achat <= c.date_inventaire) {
        achatsEntre.set(a.article_id, (achatsEntre.get(a.article_id) || 0) + Number(a.quantite));
      }
    }
    conso[c.id] = { precedent: p.id, lignes: consommation(totaux(p.lignes), totaux(c.lignes), achatsEntre) };
  }

  // Stock estimé aujourd'hui = dernier inventaire + achats faits depuis.
  let estime = [];
  const dernier = chrono[chrono.length - 1];
  if (dernier) {
    const base = totaux(dernier.lignes);
    for (const a of achats) {
      if (a.date_achat > dernier.date_inventaire) base.set(a.article_id, (base.get(a.article_id) || 0) + Number(a.quantite));
    }
    // plus proche date de péremption par article, d'après le dernier inventaire
    const peremption = new Map();
    for (const l of dernier.lignes) {
      if (l.date_peremption && (!peremption.has(l.article_id) || l.date_peremption < peremption.get(l.article_id))) {
        peremption.set(l.article_id, l.date_peremption);
      }
    }
    estime = [...base.entries()].map(([article_id, quantite]) => ({ article_id, quantite, peremption: peremption.get(article_id) || null }));
  }

  return NextResponse.json({ articles: art.data, inventaires, achats, conso, estime, dernierInventaire: dernier ? dernier.id : null });
}

// Actions : analyser (dictée) · article · supprimer_article · inventaire ·
// supprimer_inventaire · achats · supprimer_achat · importer
export async function POST(request) {
  const auth = await requirePermission(request, "stock");
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Demande incomplète." }, { status: 400 });
  const db = createAdminClient();

  async function catalogue() {
    const { data } = await db.from("stock_articles").select("id, nom, alias, unite").eq("actif", true);
    return data || [];
  }
  // Retient comme alias la façon dont on a dicté l'article, pour le reconnaître la prochaine fois.
  async function apprendreAlias(articleId, libelle, articles) {
    const art = articles.find((a) => a.id === articleId);
    const l = txt(libelle, 80);
    if (!art || !l) return;
    const deja = [art.nom, ...(art.alias || [])].some((x) => sansAccents(x) === sansAccents(l));
    if (!deja) await db.from("stock_articles").update({ alias: [...(art.alias || []), l].slice(-12) }).eq("id", articleId);
  }

  switch (body.action) {
    case "analyser": {
      const texte = String(body.texte || "").slice(0, 8000);
      return NextResponse.json({ lignes: analyserDictee(texte, await catalogue()) });
    }

    case "article": {
      const nom = txt(body.nom, 120);
      if (!nom) return NextResponse.json({ error: "Nom de l'article obligatoire." }, { status: 400 });
      const champs = {
        nom,
        categorie: txt(body.categorie, 60),
        unite: txt(body.unite, 30) || "unité",
        seuil_alerte: body.seuil_alerte === "" || body.seuil_alerte == null ? null : Math.max(0, nombre(body.seuil_alerte) ?? 0),
        actif: body.actif !== false,
      };
      if (Array.isArray(body.alias)) champs.alias = body.alias.map((a) => txt(a, 80)).filter(Boolean).slice(0, 20);
      const q = body.id ? db.from("stock_articles").update(champs).eq("id", body.id) : db.from("stock_articles").insert(champs);
      const { data, error } = await q.select().single();
      if (error) {
        const doublon = error.code === "23505";
        return NextResponse.json({ error: doublon ? "Un article porte déjà ce nom." : error.message }, { status: doublon ? 409 : 500 });
      }
      return NextResponse.json({ article: data });
    }

    case "supprimer_article": {
      // Un article déjà compté ou acheté n'est pas effacé (l'historique le référence) : on le masque.
      const { error } = await db.from("stock_articles").delete().eq("id", body.id);
      if (error) {
        if (error.code === "23503") {
          await db.from("stock_articles").update({ actif: false }).eq("id", body.id);
          return NextResponse.json({ ok: true, masque: true });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    case "inventaire": {
      const date = DATE_OK.test(body.date || "") ? body.date : null;
      if (!date) return NextResponse.json({ error: "Date de l'inventaire obligatoire." }, { status: 400 });
      const lignes = (Array.isArray(body.lignes) ? body.lignes : []).slice(0, 500)
        .map((l) => ({ article_id: l.articleId, quantite: nombre(l.quantite), date_peremption: DATE_OK.test(l.datePeremption || "") ? l.datePeremption : null, libelle: l.libelle }))
        .filter((l) => l.article_id && l.quantite != null && l.quantite >= 0);
      if (!lignes.length) return NextResponse.json({ error: "Aucune ligne valide à enregistrer." }, { status: 400 });
      const { data: inv, error } = await db.from("stock_inventaires")
        .insert({ date_inventaire: date, libelle: txt(body.libelle, 120), note: txt(body.note, 500), evenement_id: body.evenementId || null, created_by: auth.parent.id })
        .select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const { error: e2 } = await db.from("stock_inventaire_lignes")
        .insert(lignes.map(({ libelle, ...l }) => ({ ...l, inventaire_id: inv.id })));
      if (e2) {
        await db.from("stock_inventaires").delete().eq("id", inv.id);
        return NextResponse.json({ error: e2.message }, { status: 500 });
      }
      const cat = await catalogue();
      for (const l of lignes) await apprendreAlias(l.article_id, l.libelle, cat);
      return NextResponse.json({ inventaire: inv });
    }

    case "supprimer_inventaire": {
      const { error } = await db.from("stock_inventaires").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "achats": {
      const date = DATE_OK.test(body.date || "") ? body.date : null;
      if (!date) return NextResponse.json({ error: "Date d'achat obligatoire." }, { status: 400 });
      const lignes = (Array.isArray(body.lignes) ? body.lignes : []).slice(0, 300)
        .map((l) => ({ article_id: l.articleId, quantite: nombre(l.quantite), libelle: l.libelle }))
        .filter((l) => l.article_id && l.quantite != null && l.quantite > 0);
      if (!lignes.length) return NextResponse.json({ error: "Aucune ligne valide à enregistrer." }, { status: 400 });
      const { error } = await db.from("stock_achats").insert(lignes.map((l) => ({
        article_id: l.article_id, quantite: l.quantite, date_achat: date,
        fournisseur: txt(body.fournisseur, 120), note: txt(body.note, 300), created_by: auth.parent.id,
      })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const cat = await catalogue();
      for (const l of lignes) await apprendreAlias(l.article_id, l.libelle, cat);
      return NextResponse.json({ ok: true, enregistres: lignes.length });
    }

    case "supprimer_achat": {
      const { error } = await db.from("stock_achats").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Import du tableau Excel existant : [{nom, categorie, unite, quantite, datePeremption}].
    // Crée les articles manquants et enregistre un premier inventaire (la base de départ).
    case "importer": {
      const date = DATE_OK.test(body.date || "") ? body.date : null;
      if (!date) return NextResponse.json({ error: "Date de l'inventaire de départ obligatoire." }, { status: 400 });
      const brut = (Array.isArray(body.lignes) ? body.lignes : []).slice(0, 1000)
        .map((l) => ({ nom: txt(l.nom, 120), categorie: txt(l.categorie, 60), unite: txt(l.unite, 30), quantite: nombre(l.quantite), datePeremption: DATE_OK.test(l.datePeremption || "") ? l.datePeremption : null }))
        .filter((l) => l.nom && l.quantite != null && l.quantite >= 0);
      if (!brut.length) return NextResponse.json({ error: "Aucune ligne exploitable dans l'import." }, { status: 400 });
      const cat = await catalogue();
      const parNom = new Map(cat.map((a) => [sansAccents(a.nom).trim(), a.id]));
      const lignes = [];
      for (const l of brut) {
        let id = parNom.get(sansAccents(l.nom).trim());
        if (!id) {
          const { data, error } = await db.from("stock_articles").insert({ nom: l.nom, categorie: l.categorie, unite: l.unite || "unité" }).select("id").single();
          if (error) return NextResponse.json({ error: `${l.nom} : ${error.message}` }, { status: 500 });
          id = data.id; parNom.set(sansAccents(l.nom).trim(), id);
        }
        lignes.push({ article_id: id, quantite: l.quantite, date_peremption: l.datePeremption });
      }
      const { data: inv, error } = await db.from("stock_inventaires").insert({ date_inventaire: date, libelle: txt(body.libelle, 120) || "Inventaire de départ (import Excel)", created_by: auth.parent.id }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const { error: e2 } = await db.from("stock_inventaire_lignes").insert(lignes.map((l) => ({ ...l, inventaire_id: inv.id })));
      if (e2) { await db.from("stock_inventaires").delete().eq("id", inv.id); return NextResponse.json({ error: e2.message }, { status: 500 }); }
      return NextResponse.json({ ok: true, articles: new Set(lignes.map((l) => l.article_id)).size, lignes: lignes.length });
    }

    default:
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }
}
