import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminCard, AdminKpis, AdminPage, EmptyState, Field, IconButton, PrimaryAction, SearchBox, SecondaryAction, StatusPill } from "@/modules/admin/components/AdminUi";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
<<<<<<< HEAD
import { OrangeMoneyPayment } from "./OrangeMoneyPayment";
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf

const statuses = ["Toutes", "Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Payée", "Annulée"];
const nextStatuses = ["Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Payée", "Annulée"];

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function paymentTone(order) {
  if (["Payée", "Payee"].includes(order.status)) return "green";
  if (order.status === "Annulée") return "red";
  return "orange";
}

export function OrdersAdmin({ apiBaseUrl, currentUser, onMessage }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("Toutes");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [editingOrderId, setEditingOrderId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
<<<<<<< HEAD
  const [orangePayOrderId, setOrangePayOrderId] = useState(null);
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
  const reviewOnly = currentUser?.role === "ADMIN";

  useEffect(() => {
    loadOrders();
  }, [apiBaseUrl]);

  useAutoRefresh(() => loadOrders({ silent: true }), 12000, [apiBaseUrl]);

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

  async function loadOrders({ silent = false } = {}) {
    if (!silent) setIsLoading(true);
    try {
      const data = await api("/api/v1/orders?limit=200");
      setOrders(data);
      setSelectedOrderId((current) => current || data[0]?.id || "");
    } catch (error) {
      if (!silent) onMessage(error.message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  async function updateStatus(order, newStatus) {
    try {
      const updated = await api(`/api/v1/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrderId(updated.id);
      onMessage(`Commande ${updated.order_number} mise à jour.`);
    } catch (error) {
      onMessage(error.message);
    }
  }

  function startEdit(order) {
    setEditingOrderId(order.id);
    setSelectedOrderId(order.id);
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
      setSelectedOrderId(updated.id);
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
    if (!window.confirm(`Archiver la commande ${order.order_number} ?\n\nElle restera en base de données et pourra être restaurée en changeant son statut.`)) return;
    setIsLoading(true);
    try {
      await api(`/api/v1/orders/${order.id}`, { method: "DELETE" });
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setSelectedOrderId("");
      onMessage(`Commande ${order.order_number} archivée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = status === "Toutes" || order.status === status;
      const matchesSearch = !query || [
        order.order_number,
        order.customer_name,
        order.customer_phone,
        order.fulfillment_type,
        order.order_source,
        order.server_name,
        order.table_name,
        order.table_room,
        order.status,
      ].join(" ").toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, status]);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || visibleOrders[0] || null;
  const todayOrders = orders.filter((order) => new Date(order.created_at).toDateString() === new Date().toDateString());

  return (
    <AdminPage
      eyebrow="Commandes"
      title={reviewOnly ? "Suivi des commandes" : "Gestion des commandes"}
      subtitle={reviewOnly ? "Consultez les commandes et validez uniquement les annulations ou suppressions nécessaires." : "Consultez et gérez toutes les commandes de votre restaurant."}
      action={<SecondaryAction icon="Download" onClick={() => exportCsv(visibleOrders)}>Exporter</SecondaryAction>}
    >
      <AdminKpis items={[
        { label: "Commandes du jour", value: todayOrders.length, icon: "ShoppingCart", trend: "aujourd'hui" },
        { label: "En attente", value: orders.filter((order) => ["Nouvelle", "Acceptée"].includes(order.status)).length, icon: "Clock3", tone: "warn" },
        { label: "En préparation", value: orders.filter((order) => order.status === "En préparation").length, icon: "ChefHat" },
        { label: "Prêtes", value: orders.filter((order) => order.status === "Prête").length, icon: "Utensils" },
      ]} />

      {!reviewOnly && editForm && (
        <AdminCard title="Modifier la commande" action={<SecondaryAction onClick={() => { setEditingOrderId(""); setEditForm(null); }}>Annuler</SecondaryAction>}>
          <form onSubmit={saveOrder} className="grid gap-4 md:grid-cols-3">
            <Field name="customer_name" label="Client" required value={editForm.customer_name} onChange={updateEditField} />
            <Field name="customer_phone" label="Téléphone" required value={editForm.customer_phone} onChange={updateEditField} />
            <Field name="customer_address" label="Adresse" value={editForm.customer_address} onChange={updateEditField} />
            <Field label="Statut">
              <select name="status" value={editForm.status} onChange={updateEditField} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none">
                {nextStatuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field name="fulfillment_type" label="Canal" value={editForm.fulfillment_type} onChange={updateEditField} />
            <Field name="payment_method" label="Paiement" value={editForm.payment_method} onChange={updateEditField} />
            <Field name="discount_amount" label="Remise" type="number" min="0" value={editForm.discount_amount} onChange={updateEditField} />
            <Field name="delivery_fee" label="Livraison" type="number" min="0" value={editForm.delivery_fee} onChange={updateEditField} />
            <Field name="notes" label="Notes" value={editForm.notes} onChange={updateEditField} />
            <div className="md:col-span-3"><PrimaryAction icon="Pencil" type="submit" disabled={isLoading}>Enregistrer</PrimaryAction></div>
          </form>
        </AdminCard>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <AdminCard>
          <div className="mb-4 flex flex-wrap gap-3 border-b border-slate-100 pb-4">
            {statuses.map((item) => (
              <button key={item} type="button" onClick={() => setStatus(item)} className={`h-10 border-b-2 px-3 text-sm font-black ${status === item ? "border-[var(--dashboard-primary)] text-[var(--dashboard-primary)]" : "border-transparent text-slate-500"}`}>
                {item} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{item === "Toutes" ? orders.length : orders.filter((order) => order.status === item).length}</span>
              </button>
            ))}
          </div>
          <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_170px_170px_auto]">
            <SearchBox value={search} onChange={setSearch} placeholder="Rechercher une commande, client, table..." />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 rounded-lg border border-slate-200 px-3 text-sm font-black outline-none">
              {statuses.map((item) => <option key={item}>{item}</option>)}
            </select>
            <input type="date" className="h-12 rounded-lg border border-slate-200 px-3 text-sm font-black outline-none" />
            <SecondaryAction icon="Activity" onClick={loadOrders}>Actualiser</SecondaryAction>
          </div>
          <OrdersTable
            orders={visibleOrders}
            selectedOrderId={selectedOrder?.id}
            reviewOnly={reviewOnly}
            onSelect={setSelectedOrderId}
            onEdit={startEdit}
            onDelete={deleteOrder}
            onStatus={updateStatus}
          />
        </AdminCard>

        <div className="space-y-5">
          <AdminCard title="Détail de la commande">
            {selectedOrder ? (
              <OrderDetail
                order={selectedOrder}
                reviewOnly={reviewOnly}
                onStatus={updateStatus}
                onDelete={deleteOrder}
<<<<<<< HEAD
                onOrangePay={setOrangePayOrderId}
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
              />
            ) : <EmptyState title="Aucune commande" />}
          </AdminCard>
          <AdminCard title="Activité récente">
            <div className="space-y-4">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="border-l-2 border-[var(--dashboard-primary)] pl-3">
                  <p className="text-sm font-black text-slate-950">{order.order_number}</p>
                  <p className="text-xs font-semibold text-slate-500">Statut changé en <span className="text-[var(--dashboard-primary)]">{order.status}</span></p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(order.updated_at).toLocaleString("fr-FR")}</p>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      </div>
<<<<<<< HEAD
      {/* Modal paiement Orange Money */}
      {orangePayOrderId && (() => {
        const payOrder = orders.find((o) => o.id === orangePayOrderId);
        if (!payOrder) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md">
              <OrangeMoneyPayment
                apiBaseUrl={apiBaseUrl}
                order={payOrder}
                onSuccess={() => {
                  setOrangePayOrderId(null);
                  loadOrders({ silent: true });
                  onMessage(`Paiement Orange Money confirmé pour la commande ${payOrder.order_number}.`);
                }}
                onClose={() => setOrangePayOrderId(null)}
              />
            </div>
          </div>
        );
      })()}
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
    </AdminPage>
  );
}

function OrdersTable({ orders, selectedOrderId, reviewOnly, onSelect, onEdit, onDelete, onStatus }) {
  if (!orders.length) return <EmptyState icon="ClipboardList" title="Aucune commande" text="Les commandes clients apparaîtront ici." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="text-xs font-black text-slate-500">
          <tr>
            <th className="py-3">Référence</th>
            <th className="py-3">Client / Table</th>
            <th className="py-3">Source</th>
            <th className="py-3">Serveuse</th>
            <th className="py-3">Total</th>
            <th className="py-3">Statut commande</th>
            <th className="py-3">Paiement</th>
            <th className="py-3">Date</th>
            <th className="py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => (
            <tr key={order.id} onClick={() => onSelect(order.id)} className={`cursor-pointer ${selectedOrderId === order.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
              <td className="py-3 font-black text-slate-950">{order.order_number}</td>
              <td className="py-3">
                <p className="font-black text-slate-900">{order.table_id ? `Table ${order.table_name || order.table_id}` : order.customer_name}</p>
                <p className="text-xs font-semibold text-slate-500">{order.table_id ? order.table_room || "Salle non précisée" : order.customer_phone}</p>
              </td>
              <td className="py-3">
                <StatusPill tone={order.order_source === "En ligne" ? "purple" : "green"}>{order.order_source || order.fulfillment_type}</StatusPill>
                <p className="mt-1 text-xs font-semibold text-slate-500">{order.fulfillment_type}</p>
              </td>
              <td className="py-3 font-semibold text-slate-600">{order.server_name || "-"}</td>
              <td className="py-3 font-black text-slate-900">{money(order.total_amount)}</td>
              <td className="py-3"><StatusBadge status={order.status} /></td>
              <td className="py-3"><StatusPill tone={paymentTone(order)}>{["Payée", "Payee"].includes(order.status) ? "Payé" : "En attente"}</StatusPill></td>
              <td className="py-3 font-semibold text-slate-500">{new Date(order.created_at).toLocaleDateString("fr-FR")}</td>
              <td className="py-3 text-right" onClick={(event) => event.stopPropagation()}>
                <IconButton icon="Eye" title="Voir" onClick={() => onSelect(order.id)} />
                {reviewOnly ? (
                  <>
                    {order.status !== "Annulée" && order.status !== "Archivée" && (
                      <button type="button" onClick={() => onStatus(order, "Annulée")} className="ml-2 rounded-lg border border-orange-200 px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-50">
                        Valider annulation
                      </button>
                    )}
                    <button type="button" onClick={() => onDelete(order)} className="ml-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50">
                      Archiver
                    </button>
                  </>
                ) : (
                  <>
                    <IconButton icon="Pencil" title="Modifier" onClick={() => onEdit(order)} />
                    <select value={order.status} onChange={(event) => onStatus(order, event.target.value)} className="ml-2 h-9 rounded-lg border border-slate-200 px-2 text-xs font-black outline-none">
                      {nextStatuses.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <IconButton icon="Trash2" title="Supprimer" tone="red" onClick={() => onDelete(order)} />
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

<<<<<<< HEAD
function OrderDetail({ order, reviewOnly, onStatus, onDelete, onOrangePay }) {
=======
function OrderDetail({ order, reviewOnly, onStatus, onDelete }) {
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
  const visibleItems = order.items.filter((item) => item.sale_channel !== "EMBALLAGE");
  const subtotal = visibleItems.reduce((total, item) => total + Number(item.line_total || 0), 0);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-2xl font-black text-[var(--dashboard-secondary)]">{order.order_number}</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">{order.customer_name} · {new Date(order.created_at).toLocaleString("fr-FR")}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          {order.order_source || order.fulfillment_type} · {order.table_id ? `${order.table_room || "Salle"} / Table ${order.table_name || order.table_id}` : "Commande client"} · Serveuse : {order.server_name || "-"}
        </p>
        <div className="mt-2"><StatusBadge status={order.status} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-100 p-3 text-center">
        <Metric label="Articles" value={visibleItems.length} />
        <Metric label="Sous-total" value={money(subtotal)} />
        <Metric label="Total" value={money(order.total_amount)} />
      </div>
      <div className="divide-y divide-slate-100">
        {visibleItems.map((item) => (
          <div key={item.id} className="flex justify-between py-2 text-sm">
            <span className="font-semibold text-slate-600">{item.quantity} x {item.name}</span>
            <strong>{money(item.line_total)}</strong>
          </div>
        ))}
      </div>
      {order.notes && <div className="rounded-lg bg-orange-50 p-3 text-sm font-semibold text-orange-700">{order.notes}</div>}
<<<<<<< HEAD

      {/* Bouton Orange Money — visible si commande non payée */}
      {!["Payée", "Payee", "Annulée"].includes(order.status) && (
        <button
          type="button"
          onClick={() => onOrangePay(order.id)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-black text-white hover:bg-orange-600 transition"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-black">OM</span>
          Payer par Orange Money · {money(order.total_amount)}
        </button>
      )}

=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
      {reviewOnly ? (
        <div className="grid gap-2">
          {order.status !== "Annulée" && order.status !== "Archivée" && (
            <button type="button" onClick={() => onStatus(order, "Annulée")} className="flex w-full items-center justify-between rounded-lg border border-orange-200 p-3 text-left text-sm font-black text-orange-700 hover:bg-orange-50">
              Valider l'annulation<DashboardIcon name="ChevronDown" size={15} className="-rotate-90" />
            </button>
          )}
          <button type="button" onClick={() => onDelete(order)} className="flex w-full items-center justify-between rounded-lg border border-red-200 p-3 text-left text-sm font-black text-red-600 hover:bg-red-50">
            Valider la suppression<DashboardIcon name="ChevronDown" size={15} className="-rotate-90" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {["En préparation", "Prête", "Livrée", "Annulée"].map((status) => (
            <button key={status} type="button" onClick={() => onStatus(order, status)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left text-sm font-black text-slate-700 hover:border-[var(--dashboard-primary)]">
              {status}<DashboardIcon name="ChevronDown" size={15} className="-rotate-90" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return <div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>;
}

function StatusBadge({ status }) {
  const tones = {
    Nouvelle: "blue",
    Acceptée: "green",
    "En préparation": "orange",
    Prête: "green",
    Livrée: "slate",
    Payée: "green",
    Annulée: "red",
  };
  return <StatusPill tone={tones[status] ?? "slate"}>{status}</StatusPill>;
}

function exportCsv(rows) {
  const csv = ["Référence;Client;Source;Serveuse;Salle;Canal;Total;Statut;Date", ...rows.map((order) => `${order.order_number};${order.customer_name};${order.order_source || ""};${order.server_name || ""};${order.table_room || ""};${order.fulfillment_type};${order.total_amount};${order.status};${order.created_at}`)].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "commandes.csv";
  link.click();
}
