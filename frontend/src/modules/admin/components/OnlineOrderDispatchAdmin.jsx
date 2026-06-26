import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { apiFetch } from "@/config/http";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export function OnlineOrderDispatchAdmin({ onMessage }) {
  const [orders, setOrders] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [selectedRegister, setSelectedRegister] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [pending, registers] = await Promise.all([
        apiFetch("/api/v1/orders/dispatch/online-unassigned", { fallback: "Impossible de charger les commandes non affectées." }),
        apiFetch("/api/v1/orders/dispatch/cash-registers", { fallback: "Impossible de charger les caisses." }).catch(() => []),
      ]);
      setOrders(pending || []);
      setCashRegisters((registers || []).filter((register) => register.is_active !== false));
      setSelectedRegister((current) => current || registers?.[0]?.id || "");
    } catch (error) {
      onMessage?.(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const registerById = useMemo(() => new Map(cashRegisters.map((register) => [register.id, register])), [cashRegisters]);

  async function assign(order) {
    if (!selectedRegister) {
      onMessage?.("Sélectionnez une caisse.");
      return;
    }
    setBusyId(order.id);
    try {
      await apiFetch(`/api/v1/orders/${order.id}/assign-cash-register`, {
        method: "POST",
        body: { cash_register_id: selectedRegister },
        fallback: "Affectation impossible.",
      });
      setOrders((current) => current.filter((item) => item.id !== order.id));
      onMessage?.(`Commande ${order.order_number} affectée à ${registerById.get(selectedRegister)?.name || "la caisse"}.`);
    } catch (error) {
      onMessage?.(error.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-[var(--dashboard-primary)]">Dispatch</p>
          <h1 className="mt-1 text-3xl font-black text-[#070528]">Commandes en ligne non affectées</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={selectedRegister} onChange={(event) => setSelectedRegister(event.target.value)} className="form-control h-11 min-w-56">
            <option value="">Choisir une caisse</option>
            {cashRegisters.map((register) => (
              <option key={register.id} value={register.id}>{register.name}</option>
            ))}
          </select>
          <button type="button" onClick={load} className="lte-btn lte-btn-default">
            <DashboardIcon name="RefreshCw" size={16} />
            Rafraîchir
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
        <table className="lte-table min-w-[900px]">
          <thead>
            <tr>
              <th>Commande</th>
              <th>Client</th>
              <th>Téléphone</th>
              <th>Total</th>
              <th>Statut</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="font-black text-[#070528]">{order.order_number}</td>
                <td>{order.customer_name || "Client anonyme"}</td>
                <td>{order.customer_phone || "-"}</td>
                <td>{money(order.total_amount)}</td>
                <td><span className="rounded bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">Non affectée</span></td>
                <td>{new Date(order.created_at).toLocaleString("fr-FR")}</td>
                <td>
                  <button type="button" disabled={busyId === order.id || !selectedRegister} onClick={() => assign(order)} className="lte-btn lte-btn-primary lte-btn-sm">
                    Affecter
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <div className="p-10 text-center text-sm font-semibold text-slate-500">{loading ? "Chargement..." : "Aucune commande en attente d'affectation."}</div>}
      </div>
    </section>
  );
}
