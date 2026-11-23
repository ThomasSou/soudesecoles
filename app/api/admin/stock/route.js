import { NextResponse } from "next/server";
import { requirePermission } from "../../../lib/adminAuth";
import { createAdminClient } from "../../../lib/supabaseServerAdmin";
import depart from "../../../lib/stockDepart.json";
import { analyserDictee, consommation, sansAccents, sontDoublons } from "../../../lib/stockDictee";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);
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

  const [art, inv, lig, ach, bes] = await Promise.all([
    db.from("stock_articles").select("*").order("categorie", { nullsFirst: false }).order("nom"),
    db.from("stock_inventaires").select("*").order("date_inventaire", { ascending: false }).order("created_at", { ascending: false }),
    db.from("stock_inventaire_lignes").select("*"),
    db.from("stock_achats").select("*").order("date_achat", { ascending: false }),
    db.from("stock_besoins").select("*"),
  ]);
  // stock_besoins peut ne pas exister tant que la migration 0064 n'est pas passée
  const besoins = bes.error ? [] : bes.data;
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
    const durables = new Set(art.data.filter((a) => a.durable).map((a) => a.id));
    conso[c.id] = { precedent: p.id, lignes: consommation(totaux(p.lignes), totaux(c.lignes), achatsEntre).filter((l) => !durables.has(l.articleId)) };
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

  const dernierPrix = {};
  for (const a of achats) if (a.prix_unitaire != null && !(a.article_id in dernierPrix)) dernierPrix[a.article_id] = Number(a.prix_unitaire); // achats triés du plus récent
  return NextResponse.json({ besoins, besoinsDispo: !bes.error, dernierPrix, articles: art.data, inventaires, achats, conso, estime, dernierInventaire: dernier ? dernier.id : null });
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
        fournisseur: txt(body.fournisseur, 120),
        seuil_alerte: body.seuil_alerte === "" || body.seuil_alerte == null ? null : Math.max(0, nombre(body.seuil_alerte) ?? 0),
        actif: body.actif !== false,
      };
      if (typeof body.durable === "boolean") champs.durable = body.durable;
      if (Array.isArray(body.alias)) champs.alias = body.alias.map((a) => txt(a, 80)).filter(Boolean).slice(0, 20);
      if (!body.id && !body.forcer) {
        const { data: existants } = await db.from("stock_articles").select("id, nom, categorie").eq("actif", true);
        const proches = (existants || []).filter((a) => sontDoublons({ nom, categorie: champs.categorie }, a) || sansAccents(a.nom).trim() === sansAccents(nom).trim());
        if (proches.length) return NextResponse.json({ error: `Un article proche existe déjà : « ${proches.map((a) => a.nom).join("», «")} ». Utilisez-le, ou confirmez la création.`, similaires: proches }, { status: 409 });
      }
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
        .map((l) => ({ article_id: l.articleId, quantite: nombre(l.quantite), prix: l.prix === "" || l.prix == null ? null : nombre(l.prix), libelle: l.libelle }))
        .filter((l) => l.article_id && l.quantite != null && l.quantite > 0);
      if (!lignes.length) return NextResponse.json({ error: "Aucune ligne valide à enregistrer." }, { status: 400 });
      const { error } = await db.from("stock_achats").insert(lignes.map((l) => ({
        article_id: l.article_id, quantite: l.quantite, prix_unitaire: l.prix != null && l.prix >= 0 ? l.prix : null, date_achat: date,
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
        .map((l) => ({ nom: txt(l.nom, 120), categorie: txt(l.categorie, 60), unite: txt(l.unite, 30), fournisseur: txt(l.fournisseur, 120), quantite: nombre(l.quantite), datePeremption: DATE_OK.test(l.datePeremption || "") ? l.datePeremption : null }))
        .filter((l) => l.nom && l.quantite != null && l.quantite >= 0);
      if (!brut.length) return NextResponse.json({ error: "Aucune ligne exploitable dans l'import." }, { status: 400 });
      const cat = await catalogue();
      const parNom = new Map(cat.map((a) => [sansAccents(a.nom).trim(), a.id]));
      const lignes = [];
      for (const l of brut) {
        let id = parNom.get(sansAccents(l.nom).trim());
        if (!id) {
          const { data, error } = await db.from("stock_articles").insert({ nom: l.nom, categorie: l.categorie, unite: l.unite || "unité", fournisseur: l.fournisseur }).select("id").single();
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

    // Besoin d'une manifestation pour un ou plusieurs articles (remplace la valeur existante).
    case "besoins": {
      const manif = txt(body.manifestation, 120);
      if (!manif) return NextResponse.json({ error: "Nom de la manifestation obligatoire." }, { status: 400 });
      const lignes = (Array.isArray(body.lignes) ? body.lignes : []).slice(0, 500)
        .map((l) => ({ manifestation: manif, article_id: l.articleId, quantite: nombre(l.quantite), updated_at: new Date().toISOString(), libelle: l.libelle }))
        .filter((l) => l.article_id && l.quantite != null && l.quantite >= 0);
      if (!lignes.length) return NextResponse.json({ error: "Aucune ligne valide à enregistrer." }, { status: 400 });
      const { error } = await db.from("stock_besoins").upsert(lignes.map(({ libelle, ...l }) => l), { onConflict: "manifestation,article_id" });
      if (error) return NextResponse.json({ error: error.code === "42P01" ? "La migration 0064 (besoins) n'est pas encore passée." : error.message }, { status: 500 });
      const cat = await catalogue();
      for (const l of lignes) await apprendreAlias(l.article_id, l.libelle, cat);
      return NextResponse.json({ ok: true });
    }

    case "supprimer_besoin": {
      const { error } = await db.from("stock_besoins").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Charge l'inventaire de départ préparé à partir du tableau Excel du Sou
    // (feuilles STOCK et Matériel). Les articles existants (même nom) sont réutilisés.
    case "importer_depart": {
      const date = DATE_OK.test(body.date || "") ? body.date : aujourdhuiIso();
      const { count } = await db.from("stock_inventaires").select("id", { count: "exact", head: true }).like("libelle", "Inventaire de départ%");
      if (count > 0) return NextResponse.json({ error: "L'inventaire de départ a déjà été chargé (supprimez-le dans « Consommation » pour le recharger)." }, { status: 409 });
      const cat = await catalogue();
      const parNom = new Map(cat.map((a) => [sansAccents(a.nom).trim(), a.id]));
      // Insertion groupée (une seule requête) : l'ancienne boucle, article par article, dépassait le délai.
      const manquants = depart.filter((l) => !parNom.has(sansAccents(l.nom).trim()));
      if (manquants.length) {
        let { data: crees, error } = await db.from("stock_articles")
          .insert(manquants.map((l) => ({ nom: l.nom, categorie: l.categorie, unite: l.unite || "unité", fournisseur: l.fournisseur, durable: !!l.durable, observation: l.observation }))).select("id, nom");
        if (error && error.code === "42703") ({ data: crees, error } = await db.from("stock_articles")
          .insert(manquants.map((l) => ({ nom: l.nom, categorie: l.categorie, unite: l.unite || "unité", fournisseur: l.fournisseur }))).select("id, nom"));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const a of crees) parNom.set(sansAccents(a.nom).trim(), a.id);
      }
      const lignes = depart.filter((l) => l.quantite != null)
        .map((l) => ({ article_id: parNom.get(sansAccents(l.nom).trim()), quantite: l.quantite, date_peremption: null }));
      const { data: inv, error } = await db.from("stock_inventaires").insert({ date_inventaire: date, libelle: "Inventaire de départ (tableau Excel du Sou)", note: "Partiel : à compléter et mettre à jour avant le Marché de Noël.", created_by: auth.parent.id }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const { error: e2 } = await db.from("stock_inventaire_lignes").insert(lignes.map((l) => ({ ...l, inventaire_id: inv.id })));
      if (e2) { await db.from("stock_inventaires").delete().eq("id", inv.id); return NextResponse.json({ error: e2.message }, { status: 500 }); }
      return NextResponse.json({ ok: true, articles: depart.length, lignes: lignes.length });
    }

    // Fusionne deux articles qui désignaient la même chose : tout l'historique
    // (inventaires, achats, besoins) passe sur l'article gardé, l'ancien nom
    // devient un alias (la dictée le reconnaîtra), l'autre article disparaît.
    case "fusionner": {
      const { garderId, retirerId } = body;
      if (!garderId || !retirerId || garderId === retirerId) return NextResponse.json({ error: "Choisissez deux articles différents." }, { status: 400 });
      const { data: deux } = await db.from("stock_articles").select("*").in("id", [garderId, retirerId]);
      const garde = deux?.find((a) => a.id === garderId), retire = deux?.find((a) => a.id === retirerId);
      if (!garde || !retire) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
      for (const t of ["stock_inventaire_lignes", "stock_achats"]) {
        const { error } = await db.from(t).update({ article_id: garderId }).eq("article_id", retirerId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // besoins : un seul par (manifestation, article) ; on garde celui de l'article conservé s'il existe
      const { data: bes, error: eb } = await db.from("stock_besoins").select("*").in("article_id", [garderId, retirerId]);
      if (!eb && bes) {
        const dejaGardes = new Set(bes.filter((b) => b.article_id === garderId).map((b) => b.manifestation));
        for (const b of bes.filter((x) => x.article_id === retirerId)) {
          if (dejaGardes.has(b.manifestation)) await db.from("stock_besoins").delete().eq("id", b.id);
          else await db.from("stock_besoins").update({ article_id: garderId }).eq("id", b.id);
        }
      }
      const alias = [...new Set([...(garde.alias || []), retire.nom, ...(retire.alias || [])])].filter((a) => sansAccents(a) !== sansAccents(garde.nom)).slice(-20);
      await db.from("stock_articles").update({ alias, fournisseur: garde.fournisseur || retire.fournisseur }).eq("id", garderId);
      const { error } = await db.from("stock_articles").delete().eq("id", retirerId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Remet les catégories (corrigées) du fichier de départ sur les articles déjà créés.
    case "recategoriser_depart": {
      const { data: arts } = await db.from("stock_articles").select("id, nom");
      const parNom = new Map((arts || []).map((a) => [sansAccents(a.nom).trim(), a.id]));
      let n = 0;
      for (const l of depart) {
        const id = parNom.get(sansAccents(l.nom).trim());
        if (!id) continue;
        const { error } = await db.from("stock_articles").update({ categorie: l.categorie }).eq("id", id);
        if (!error) n++;
      }
      return NextResponse.json({ ok: true, modifies: n });
    }

    default:
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }
}
