import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { DeliveryAdminPanel } from "@/modules/orders/components/DeliveryAdminPanel";
import { apiFetch } from "@/config/http";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DeliveryDispatchAdmin({ currentUser, onMessage }) {
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [selectedRegister, setSelectedRegister] = useState("");
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function loadOnlineQueue() {
    setLoadingOnline(true);
    try {
      const [pending, registers] = await Promise.all([
        apiFetch("/api/v1/orders/dispatch/online-unassigned", {
          fallback: "Impossible de charger les commandes en ligne.",
        }),
        apiFetch("/api/v1/orders/dispatch/cash-registers", {
          fallback: "Impossible de charger les caisses.",
        }).catch(() => []),
      ]);
      setOnlineOrders(pending || []);
      setCashRegisters((registers || []).filter((register) => register.is_active !== false));
      setSelectedRegister((current) => current || registers?.[0]?.id || "");
    } catch (error) {
      onMessage?.(error.message);
    } finally {
      setLoadingOnline(false);
    }
  }

  useEffect(() => {
    loadOnlineQueue();
    const timer = window.setInterval(loadOnlineQueue, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const registerById = useMemo(
    () => new Map(cashRegisters.map((register) => [register.id, register])),
    [cashRegisters],
  );

  async function assignOnlineOrder(order) {
    if (!selectedRegister) {
      onMessage?.("Sélectionnez une caisse pour affecter la commande en ligne.");
      return;
    }
    setBusyId(order.id);
    try {
      await apiFetch(`/api/v1/orders/${order.id}/assign-cash-register`, {
        method: "POST",
        body: { cash_register_id: selectedRegister },
        fallback: "Affectation impossible.",
      });
      setOnlineOrders((current) => current.filter((item) => item.id !== order.id));
      onMessage?.(
        `Commande ${order.order_number} affectée à ${registerById.get(selectedRegister)?.name || "la caisse"}.`,
      );
    } catch (error) {
      onMessage?.(error.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase text-[var(--dashboard-primary)]">Livraisons</p>
        <h1 className="mt-1 text-3xl font-black text-[#070528]">Suivi des livraisons</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
          Consultez l'état des livraisons, la performance des caissières et l'historique des factures. Le mode de paiement est géré uniquement par la caisse.
        </p>
      </div>

      <DeliveryAdminPanel onMessage={onMessage} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900">Commandes en ligne à affecter</p>
            <p className="text-xs font-semibold text-slate-500">
              Commandes web non encore reliées à une caisse ({onlineOrders.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedRegister}
              onChange={(event) => setSelectedRegister(event.target.value)}
              className="form-control h-10 min-w-56"
            >
              <option value="">Choisir une caisse</option>
              {cashRegisters.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={loadOnlineQueue} className="lte-btn lte-btn-default">
              <DashboardIcon name="RefreshCw" size={16} />
              Rafraîchir
            </button>
          </div>
        </div>

        {onlineOrders.length ? (
          <div className="overflow-x-auto">
            <table className="lte-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Commande</th>
                  <th>Client</th>
                  <th>Plats</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {onlineOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="font-black text-[#070528]">{order.order_number}</td>
                    <td>
                      <p>{order.customer_name || "Client anonyme"}</p>
                      <p className="text-xs text-slate-500">{order.customer_phone || "-"}</p>
                    </td>
                    <td className="text-xs">
                      {(order.items || []).length
                        ? order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")
                        : "-"}
                    </td>
                    <td>{money(order.total_amount)}</td>
                    <td>{formatDateTime(order.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busyId === order.id || !selectedRegister}
                        onClick={() => assignOnlineOrder(order)}
                        className="lte-btn lte-btn-primary lte-btn-sm"
                      >
                        Affecter à la caisse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            {loadingOnline ? "Chargement..." : "Aucune commande en ligne en attente d'affectation."}
          </p>
        )}
      </section>
    </div>
  );
}
