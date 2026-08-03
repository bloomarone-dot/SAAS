import { useEffect, useState } from "react";

import { DashboardSection } from "@/modules/admin/components/AdminUi";
import { orderApi } from "../services/orderApi";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export function CashDrawerSessionPanel({ adminReviewOnly = false, onMessage }) {
  const [session, setSession] = useState(null);
  const [openingFloat, setOpeningFloat] = useState("");
  const [closingCounted, setClosingCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    setLoading(true);
    try {
      const data = await orderApi.getCashSession();
      setSession(data);
      if (data?.status === "OPEN") {
        setClosingCounted(String(Math.round(Number(data.expected_in_drawer || 0))));
      }
    } catch (error) {
      onMessage?.(error.message || "Impossible de charger la session de caisse.");
    } finally {
      setLoading(false);
    }
  }

  async function openSession(event) {
    event.preventDefault();
    const amount = Math.round(Number(String(openingFloat).replace(/\s/g, "").replace(",", ".")));
    if (!Number.isFinite(amount) || amount < 0) {
      onMessage?.("Indiquez un fond de caisse valide.");
      return;
    }
    setBusy(true);
    try {
      const data = await orderApi.openCashSession({
        opening_float: amount,
        notes: notes.trim() || null,
      });
      setSession(data);
      setNotes("");
      setClosingCounted(String(Math.round(Number(data.expected_in_drawer || 0))));
      onMessage?.(`Fond de caisse enregistré : ${money(amount)}`);
    } catch (error) {
      onMessage?.(error.message || "Ouverture de caisse impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function closeSession(event) {
    event.preventDefault();
    const amount = Math.round(Number(String(closingCounted).replace(/\s/g, "").replace(",", ".")));
    if (!Number.isFinite(amount) || amount < 0) {
      onMessage?.("Indiquez le montant compté en caisse.");
      return;
    }
    if (!window.confirm(`Clôturer la caisse avec ${money(amount)} comptés ?`)) return;
    setBusy(true);
    try {
      const data = await orderApi.closeCashSession({
        closing_counted: amount,
        notes: notes.trim() || null,
      });
      setSession(data);
      setNotes("");
      onMessage?.(
        data.variance === 0
          ? "Caisse clôturée : tiroir conforme."
          : `Caisse clôturée. Écart tiroir : ${money(data.variance)}`,
      );
    } catch (error) {
      onMessage?.(error.message || "Clôture de caisse impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardSection title="Fond de caisse">
        <p className="text-sm font-semibold text-slate-500">Chargement de la session…</p>
      </DashboardSection>
    );
  }

  if (!session || session.status === "NONE") {
    return (
      <DashboardSection
        title="Fond de caisse"
        description="Avant de commencer, indiquez l’argent déjà présent dans le tiroir."
      >
        {adminReviewOnly ? (
          <p className="text-sm font-semibold text-slate-600">Aucune session ouverte aujourd’hui.</p>
        ) : (
          <form onSubmit={openSession} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Fond d’ouverture (FCFA)</span>
              <input
                required
                type="number"
                min="0"
                step="1"
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                className="form-control"
                placeholder="Ex: 10000"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Note (optionnel)</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="form-control"
                placeholder="Ex: billets de la veille"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-lg bg-emerald-700 font-black text-white disabled:opacity-60"
            >
              {busy ? "Enregistrement…" : "Ouvrir la caisse"}
            </button>
          </form>
        )}
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="Fond de caisse"
      description={
        session.status === "OPEN"
          ? "En fin de journée : le tiroir doit contenir le fond + les ventes en espèces."
          : "Session clôturée pour aujourd’hui."
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Fond d’ouverture" value={money(session.opening_float)} />
        <Metric label="Ventes du jour" value={money(session.sales_total)} />
        <Metric label="Dont espèces" value={money(session.cash_sales)} />
        <Metric label="Dont Mobile Money" value={money(session.mobile_sales)} />
        <Metric label="Attendu en tiroir" value={money(session.expected_in_drawer)} highlight />
        <Metric label="Total journée (fond + ventes)" value={money(session.expected_day_total)} />
      </div>

      {session.status === "CLOSED" ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-600">Montant compté à la clôture</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{money(session.closing_counted)}</p>
          <p className={`mt-2 text-sm font-bold ${Number(session.variance || 0) === 0 ? "text-emerald-700" : "text-amber-700"}`}>
            Écart tiroir : {money(session.variance)}
          </p>
        </div>
      ) : !adminReviewOnly ? (
        <form onSubmit={closeSession} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Argent compté dans le tiroir (FCFA)</span>
            <input
              required
              type="number"
              min="0"
              step="1"
              value={closingCounted}
              onChange={(event) => setClosingCounted(event.target.value)}
              className="form-control"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Note de clôture (optionnel)</span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="form-control"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-lg bg-slate-900 font-black text-white disabled:opacity-60"
          >
            {busy ? "Clôture…" : "Clôturer la caisse"}
          </button>
        </form>
      ) : null}
    </DashboardSection>
  );
}

function Metric({ label, value, highlight = false }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-emerald-50" : "bg-slate-50"}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${highlight ? "text-emerald-800" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}
