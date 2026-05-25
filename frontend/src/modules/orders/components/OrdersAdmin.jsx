import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";

const statuses = ["Toutes", "Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Annulée"];
const nextStatuses = ["Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Annulée"];

export function OrdersAdmin({ apiBaseUrl, onMessage }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("Toutes");
  const [editingOrderId, setEditingOrderId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [apiBaseUrl]);

  async function api(path, options = {}) {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail ?? "Action commande impossible.");
    return data;
  }

  async function loadOrders() {
    setIsLoading(true);
    try {
      setOrders(await api("/api/v1/orders"));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatus(order, newStatus) {
    try {
      const updated = await api(`/api/v1/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onMessage(`Commande ${updated.order_number} mise à jour.`);
    } catch (error) {
      onMessage(error.message);
    }
  }

  function startEdit(order) {
    setEditingOrderId(order.id);
    setEditForm({
      customer_name: order.customer_name ?? "",
      customer_phone: order.customer_phone ?? "",
      customer_address: order.customer_address ?? "",
      notes: order.notes ?? "",
      status: order.status,
      fulfillment_type: order.fulfillment_type,
      payment_method: order.payment_method,
      discount_amount: String(order.discount_amount ?? 0),
      delivery_fee: String(order.delivery_fee ?? 0),
    });
  }

  function updateEditField(event) {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  }

  async function saveOrder(event) {
    event.preventDefault();
    if (!editingOrderId || !editForm) return;
    setIsLoading(true);
    try {
      const updated = await api(`/api/v1/orders/${editingOrderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          discount_amount: Number(editForm.discount_amount || 0),
          delivery_fee: Number(editForm.delivery_fee || 0),
        }),
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingOrderId("");
      setEditForm(null);
      onMessage(`Commande ${updated.order_number} modifiée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteOrder(order) {
    setIsLoading(true);
    try {
      await api(`/api/v1/orders/${order.id}`, { method: "DELETE" });
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (editingOrderId === order.id) {
        setEditingOrderId("");
        setEditForm(null);
      }
      onMessage(`Commande ${order.order_number} supprimée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const visibleOrders = useMemo(
    () => orders.filter((order) => status === "Toutes" || order.status === status),
    [orders, status]
  );
  const total = visibleOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-[var(--dashboard-primary)]">Commandes clients</p>
          <h1 className="mt-2 text-4xl font-black text-slate-950">Commandes en ligne</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            Suivez les commandes reçues depuis la vitrine et mettez à jour leur progression.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
        >
          <DashboardIcon name="Activity" size={17} />
          Actualiser
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
        <label className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 shadow-sm">
          <DashboardIcon name="SlidersHorizontal" size={17} className="text-slate-400" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full bg-transparent text-sm font-black outline-none">
            {statuses.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <Metric label="Commandes" value={visibleOrders.length} />
        <Metric label="Total" value={`${total.toLocaleString("fr-FR")} FCFA`} />
      </div>

      {editForm && (
        <form onSubmit={saveOrder} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h2 className="text-lg font-black text-slate-950">Modifier la commande</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Corrigez les informations client, le statut, le paiement ou les frais.</p>
            </div>
            <button type="button" onClick={() => { setEditingOrderId(""); setEditForm(null); }} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-black text-slate-700">
              Annuler
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field name="customer_name" label="Client" value={editForm.customer_name} onChange={updateEditField} required />
            <Field name="customer_phone" label="Téléphone" value={editForm.customer_phone} onChange={updateEditField} required />
            <Field name="customer_address" label="Adresse" value={editForm.customer_address} onChange={updateEditField} />
            <Select name="status" label="Statut" value={editForm.status} onChange={updateEditField} options={nextStatuses} />
            <Select name="fulfillment_type" label="Service" value={editForm.fulfillment_type} onChange={updateEditField} options={["Livraison", "Sur place", "À emporter"]} />
            <Field name="payment_method" label="Paiement" value={editForm.payment_method} onChange={updateEditField} />
            <Field name="discount_amount" label="Remise" type="number" min="0" value={editForm.discount_amount} onChange={updateEditField} />
            <Field name="delivery_fee" label="Livraison" type="number" min="0" value={editForm.delivery_fee} onChange={updateEditField} />
            <Field name="notes" label="Notes" value={editForm.notes} onChange={updateEditField} />
          </div>
          <button type="submit" disabled={isLoading} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--dashboard-primary)] px-5 text-sm font-black text-white disabled:opacity-60">
            <DashboardIcon name="Pencil" size={16} />
            Enregistrer
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="px-6 py-12 text-center text-sm font-black text-slate-500">Chargement des commandes...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <DashboardIcon name="ClipboardList" size={28} className="mx-auto text-slate-400" />
            <p className="mt-3 text-lg font-black text-slate-950">Aucune commande</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Les commandes clients apparaîtront ici dès validation sur la vitrine.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Commande</th>
                  <th className="px-5 py-4">Client</th>
                  <th className="px-5 py-4">Articles</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4">Créée le</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-black text-slate-950">{order.order_number}</td>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{order.customer_name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{order.customer_phone}</p>
                      <p className="mt-1 max-w-[220px] truncate text-xs font-semibold text-slate-500">{order.customer_address || order.fulfillment_type}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {order.items.map((item) => (
                        <p key={item.id} className="font-semibold">{item.quantity} x {item.name}</p>
                      ))}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">{Number(order.total_amount).toLocaleString("fr-FR")} FCFA</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Remise {Number(order.discount_amount || 0).toLocaleString("fr-FR")} · Livraison {Number(order.delivery_fee || 0).toLocaleString("fr-FR")}
                      </p>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-4 font-semibold text-slate-500">{new Date(order.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <select
                          value={order.status}
                          onChange={(event) => updateStatus(order, event.target.value)}
                          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black outline-none focus:border-[var(--dashboard-primary)]"
                        >
                          {nextStatuses.map((item) => <option key={item}>{item}</option>)}
                        </select>
                        <button type="button" onClick={() => startEdit(order)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:border-[var(--dashboard-primary)]">
                          Modifier
                        </button>
                        <button type="button" onClick={() => deleteOrder(order)} className="h-10 rounded-lg border border-red-100 px-3 text-xs font-black text-red-600 hover:bg-red-50">
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <input {...props} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--dashboard-primary)]" />
    </label>
  );
}

function Select({ label, options, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <select {...props} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--dashboard-primary)]">
        {options.map((item) => <option key={item}>{item}</option>)}
      </select>
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    Nouvelle: "bg-blue-50 text-blue-700",
    Acceptée: "bg-emerald-50 text-emerald-700",
    "En préparation": "bg-amber-50 text-amber-700",
    Prête: "bg-violet-50 text-violet-700",
    Livrée: "bg-slate-100 text-slate-700",
    Annulée: "bg-red-50 text-red-700",
  };
  return <span className={`rounded-md px-3 py-1 text-xs font-black ${colors[status] ?? colors.Nouvelle}`}>{status}</span>;
}
