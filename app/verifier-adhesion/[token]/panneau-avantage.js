"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

const CLE_STOCKAGE_PARTENAIRE = "sou_partenaire_session";

function formatHeure(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Affiché sous le statut de la carte. Reste invisible pour une famille qui
// consulte sa propre carte : le panneau ne se déclenche que si la personne
// qui a ouvert la page est soit connectée au back-office avec le droit
// "avantages", soit un partenaire authentifié par code PIN dans ce même
// navigateur (via /partenaire).
export default function PanneauAvantage({ familyId, token }) {
  const [chargement, setChargement] = useState(true);
  const [accessToken, setAccessToken] = useState(null);
  const [avantagesInternes, setAvantagesInternes] = useState([]);
  const [sessionPartenaire, setSessionPartenaire] = useState(null);
  const [avantagesPartenaire, setAvantagesPartenaire] = useState([]);

  useEffect(() => {
    let annule = false;

    async function verifierBureau() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return false;

      const resMoi = await fetch("/api/admin/moi", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resMoi.ok) return false;
      const moi = await resMoi.json();
      if (!moi.parent?.permissions?.avantages) return false;

      const res = await fetch(`/api/admin/avantages/pour-famille?familyId=${familyId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (annule) return true;
      setAccessToken(session.access_token);
      setAvantagesInternes(data.avantages || []);
      return true;
    }

    async function verifierPartenaire() {
      const brut = window.localStorage.getItem(CLE_STOCKAGE_PARTENAIRE);
      if (!brut) return;
      let session;
      try {
        session = JSON.parse(brut);
      } catch {
        return;
      }
      if (!session?.partenaireId || !session?.pin) return;

      const res = await fetch("/api/partenaire/pour-famille", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partenaireId: session.partenaireId, pin: session.pin, token }),
      });
      const data = await res.json();
      if (annule || !res.ok) return;
      setSessionPartenaire(session);
      setAvantagesPartenaire(data.avantages || []);
    }

    async function init() {
      const estBureau = await verifierBureau();
      if (!estBureau) await verifierPartenaire();
      if (!annule) setChargement(false);
    }

    init();
    return () => {
      annule = true;
    };
  }, [familyId, token]);

  if (chargement) return null;
  if (avantagesInternes.length === 0 && avantagesPartenaire.length === 0) return null;

  return (
    <div className="mt-4 border border-sou-blue/20 rounded-2xl p-5 bg-sou-blue/5">
      <p className="text-sm font-semibold text-sou-blue mb-3">Avantages</p>
      <div className="space-y-3">
        {avantagesInternes.map((a) => (
          <BoutonAvantage
            key={a.id}
            label={a.label}
            initialFois={a.fois}
            limite={a.limite}
            usedAt={a.usedAt}
            onValider={async () => {
              const res = await fetch("/api/admin/avantages/valider", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ avantageId: a.id, token }),
              });
              const data = await res.json();
              return { ok: res.ok, ...data };
            }}
          />
        ))}

        {avantagesPartenaire.map((a) => (
          <BoutonAvantage
            key={a.id}
            label={a.label}
            initialFois={a.fois}
            limite={a.limite}
            usedAt={a.usedAt}
            bloque={a.bloque ? "Adhésion non à jour : offre non applicable." : null}
            onValider={async () => {
              const res = await fetch("/api/partenaire/valider", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  partenaireId: sessionPartenaire.partenaireId,
                  pin: sessionPartenaire.pin,
                  avantageId: a.id,
                  token,
                }),
              });
              const data = await res.json();
              return { ok: res.ok, ...data };
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BoutonAvantage({ label, initialFois, limite, usedAt, bloque, onValider }) {
  const [fois, setFois] = useState(initialFois || 0);
  const [heure, setHeure] = useState(usedAt);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const limiteAtteinte = fois >= limite;

  async function valider() {
    setEnvoi(true);
    setErreur("");
    try {
      const data = await onValider();
      if (data.ok) {
        setFois(data.fois ?? fois + 1);
        setHeure(new Date().toISOString());
      } else if (data.limiteAtteinte) {
        setFois(data.fois ?? limite);
        setHeure(data.usedAt || heure);
      } else {
        setErreur(data.error || "Une erreur est survenue.");
      }
    } catch {
      setErreur("Une erreur est survenue.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {fois > 0 && (
          <p className="text-xs text-slate-400 mt-0.5">
            Pris {fois}/{limite}
            {heure ? ` — dernière fois le ${formatHeure(heure)}` : ""}
          </p>
        )}
        {bloque && !limiteAtteinte && <p className="text-xs text-red-600 mt-0.5">{bloque}</p>}
        {erreur && <p className="text-xs text-red-600 mt-0.5">{erreur}</p>}
      </div>
      {limiteAtteinte ? (
        <span className="text-green-600 text-lg">✓</span>
      ) : (
        <button
          onClick={valider}
          disabled={envoi || Boolean(bloque)}
          className="bg-sou-blue text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {envoi ? "..." : "Valider"}
        </button>
      )}
    </div>
  );
}
