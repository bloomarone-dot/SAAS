import { useCallback, useEffect, useState } from "react";

import { DashboardSection } from "@/modules/admin/components/AdminUi";
import { orderApi } from "../services/orderApi";
import {
  addLocalCashMovement,
  closeLocalCashSession,
  loadCashSessionMerged,
  MOVEMENT_TYPES,
  openLocalCashSession,
  resumeLocalCashSession,
  CashSessionConflictError,
} from "@/offline/cashSession";
import { isNetworkError, shouldPreferLocalData } from "@/utils/network";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

const MOVEMENT_LABELS = {
  [MOVEMENT_TYPES.DEPOSIT]: "Ajout de fonds",
  [MOVEMENT_TYPES.WITHDRAWAL]: "Retrait",
  [MOVEMENT_TYPES.EXPENSE]: "Dépense",
  [MOVEMENT_TYPES.ADJUSTMENT]: "Correction",
  [MOVEMENT_TYPES.REFUND]: "Remboursement",
};

export function CashDrawerSessionPanel({
  adminReviewOnly = false,
  onMessage,
  restaurantId,
  receipts = [],
  currentUser = null,
}) {
  const [session, setSession] = useState(null);
  const [openingFloat, setOpeningFloat] = useState("");
  const [closingCounted, setClosingCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [movementType, setMovementType] = useState(MOVEMENT_TYPES.DEPOSIT);
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [sessionConflict, setSessionConflict] = useState(null);

  const loadSession = useCallback(async () => {
    if (!restaurantId) {
      setSession(null);
      setLoading(false);
      return;
    }

    let painted = false;
    async function paintLocal() {
      const local = await loadCashSessionMerged(restaurantId, null, { receipts });
      setSession(local);
      if (local?.status === "OPEN") {
        setClosingCounted(String(Math.round(Number(local.expected_in_drawer || 0))));
      }
      painted = true;
      setLoading(false);
      return local;
    }

    try {
      await paintLocal();
    } catch (error) {
      if (!painted) {
        onMessage?.(error.message || "Impossible de charger la session locale.");
        setLoading(false);
      }
    }

    if (shouldPreferLocalData()) return;

    try {
      const remote = await orderApi.getCashSession();
      const merged = await loadCashSessionMerged(restaurantId, remote, { receipts });
      setSession(merged);
      if (merged?.status === "OPEN") {
        setClosingCounted(String(Math.round(Number(merged.expected_in_drawer || 0))));
      }
    } catch (error) {
      if (!isNetworkError(error) && !painted) {
        onMessage?.(error.message || "Impossible de charger la session de caisse.");
      }
    } finally {
      setLoading(false);
    }
  }, [restaurantId, receipts, onMessage]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    function onCashSessionChanged(event) {
      if (event.detail?.restaurantId && event.detail.restaurantId !== restaurantId) return;
      loadSession();
    }
    window.addEventListener("cash-session-changed", onCashSessionChanged);
    return () => window.removeEventListener("cash-session-changed", onCashSessionChanged);
  }, [loadSession, restaurantId]);

  async function openSession(event) {
    event.preventDefault();
    setSessionConflict(null);
    const amount = Math.round(Number(String(openingFloat).replace(/\s/g, "").replace(",", ".")));
    if (!Number.isFinite(amount) || amount < 0) {
      onMessage?.("Indiquez un fond de caisse valide.");
      return;
    }
    setBusy(true);
    try {
      const data = await openLocalCashSession({
        restaurantId,
        openingFloat: amount,
        notes,
        cashier: currentUser,
        receipts,
      });
      setSession(data);
      setNotes("");
      setClosingCounted(String(Math.round(Number(data.expected_in_drawer || 0))));
      onMessage?.(`Fond de caisse enregistré : ${money(amount)}`);
    } catch (error) {
      if (error instanceof CashSessionConflictError) {
        setSessionConflict(error.conflict);
        onMessage?.(error.message);
      } else {
        onMessage?.(error.message || "Ouverture de caisse impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeSession() {
    setBusy(true);
    setSessionConflict(null);
    try {
      const data = await resumeLocalCashSession({
        restaurantId,
        cashier: currentUser,
        receipts,
      });
      setSession(data);
      setClosingCounted(String(Math.round(Number(data.expected_in_drawer || 0))));
      onMessage?.("Session de caisse reprise sur cet appareil.");
    } catch (error) {
      onMessage?.(error.message || "Reprise de session impossible.");
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
      const data = await closeLocalCashSession({
        restaurantId,
        closingCounted: amount,
        notes,
        cashier: currentUser,
        receipts,
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

  async function submitMovement(event) {
    event.preventDefault();
    const amount = Math.round(Number(String(movementAmount).replace(/\s/g, "").replace(",", ".")));
    if (!Number.isFinite(amount) || amount <= 0) {
      onMessage?.("Indiquez un montant valide.");
      return;
    }
    setBusy(true);
    try {
      const { view } = await addLocalCashMovement({
        restaurantId,
        type: movementType,
        amount,
        note: movementNote,
        cashier: currentUser,
        receipts,
      });
      setSession(view);
      setClosingCounted(String(Math.round(Number(view.expected_in_drawer || 0))));
      setMovementAmount("");
      setMovementNote("");
      onMessage?.(`${MOVEMENT_LABELS[movementType]} enregistré : ${money(amount)}`);
    } catch (error) {
      onMessage?.(error.message || "Mouvement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!restaurantId) {
    return (
      <DashboardSection title="Fond de caisse">
        <p className="text-sm font-semibold text-slate-500">Session restaurant indisponible.</p>
      </DashboardSection>
    );
  }

  if (loading && !session) {
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
          <>
            {sessionConflict?.canResume && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">
                  Caisse déjà ouverte
                  {sessionConflict.openedByName ? ` par ${sessionConflict.openedByName}` : ""}
                  {sessionConflict.lockedByDeviceId ? " sur un autre appareil" : ""}.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResumeSession}
                  className="mt-3 h-10 rounded-lg bg-amber-700 px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  Reprendre la session sur cet appareil
                </button>
              </div>
            )}
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
          </>
        )}
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="Fond de caisse"
      description={
        session.status === "OPEN"
          ? "En fin de journée : le tiroir doit contenir le fond + les ventes en espèces ± mouvements."
          : "Session clôturée pour aujourd’hui."
      }
    >
      {session.syncStatus === "PENDING_SYNC" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Session locale — synchronisation en attente.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Fond d’ouverture" value={money(session.opening_float)} />
        <Metric label="Ventes du jour" value={money(session.sales_total)} />
        <Metric label="Dont espèces" value={money(session.cash_sales)} />
        <Metric label="Dont Mobile Money" value={money(session.mobile_sales)} />
        <Metric label="Mouvements caisse" value={money(session.net_movements_cash)} />
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
        <>
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

          <div className="mt-4 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowMovements((value) => !value)}
              className="text-sm font-black text-emerald-700 hover:underline"
            >
              {showMovements ? "Masquer les mouvements" : "Mouvements de caisse (ajout, retrait, dépense)"}
            </button>

            {showMovements && (
              <div className="mt-3 space-y-3">
                <form onSubmit={submitMovement} className="grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-sm font-bold text-slate-700">Type</span>
                    <select
                      value={movementType}
                      onChange={(event) => setMovementType(event.target.value)}
                      className="form-control"
                    >
                      {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-slate-700">Montant (FCFA)</span>
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      value={movementAmount}
                      onChange={(event) => setMovementAmount(event.target.value)}
                      className="form-control"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-slate-700">Note</span>
                    <input
                      value={movementNote}
                      onChange={(event) => setMovementNote(event.target.value)}
                      className="form-control"
                      placeholder="Motif"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-11 rounded-lg bg-emerald-700 font-black text-white disabled:opacity-60 sm:col-span-2"
                  >
                    Enregistrer le mouvement
                  </button>
                </form>

                {session.movements?.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {session.movements.slice(0, 8).map((movement) => (
                      <li key={movement.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span className="font-semibold text-slate-700">
                          {MOVEMENT_LABELS[movement.type] || movement.type}
                          {movement.note ? ` — ${movement.note}` : ""}
                        </span>
                        <span className="font-black text-slate-900">{money(movement.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
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
