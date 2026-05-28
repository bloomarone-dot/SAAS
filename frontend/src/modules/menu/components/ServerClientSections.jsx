import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { orderApi } from "@/modules/orders/services/orderApi";

export function ServerClients() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    orderApi.list().then(setOrders).catch(() => setOrders([]));
  }, []);

  const clients = useMemo(() => {
    const map = new Map();
    orders.forEach((order) => {
      const key = order.customer_phone || order.customer_name;
      if (!map.has(key)) {
        map.set(key, { name: order.customer_name, phone: order.customer_phone, orders: 0, total: 0 });
      }
      const item = map.get(key);
      item.orders += 1;
      item.total += Number(order.total_amount || 0);
    });
    return [...map.values()];
  }, [orders]);

  return (
    <section className="space-y-5">
      <Header title="Clients" subtitle="Clients issus des commandes enregistrées." icon="Users" />
      <DataTable
        headers={["Client", "Téléphone", "Commandes", "Total"]}
        rows={clients.map((client) => [client.name, client.phone, client.orders, `${client.total.toLocaleString("fr-FR")} FCFA`])}
        empty="Aucun client trouvé."
      />
    </section>
  );
}

export function ServerInvoices() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    orderApi.list().then(setOrders).catch(() => setOrders([]));
  }, []);

  return (
    <section className="space-y-5">
      <Header title="Factures" subtitle="Commandes à facturer, additions demandées et commandes payées." icon="FileText" />
      <DataTable
        headers={["Facture", "Client / Table", "Statut", "Montant"]}
        rows={orders.map((order) => [
          order.order_number,
          order.table_id ? `Table ${order.table_id}` : order.customer_name,
          order.status,
          `${Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA`,
        ])}
        empty="Aucune facture trouvée."
      />
    </section>
  );
}

export function ServerHistory() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    orderApi.list().then(setOrders).catch(() => setOrders([]));
  }, []);

  return (
    <section className="space-y-5">
      <Header title="Historiques" subtitle="Historique dynamique des commandes du restaurant." icon="History" />
      <DataTable
        headers={["Commande", "Client / Table", "Créée le", "Statut"]}
        rows={orders.map((order) => [
          order.order_number,
          order.table_id ? `Table ${order.table_id}` : order.customer_name,
          new Date(order.created_at).toLocaleString("fr-FR"),
          order.status,
        ])}
        empty="Aucun historique trouvé."
      />
    </section>
  );
}

function Header({ title, subtitle, icon }) {
  return (
    <div>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <DashboardIcon name={icon} size={20} />
      </div>
      <h1 className="mt-3 text-3xl font-black text-slate-950">{title}</h1>
      <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
    </div>
  );
}

function DataTable({ headers, rows, empty }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm font-semibold text-slate-500">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>{headers.map((header) => <th key={header} className="px-5 py-4">{header}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.join("-")} className="hover:bg-slate-50">
                  {row.map((cell, index) => (
                    <td key={`${row[0]}-${index}`} className={`px-5 py-4 ${index === 0 ? "font-black text-slate-950" : "font-semibold text-slate-600"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
