"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../admin-shell";

export default function AdminEmailsPage() {
  return (
    <AdminShell title="Envoi d'e-mails">
      {(token) => <EnvoiEmails token={token} />}
    </AdminShell>
  );
}

const NIVEAUX = [
  { key: "maternelle", label: "Maternelle (PS, MS, GS)" },
  { key: "elementaire", label: "Élémentaire (CP au CM2)" },
];

function EnvoiEmails({ token }) {
  const [classesDisponibles, setClassesDisponibles] = useState([]);
  const [campagnes, setCampagnes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState("toute");
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [adherents, setAdherents] = useState("tous");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [apercu, setApercu] = useState(null);
  const [busyApercu, setBusyApercu] = useState(false);
  const [busyEnvoi, setBusyEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [error, setError] = useState("");

  const charger = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/emails", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setClassesDisponibles(data.classes || []);
    setCampagnes(data.campagnes || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    charger();
  }, [charger]);

  function segment() {
    return { scope, classes: scope === "toute" ? [] : classes, niveaux: scope === "toute" ? [] : niveaux, adherents };
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
      return;
    }
    setApercu(data);
  }

  async function envoyer() {
    if (!subject.trim() || !message.trim()) {
      setError("Merci de renseigner le sujet et le message.");
      return;
    }
    setBusyEnvoi(true);
    setError("");
    setResultat(null);
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ segment: segment(), subject, message }),
    });
    const data = await res.json();
    setBusyEnvoi(false);
    if (!res.ok) {
      setError(data.error || "Erreur.");
      return;
    }
    setResultat(data);
    setApercu(null);
    setSubject("");
    setMessage("");
    charger();
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

        <button
          onClick={voirApercu}
          disabled={busyApercu}
          className="text-sm font-semibold text-sou-blue hover:text-sou-gold disabled:opacity-60"
        >
          {busyApercu ? "Calcul..." : "Aperçu des destinataires"}
        </button>

        {apercu && (
          <p className="text-sm text-slate-500 mt-2">
            {apercu.count} famille{apercu.count > 1 ? "s" : ""} correspondante{apercu.count > 1 ? "s" : ""}
            {!apercu.mailConfigured && " — SMTP non configuré : l'envoi ne partira pas réellement pour l'instant."}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-sou-blue mb-4">Message</h2>
        <input
          type="text"
          placeholder="Sujet"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
        />
        <textarea
          placeholder="Votre message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />

        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

        <button
          onClick={envoyer}
          disabled={busyEnvoi}
          className="mt-4 bg-sou-blue text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
        >
          {busyEnvoi ? "Envoi..." : "Envoyer"}
        </button>

        {resultat && (
          <div className="mt-4 border border-slate-200 rounded-xl p-4 text-sm">
            {resultat.mailConfigured ? (
              <p className="text-green-700">
                Envoyé à {resultat.sentCount} / {resultat.recipientsCount} famille(s).
              </p>
            ) : (
              <div>
                <p className="text-amber-700 font-medium mb-2">
                  SMTP non configuré : aucun e-mail n&apos;a été envoyé automatiquement. La campagne est enregistrée
                  ({resultat.recipientsCount} famille(s) concernée(s)) — voici les adresses à contacter en attendant :
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
              <div key={c.id} className="border border-slate-200 rounded-xl p-4 text-sm">
                <p className="font-semibold text-sou-blue">{c.subject}</p>
                <p className="text-slate-500">
                  {c.segment_summary} — {c.sent_count}/{c.recipients_count} destinataire(s)
                  {!c.mail_configured && " (brouillon, SMTP non configuré au moment de l'envoi)"}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {new Date(c.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
