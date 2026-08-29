"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../admin-shell";
import {
  BLOCK_TYPES,
  CHAMPS_FUSION,
  COULEURS_TEXTE,
  DEFAULT_RECIPIENT,
  EMOJIS,
  TAILLES_TEXTE,
  TEMPLATES,
  newBlock,
  renderBlocksToHtml,
  renderBlocksToText,
} from "../../lib/emailBlocks";

export default function AdminEmailsPage() {
  return (
    <AdminShell title="Envoi d'e-mails">
      {(token, parent) => <EnvoiEmails token={token} parent={parent} />}
    </AdminShell>
  );
}

const NIVEAUX = [
  { key: "maternelle", label: "Maternelle (PS, MS, GS)" },
  { key: "elementaire", label: "Élémentaire (CP au CM2)" },
];

// Pause entre deux vagues d'envoi (cf. app/lib/emailCampagne.js : ~20
// e-mails par vague). Laisse respirer le serveur d'envoi et évite un pic
// de centaines d'e-mails en quelques secondes.
const PAUSE_ENTRE_VAGUES_MS = 1500;

const CANAUX = {
  sender: "Sender — adapté à l'envoi en masse",
  smtp: "SMTP Infomaniak — déconseillé pour un envoi à toute l'école (~450)",
  aucun: "aucun canal configuré — rien ne partira",
};

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function EnvoiEmails({ token, parent }) {
  const [classesDisponibles, setClassesDisponibles] = useState([]);
  const [campagnes, setCampagnes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState("toute");
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [adherents, setAdherents] = useState("tous");
  // Contacts légers (email_contacts) : adresses récoltées sans fiche famille.
  const [contactsCount, setContactsCount] = useState(0);
  const [inclureContacts, setInclureContacts] = useState(false);
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState(() => TEMPLATES[0].blocks());
  const [previewChoix, setPreviewChoix] = useState("generique-adherent");
  // Planning bénévoles à joindre à la campagne (id d'événement, "" = aucun).
  const [benevolesEvenements, setBenevolesEvenements] = useState([]);
  const [benevolesEvenementId, setBenevolesEvenementId] = useState("");

  const [apercu, setApercu] = useState(null);
  const [busyApercu, setBusyApercu] = useState(false);
  const [busyEnvoi, setBusyEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [error, setError] = useState("");

  // Double validation : l'envoi réel ne part qu'après confirmation explicite.
  const [confirmation, setConfirmation] = useState(false);
  const [confirmCoche, setConfirmCoche] = useState(false);
  // Envoi par vagues en cours : { campaignId, sent, total, done, enPause, enErreur }.
  const [progres, setProgres] = useState(null);
  const stopRef = useRef(false);

  const [testEmail, setTestEmail] = useState("");
  const [busyTest, setBusyTest] = useState(false);
  const [testResultat, setTestResultat] = useState(null);

  const charger = useCallback(async () => {
    if (!token) return;
    const [res, resContacts] = await Promise.all([
      fetch("/api/admin/emails", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/admin/emails/contacts", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const data = await res.json();
    const dataContacts = await resContacts.json();
    setClassesDisponibles(data.classes || []);
    setCampagnes(data.campagnes || []);
    setBenevolesEvenements(data.benevolesEvenements || []);
    setContactsCount(data.contactsCount || 0);
    setContacts(dataContacts.contacts || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (parent?.email && !testEmail) setTestEmail(parent.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent]);

  function segment() {
    return {
      scope,
      classes: scope === "toute" ? [] : classes,
      niveaux: scope === "toute" ? [] : niveaux,
      adherents,
      inclureContacts,
    };
  }

  function toggle(list, setList, value) {
    setList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function voirApercu() {
    setBusyApercu(true);
    setError("");
    setResultat(null);
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ segment: segment(), dryRun: true }),
    });
    const data = await res.json();
    setBusyApercu(false);
    if (!res.ok) {
      setError(data.error || "Erreur.");
      return null;
    }
    setApercu(data);
    return data;
  }

  const previewRecipient = useMemo(() => {
    if (previewChoix === "generique-adherent") return { ...DEFAULT_RECIPIENT, adherent: true, parentId: null };
    if (previewChoix === "generique-non-adherent") return { ...DEFAULT_RECIPIENT, adherent: false, parentId: null };
    const contact = contacts.find((c) => c.parentId === previewChoix);
    if (!contact) return { ...DEFAULT_RECIPIENT, adherent: true, parentId: null };
    return {
      firstName: contact.firstName,
      lastName: contact.lastName,
      adherent: contact.adherent,
      parentId: contact.parentId,
    };
  }, [previewChoix, contacts]);
  const html = useMemo(
    () => renderBlocksToHtml(blocks, { subject, recipient: previewRecipient }),
    [blocks, subject, previewRecipient]
  );
  const contenuVide = blocks.every((b) => {
    if (b.type === "heading" || b.type === "paragraph") return !b.text?.trim();
    if (b.type === "button" || b.type === "image") return !b.url?.trim();
    if (b.type === "colonnes") {
      const rempli = (c) => (c?.kind === "image" ? !!c.url?.trim() : !!c?.text?.trim());
      return !rempli(b.gauche) && !rempli(b.droite);
    }
    return true;
  });

  // Étape 1 : clic sur « Envoyer » → on rafraîchit le nombre de
  // destinataires et on ouvre le panneau de confirmation. Rien ne part.
  async function ouvrirConfirmation() {
    if (!subject.trim() || contenuVide) {
      setError("Merci de renseigner le sujet et au moins un bloc avec du contenu.");
      return;
    }
    setError("");
    setResultat(null);
    setConfirmCoche(false);
    const data = await voirApercu();
    if (!data) return;
    setConfirmation(true);
  }

  // Étape 2 : confirmation cochée → on crée la campagne et on envoie la
  // première vague, puis on enchaîne les suivantes.
  async function demarrerEnvoi() {
    setConfirmation(false);
    setBusyEnvoi(true);
    setError("");
    setResultat(null);
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        segment: segment(),
        subject,
        contentBlocks: blocks,
        benevolesEvenementId: benevolesEvenementId || null,
      }),
    });
    const data = await res.json();
    setBusyEnvoi(false);
    if (!res.ok) {
      setError(data.error || "Erreur.");
      return;
    }
    if (!data.mailConfigured) {
      setResultat(data);
      setApercu(null);
      return;
    }
    const etat = {
      campaignId: data.campaignId,
      sent: data.sentCount,
      total: data.recipientsCount,
      done: data.done,
    };
    setProgres(etat);
    if (data.done) {
      finaliser(etat);
    } else {
      boucleEnvoi(data.campaignId);
    }
  }

  // Enchaîne les vagues via /api/admin/emails/continuer, avec une pause
  // entre chaque, jusqu'à la fin ou une mise en pause.
  async function boucleEnvoi(campaignId) {
    stopRef.current = false;
    setProgres((p) => ({ ...(p || {}), campaignId, enPause: false, enErreur: false }));
    while (!stopRef.current) {
      await attendre(PAUSE_ENTRE_VAGUES_MS);
      if (stopRef.current) break;
      let data;
      try {
        const res = await fetch("/api/admin/emails/continuer", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ campaignId }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur pendant l'envoi.");
      } catch (e) {
        setProgres((p) => ({ ...(p || {}), enErreur: true }));
        setError(e.message + " L'envoi peut être repris.");
        return;
      }
      const etat = {
        campaignId,
        sent: data.sentCount,
        total: data.recipientsCount,
        done: data.done,
      };
      setProgres(etat);
      if (data.done) {
        finaliser(etat);
        return;
      }
    }
    // Sortie de boucle sans « done » = mise en pause manuelle.
    setProgres((p) => ({ ...(p || {}), enPause: true }));
  }

  function mettreEnPause() {
    stopRef.current = true;
  }

  function finaliser(etat) {
    setResultat({
      mailConfigured: true,
      sentCount: etat.sent,
      recipientsCount: etat.total,
    });
    setProgres(null);
    setApercu(null);
    setSubject("");
    setBlocks(TEMPLATES[0].blocks());
    setBenevolesEvenementId("");
    setInclureContacts(false);
    charger();
  }

  async function envoyerTest() {
    if (!testEmail.trim() || !subject.trim() || contenuVide) {
      setError("Merci de renseigner l'adresse de test, le sujet et le contenu.");
      return;
    }
    setBusyTest(true);
    setTestResultat(null);
    setError("");
    const res = await fetch("/api/admin/emails/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: testEmail,
        subject,
        contentBlocks: blocks,
        recipient: previewRecipient,
        benevolesEvenementId: benevolesEvenementId || null,
      }),
    });
    const data = await res.json();
    setBusyTest(false);
    if (!res.ok) {
      setTestResultat({ ok: false, message: data.error || "Erreur." });
      return;
    }
    setTestResultat({ ok: true, message: `Test envoyé à ${testEmail}.` });
  }

  function reprendreCampagne(c) {
    setSubject(c.subject);
    setBlocks(c.content_blocks && c.content_blocks.length > 0 ? c.content_blocks : [newBlock("paragraph")]);
    setBenevolesEvenementId(c.benevoles_evenement_id || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Reprend l'envoi d'une campagne restée « en cours » (onglet fermé,
  // fonction coupée, mise en pause).
  function reprendreEnvoi(c) {
    setError("");
    setResultat(null);
    setProgres({
      campaignId: c.id,
      sent: c.sent_count,
      total: c.recipients_count,
      done: false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    boucleEnvoi(c.id);
  }

  if (loading) {
    return <p className="text-slate-500">Chargement...</p>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold text-sou-blue mb-4">Destinataires</h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setScope("toute")}
            className={`px-3 py-1.5 rounded-full text-sm ${
              scope === "toute" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Toute l&apos;école
          </button>
          <button
            onClick={() => setScope("personnalise")}
            className={`px-3 py-1.5 rounded-full text-sm ${
              scope === "personnalise" ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Sélection personnalisée
          </button>
        </div>

        {scope === "personnalise" && (
          <div className="grid gap-6 sm:grid-cols-2 mb-4 border border-slate-200 rounded-xl p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Niveaux</p>
              {NIVEAUX.map((n) => (
                <label key={n.key} className="flex items-center gap-2 text-sm mb-1">
                  <input
                    type="checkbox"
                    checked={niveaux.includes(n.key)}
                    onChange={() => toggle(niveaux, setNiveaux, n.key)}
                  />
                  {n.label}
                </label>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Classes</p>
              <div className="flex flex-wrap gap-2">
                {classesDisponibles.map((c) => (
                  <label
                    key={c}
                    className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
                      classes.includes(c)
                        ? "bg-sou-blue text-white border-sou-blue"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={classes.includes(c)}
                      onChange={() => toggle(classes, setClasses, c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {[
            { key: "tous", label: "Tous statuts" },
            { key: "adherents", label: "Adhérents à jour uniquement" },
            { key: "non_adherents", label: "Non-adhérents uniquement" },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setAdherents(o.key)}
              className={`px-3 py-1.5 rounded-full text-sm ${
                adherents === o.key ? "bg-sou-blue text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {contactsCount > 0 && (
          <label className="flex items-start gap-2 text-sm mb-4">
            <input
              type="checkbox"
              checked={inclureContacts && adherents !== "adherents"}
              disabled={adherents === "adherents"}
              onChange={(e) => setInclureContacts(e.target.checked)}
              className="mt-0.5"
            />
            <span className={adherents === "adherents" ? "text-slate-400" : "text-slate-600"}>
              Ajouter les {contactsCount} contact{contactsCount > 1 ? "s" : ""} sans fiche famille{" "}
              <span className="text-xs text-slate-400">
                (adresses récoltées ; doublons avec un parent déjà en base exclus)
              </span>
              {adherents === "adherents" && (
                <span className="block text-xs text-amber-700">
                  Indisponible avec « Adhérents à jour uniquement » : ces contacts n&apos;ont pas d&apos;adhésion.
                </span>
              )}
            </span>
          </label>
        )}

        <button
          onClick={voirApercu}
          disabled={busyApercu}
          className="text-sm font-semibold text-sou-blue hover:text-sou-gold disabled:opacity-60"
        >
          {busyApercu ? "Calcul..." : "Aperçu des destinataires"}
        </button>

        {apercu && (
          <div className="text-sm text-slate-500 mt-2 space-y-0.5">
            <p>
              {apercu.count} destinataire{apercu.count > 1 ? "s" : ""}
              {apercu.count > 1 ? " (un par parent, désinscrits exclus)" : ""}
              {!apercu.mailConfigured &&
                " — Envoi non configuré : l'envoi ne partira pas réellement pour l'instant."}
            </p>
            {apercu.canal && (
              <p className="text-xs">
                Canal d&apos;envoi : {CANAUX[apercu.canal] || apercu.canal}
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-sou-blue">Message</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Commencer avec un modèle :</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => setBlocks(t.blocks())}
                className="text-xs px-2.5 py-1 rounded-full border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Logo, statut d&apos;adhésion et logos des partenaires sont ajoutés automatiquement en haut et en bas de
          chaque e-mail.
        </p>

        <input
          type="text"
          placeholder="Sujet de l'e-mail"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
        />

        {benevolesEvenements.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="text-slate-600">
              Ajouter le planning des créneaux bénévoles :
            </label>
            <select
              value={benevolesEvenementId}
              onChange={(e) => setBenevolesEvenementId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Aucun</option>
              {benevolesEvenements.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nom}
                </option>
              ))}
            </select>
            {benevolesEvenementId && (
              <span className="text-xs text-slate-400">
                Le tableau des créneaux et places restantes sera inséré à l&apos;envoi
                (chiffres de ce moment-là).
              </span>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <EditeurBlocs blocks={blocks} setBlocks={setBlocks} token={token} />

          <div>
            <div className="flex items-center justify-between mb-2 gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">Aperçu avec...</p>
              <select
                value={previewChoix}
                onChange={(e) => setPreviewChoix(e.target.value)}
                className="text-xs border border-slate-300 rounded-full px-2.5 py-1 flex-1 min-w-0"
              >
                <option value="generique-adherent">Exemple générique — adhérent</option>
                <option value="generique-non-adherent">Exemple générique — non adhérent</option>
                {contacts.length > 0 && (
                  <optgroup label="Contacts réels">
                    {contacts.map((c) => (
                      <option key={c.parentId} value={c.parentId}>
                        {c.firstName} {c.lastName} — {c.adherent ? "adhérent" : "non adhérent"}
                        {c.optedOut ? " (désinscrit)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100" style={{ height: 520 }}>
              <iframe title="Aperçu de l'e-mail" srcDoc={html} className="w-full h-full" style={{ border: "none" }} />
            </div>
            {benevolesEvenementId && (
              <p className="text-xs text-slate-400 mt-2">
                Le planning des créneaux bénévoles n&apos;apparaît pas dans cet aperçu :
                il est calculé et inséré au moment de l&apos;envoi (et dans l&apos;e-mail
                de test).
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

        <div className="mt-4 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Envoyer un test</span>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="adresse@exemple.fr"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
          />
          <button
            onClick={envoyerTest}
            disabled={busyTest}
            className="text-sm font-semibold text-sou-blue border border-sou-blue px-4 py-1.5 rounded-full hover:bg-sou-blue hover:text-white transition-colors disabled:opacity-60"
          >
            {busyTest ? "Envoi..." : "Envoyer un test"}
          </button>
          {testResultat && (
            <p className={`text-xs w-full ${testResultat.ok ? "text-green-700" : "text-red-600"}`}>
              {testResultat.message}
            </p>
          )}
          <p className="text-xs text-slate-400 w-full">
            Utilise l&apos;aperçu sélectionné ci-dessus (prénom, statut d&apos;adhésion).
          </p>
        </div>

        {!confirmation && !progres && (
          <button
            onClick={ouvrirConfirmation}
            disabled={busyEnvoi || busyApercu}
            className="mt-4 bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
          >
            {busyApercu ? "Préparation..." : "Envoyer"}
          </button>
        )}

        {confirmation && (
          <div className="mt-4 border-2 border-sou-blue/40 bg-sou-blue/5 rounded-xl p-4 text-sm">
            <p className="font-semibold text-sou-blue mb-1">Confirmer l&apos;envoi</p>
            <p className="text-slate-600 mb-1">
              Vous êtes sur le point d&apos;envoyer <strong>« {subject || "(sans sujet)"} »</strong> à{" "}
              <strong>
                {apercu ? apercu.count : "…"} destinataire
                {apercu && apercu.count > 1 ? "s" : ""}
              </strong>
              {apercu?.segmentSummary ? ` — ${apercu.segmentSummary}` : ""}.
            </p>
            {apercu?.canal && (
              <p className="text-xs text-slate-500 mb-3">
                Canal d&apos;envoi : {CANAUX[apercu.canal] || apercu.canal}
              </p>
            )}
            {apercu && !apercu.mailConfigured && (
              <p className="text-amber-700 text-xs mb-3">
                Aucun canal d&apos;envoi configuré : la campagne sera enregistrée mais aucun
                e-mail ne partira automatiquement.
              </p>
            )}
            <label className="flex items-start gap-2 mb-3">
              <input
                type="checkbox"
                checked={confirmCoche}
                onChange={(e) => setConfirmCoche(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Je confirme l&apos;envoi à {apercu ? apercu.count : "…"} destinataire
                {apercu && apercu.count > 1 ? "s" : ""}.
              </span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={demarrerEnvoi}
                disabled={!confirmCoche}
                className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-40"
              >
                Confirmer l&apos;envoi
              </button>
              <button
                onClick={() => setConfirmation(false)}
                className="text-sm text-slate-500 hover:text-sou-blue px-3"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {progres && (
          <div className="mt-4 border border-slate-200 rounded-xl p-4 text-sm">
            <p className="font-medium text-slate-700 mb-2">
              {progres.enErreur
                ? "Envoi interrompu"
                : progres.enPause
                ? "Envoi en pause"
                : "Envoi en cours par vagues…"}{" "}
              {progres.sent} / {progres.total}
            </p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-sou-blue transition-all"
                style={{
                  width: `${
                    progres.total ? Math.round((progres.sent / progres.total) * 100) : 0
                  }%`,
                }}
              />
            </div>
            <div className="flex gap-3">
              {!progres.enPause && !progres.enErreur && (
                <button
                  onClick={mettreEnPause}
                  className="text-sm text-slate-500 hover:text-sou-blue px-3"
                >
                  Mettre en pause
                </button>
              )}
              {(progres.enPause || progres.enErreur) && (
                <button
                  onClick={() => boucleEnvoi(progres.campaignId)}
                  className="bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors"
                >
                  Reprendre l&apos;envoi
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Vous pouvez fermer cette page : l&apos;envoi est repris depuis l&apos;historique.
            </p>
          </div>
        )}

        {resultat && (
          <div className="mt-4 border border-slate-200 rounded-xl p-4 text-sm">
            {resultat.mailConfigured ? (
              <p className="text-green-700">
                Envoi terminé : {resultat.sentCount} / {resultat.recipientsCount} e-mail(s) partis.
              </p>
            ) : (
              <div>
                <p className="text-amber-700 font-medium mb-2">
                  Envoi non configuré : aucun e-mail n&apos;a été envoyé automatiquement. La campagne est enregistrée
                  ({resultat.recipientsCount} destinataire(s) concerné(s)) — voici les adresses à contacter en attendant :
                </p>
                <p className="text-slate-600 break-words">
                  {(resultat.destinataires || []).map((d) => d.email).join(", ")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-sou-blue mb-4">Historique</h2>
        {campagnes.length === 0 ? (
          <p className="text-slate-400 italic">Aucune campagne envoyée pour l&apos;instant.</p>
        ) : (
          <div className="space-y-3">
            {campagnes.map((c) => (
              <div key={c.id} className="border border-slate-200 rounded-xl p-4 text-sm flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sou-blue">
                    {c.subject}
                    {c.status === "en_cours" && (
                      <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                        envoi en cours
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500">
                    {c.segment_summary} — {c.sent_count}/{c.recipients_count} destinataire(s)
                    {!c.mail_configured && " (brouillon, envoi non configuré au moment de l'envoi)"}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {new Date(c.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
                  {c.status === "en_cours" && (
                    <button
                      onClick={() => reprendreEnvoi(c)}
                      disabled={!!progres}
                      className="text-xs font-semibold text-white bg-sou-blue rounded-full px-3 py-1.5 hover:bg-sou-gold disabled:opacity-50"
                    >
                      Reprendre l&apos;envoi
                    </button>
                  )}
                  <button
                    onClick={() => reprendreCampagne(c)}
                    className="text-xs font-semibold text-sou-blue hover:text-sou-gold"
                  >
                    Réutiliser le contenu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditeurBlocs({ blocks, setBlocks, token }) {
  function update(id, patch) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function remove(id) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }
  function duplicate(id) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return prev;
      const copie = { ...prev[i], id: `b${Date.now()}${Math.round(Math.random() * 10000)}` };
      return [...prev.slice(0, i + 1), copie, ...prev.slice(i + 1)];
    });
  }
  function move(id, direction) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + direction;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const copie = [...prev];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });
  }
  function add(type) {
    setBlocks((prev) => [...prev, newBlock(type)]);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Contenu (blocs)</p>

      <div className="space-y-3 mb-4">
        {blocks.map((b, i) => (
          <BlocCard
            key={b.id}
            block={b}
            token={token}
            onChange={(patch) => update(b.id, patch)}
            onRemove={() => remove(b.id)}
            onDuplicate={() => duplicate(b.id)}
            onUp={i > 0 ? () => move(b.id, -1) : null}
            onDown={i < blocks.length - 1 ? () => move(b.id, 1) : null}
          />
        ))}
        {blocks.length === 0 && (
          <p className="text-slate-400 italic text-sm">Ajoutez un bloc pour commencer.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.type}
            onClick={() => add(t.type)}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue"
          >
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Insère un champ de fusion ({{prenom}}, {{nom}}) à l'endroit du curseur
// dans un input/textarea, plutôt qu'à la fin du texte.
function inserer(ref, valeur, token, onChange) {
  const el = ref.current;
  if (!el) {
    onChange({ text: `${valeur}${token}` });
    return;
  }
  const start = el.selectionStart ?? valeur.length;
  const end = el.selectionEnd ?? valeur.length;
  const nouveau = `${valeur.slice(0, start)}${token}${valeur.slice(end)}`;
  onChange({ text: nouveau });
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + token.length;
    el.setSelectionRange(pos, pos);
  });
}

function ChampsFusion({ inputRef, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {CHAMPS_FUSION.map((c) => (
        <button
          key={c.token}
          type="button"
          onClick={() => inserer(inputRef, value, c.token, onChange)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-slate-300 text-slate-500 hover:border-sou-blue hover:text-sou-blue"
        >
          + {c.label}
        </button>
      ))}
    </div>
  );
}

// Entoure la sélection courante du textarea/input avec `avant`/`après`
// (ex: ** pour le gras). Sans sélection, insère un texte de remplacement.
function envelopperSelection(ref, value, avant, apres, onChange, texteParDefaut) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const selection = value.slice(start, end) || texteParDefaut || "";
  const nouveau = `${value.slice(0, start)}${avant}${selection}${apres}${value.slice(end)}`;
  onChange({ text: nouveau });
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + avant.length + selection.length + apres.length;
    el.setSelectionRange(pos, pos);
  });
}

function BarreOutilsTexte({ inputRef, value, onChange }) {
  const [emojiOuvert, setEmojiOuvert] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1 mb-1.5 relative">
      <button
        type="button"
        title="Gras"
        onClick={() => envelopperSelection(inputRef, value, "**", "**", onChange, "texte en gras")}
        className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue"
      >
        G
      </button>
      <button
        type="button"
        title="Lien cliquable"
        onClick={() => {
          const url = window.prompt("Adresse du lien (https://...)");
          if (!url) return;
          envelopperSelection(inputRef, value, "[", `](${url})`, onChange, "texte du lien");
        }}
        className="text-[11px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue"
      >
        🔗 Lien
      </button>
      <div className="relative">
        <button
          type="button"
          title="Emoji"
          onClick={() => setEmojiOuvert((v) => !v)}
          className="text-[11px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue"
        >
          😊 Emoji
        </button>
        {emojiOuvert && (
          <div className="absolute z-10 top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1 w-44">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  inserer(inputRef, value, e, onChange);
                  setEmojiOuvert(false);
                }}
                className="text-lg hover:bg-slate-100 rounded"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="text-[10px] text-slate-400">**gras**, sélectionnez du texte avant de cliquer</span>
    </div>
  );
}

function ReglagesTexte({ block, onChange, tailleType }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-2">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-400 uppercase">Couleur</span>
        {COULEURS_TEXTE.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            onClick={() => onChange({ color: c.value })}
            className={`w-5 h-5 rounded-full border-2 ${
              (block.color || null) === c.value ? "border-sou-blue" : "border-transparent"
            }`}
            style={{ backgroundColor: c.value || "#94a3b8" }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-400 uppercase">Taille</span>
        {TAILLES_TEXTE[tailleType].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange({ size: t.key })}
            className={`text-[11px] px-2 py-0.5 rounded border ${
              (block.size || "md") === t.key ? "border-sou-blue text-sou-blue" : "border-slate-300 text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlocCard({ block, token, onChange, onRemove, onDuplicate, onUp, onDown }) {
  const fileInput = useRef(null);
  const textInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function uploadFile(file) {
    setUploading(true);
    setUploadError("");
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await fetch("/api/admin/emails/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataUrl: reader.result, filename: file.name }),
      });
      const data = await res.json();
      setUploading(false);
      if (!res.ok) {
        setUploadError(data.error || "Envoi impossible.");
        return;
      }
      onChange({ url: data.url });
    };
    reader.readAsDataURL(file);
  }

  const label = BLOCK_TYPES.find((t) => t.type === block.type)?.label || block.type;

  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-1 text-slate-400">
          <button disabled={!onUp} onClick={onUp} className="px-1.5 disabled:opacity-30 hover:text-sou-blue" title="Monter">
            ↑
          </button>
          <button disabled={!onDown} onClick={onDown} className="px-1.5 disabled:opacity-30 hover:text-sou-blue" title="Descendre">
            ↓
          </button>
          <button onClick={onDuplicate} className="px-1.5 hover:text-sou-blue" title="Dupliquer">
            ⧉
          </button>
          <button onClick={onRemove} className="px-1.5 hover:text-red-600" title="Supprimer">
            ✕
          </button>
        </div>
      </div>

      {block.type === "heading" && (
        <div>
          <ChampsFusion inputRef={textInput} value={block.text} onChange={onChange} />
          <BarreOutilsTexte inputRef={textInput} value={block.text} onChange={onChange} />
          <input
            ref={textInput}
            type="text"
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <ReglagesTexte block={block} onChange={onChange} tailleType="heading" />
        </div>
      )}

      {block.type === "paragraph" && (
        <div>
          <ChampsFusion inputRef={textInput} value={block.text} onChange={onChange} />
          <BarreOutilsTexte inputRef={textInput} value={block.text} onChange={onChange} />
          <textarea
            ref={textInput}
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <ReglagesTexte block={block} onChange={onChange} tailleType="paragraph" />
        </div>
      )}

      {block.type === "colonnes" && (
        <div className="grid grid-cols-2 gap-3">
          <ColonneEditor
            token={token}
            valeur={block.gauche}
            onChange={(gauche) => onChange({ gauche })}
            label="Gauche"
          />
          <ColonneEditor
            token={token}
            valeur={block.droite}
            onChange={(droite) => onChange({ droite })}
            label="Droite"
          />
        </div>
      )}

      {block.type === "image" && (
        <div className="space-y-2">
          {block.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.url} alt="" className="max-h-32 rounded-lg border border-slate-200" />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue disabled:opacity-60"
            >
              {uploading ? "Envoi..." : "Choisir une image"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            />
          </div>
          {uploadError && <p className="text-red-600 text-xs">{uploadError}</p>}
          <input
            type="text"
            placeholder="ou collez une URL d'image"
            value={block.url}
            onChange={(e) => onChange({ url: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Lien au clic (optionnel)"
            value={block.link}
            onChange={(e) => onChange({ link: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {block.type === "button" && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Texte du bouton"
            value={block.text}
            onChange={(e) => onChange({ text: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Lien"
            value={block.url}
            onChange={(e) => onChange({ url: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {[
              { key: "blue", label: "Bleu" },
              { key: "gold", label: "Doré" },
            ].map((c) => (
              <button
                key={c.key}
                onClick={() => onChange({ color: c.key })}
                className={`text-xs px-3 py-1 rounded-full border ${
                  block.color === c.key ? "border-sou-blue text-sou-blue" : "border-slate-300 text-slate-500"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {block.type === "divider" && <p className="text-xs text-slate-400 italic">Ligne de séparation.</p>}

      {block.type === "spacer" && (
        <div className="flex gap-2">
          {[
            { key: "sm", label: "Petit" },
            { key: "md", label: "Moyen" },
            { key: "lg", label: "Grand" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => onChange({ size: s.key })}
              className={`text-xs px-3 py-1 rounded-full border ${
                block.size === s.key ? "border-sou-blue text-sou-blue" : "border-slate-300 text-slate-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Édition d'une des deux cases du bloc "2 colonnes" : texte ou image, avec
// un lien cliquable optionnel sur toute la case.
function ColonneEditor({ token, valeur, onChange, label }) {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file) {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await fetch("/api/admin/emails/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataUrl: reader.result, filename: file.name }),
      });
      const data = await res.json();
      setUploading(false);
      if (res.ok) onChange({ ...valeur, url: data.url });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="border border-slate-100 rounded-lg p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{label}</p>
      <div className="flex gap-1 mb-2">
        {["texte", "image"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ ...valeur, kind: k })}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              valeur.kind === k ? "border-sou-blue text-sou-blue" : "border-slate-300 text-slate-500"
            }`}
          >
            {k === "texte" ? "Texte" : "Image"}
          </button>
        ))}
      </div>

      {valeur.kind === "texte" ? (
        <textarea
          value={valeur.text || ""}
          onChange={(e) => onChange({ ...valeur, text: e.target.value })}
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
        />
      ) : (
        <div className="space-y-1.5">
          {valeur.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valeur.url} alt="" className="max-h-20 rounded border border-slate-200" />
          )}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="text-[11px] px-2 py-1 rounded-full border border-slate-300 text-slate-600 hover:border-sou-blue hover:text-sou-blue disabled:opacity-60"
          >
            {uploading ? "Envoi..." : "Choisir une image"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
          />
        </div>
      )}

      <input
        type="text"
        placeholder="Lien au clic (optionnel)"
        value={valeur.link || ""}
        onChange={(e) => onChange({ ...valeur, link: e.target.value })}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs mt-1.5"
      />
    </div>
  );
}
