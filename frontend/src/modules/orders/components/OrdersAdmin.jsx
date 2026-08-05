import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminCard, AdminPage, DashboardSection, EmptyState, Field, FilterBar, IconButton, PrimaryAction, SearchBox, SecondaryAction, StatCard, StatusPill, TableFooter } from "@/modules/admin/components/AdminUi";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { apiFetch } from "@/config/http";
import { orderTakerDisplay, orderTakerRole, isDeliveryOrder, cashierDisplay } from "@/modules/orders/utils/orderLabels";
import { OrangeMoneyPayment } from "./OrangeMoneyPayment";
import { formatMinutes, orderKitchenTimingDetails, orderKitchenTimingLabel } from "@/modules/menu/utils/kitchenTiming";

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
  const [panelMode, setPanelMode] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [orangePayOrderId, setOrangePayOrderId] = useState(null);
  const [mtnPayOrderId, setMtnPayOrderId] = useState(null);
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const reviewOnly = currentUser?.role === "ADMIN";

  async function submitReopen() {
    if (!reopenTarget) return;
    if (reopenReason.trim().length < 5) {
      onMessage("Le motif de réouverture est obligatoire (5 caractères minimum).");
      return;
    }
    setReopenBusy(true);
    try {
      const updated = await api(`/api/v1/orders/${reopenTarget.id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      onMessage(`Commande ${updated.order_number} rouverte. L'administrateur a été notifié.`);
      setReopenTarget(null);
      setReopenReason("");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setReopenBusy(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [apiBaseUrl]);

  useAutoRefresh(() => loadOrders({ silent: true }), 12000, [apiBaseUrl]);

  // Delegue au client centralise: token, base URL et gestion automatique du 401
  // (deconnexion propre quand le jeton est expire/revoque cote backend).
  function api(path, options = {}) {
    return apiFetch(path, { ...options, fallback: "Action commande impossible." });
  }

  async function loadOrders({ silent = false } = {}) {
    if (!silent) setIsLoading(true);
    try {
      const data = await api("/api/v1/orders?limit=200");
      setOrders(data);
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

  function openOrderPanel(order, mode) {
    setSelectedOrderId(order.id);
    setPanelMode(mode);
    if (mode === "edit") startEdit(order);
  }

  function closeOrderPanel() {
    setSelectedOrderId("");
    setPanelMode(null);
    setEditingOrderId("");
    setEditForm(null);
  }

  function startEdit(order) {
    setEditingOrderId(order.id);
    setSelectedOrderId(order.id);
    setPanelMode("edit");
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
      setPanelMode("detail");
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
    if (!window.confirm(
      `Supprimer la commande test ${order.order_number} ?\n\n`
      + `Elle disparaîtra de la cuisine, de la caisse et des totaux.\n`
      + `(Archivage admin — non comptabilisée.)`,
    )) return;
    setIsLoading(true);
    try {
      await api(`/api/v1/orders/${order.id}`, { method: "DELETE" });
      setOrders((current) => current.filter((item) => item.id !== order.id));
      closeOrderPanel();
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
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const panelOpen = Boolean(selectedOrder && panelMode);
  const todayOrders = orders.filter((order) => new Date(order.created_at).toDateString() === new Date().toDateString());

  return (
    <AdminPage
      eyebrow="Commandes"
      title={reviewOnly ? "Suivi des commandes" : "Gestion des commandes"}
      subtitle={reviewOnly ? "Consultez les commandes et validez uniquement les annulations ou suppressions nécessaires." : "Consultez et gérez toutes les commandes de votre restaurant."}
      action={<SecondaryAction icon="Download" onClick={() => exportCsv(visibleOrders)}>Exporter</SecondaryAction>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Commandes du jour" value={todayOrders.length.toLocaleString("fr-FR")} icon="ShoppingCart" trend="Aujourd'hui" tone="info" />
        <StatCard label="En attente" value={orders.filter((order) => ["Nouvelle", "Acceptée"].includes(order.status)).length.toLocaleString("fr-FR")} icon="Clock3" trend="À traiter" tone="warning" />
        <StatCard label="En préparation" value={orders.filter((order) => order.status === "En préparation").length.toLocaleString("fr-FR")} icon="ChefHat" trend="Cuisine" tone="default" />
        <StatCard label="Prêtes" value={orders.filter((order) => order.status === "Prête").length.toLocaleString("fr-FR")} icon="Utensils" trend="À servir / encaisser" tone="success" />
      </div>

      <div className={`grid gap-5 ${panelOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]" : ""}`}>
        <DashboardSection
          title="Liste des commandes"
          description={`${visibleOrders.length.toLocaleString("fr-FR")} commande(s) selon les filtres actifs`}
        >
          <div className="mb-4 flex flex-wrap gap-3 border-b border-slate-100 pb-4">
            {statuses.map((item) => (
              <button key={item} type="button" onClick={() => setStatus(item)} className={`h-10 border-b-2 px-3 text-sm font-black ${status === item ? "border-[var(--dashboard-primary)] text-[var(--dashboard-primary)]" : "border-transparent text-slate-500"}`}>
                {item} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{item === "Toutes" ? orders.length : orders.filter((order) => order.status === item).length}</span>
              </button>
            ))}
          </div>
          <FilterBar className="mb-5">
            <SearchBox value={search} onChange={setSearch} placeholder="Rechercher une commande, client, table..." />
          </FilterBar>
          <OrdersTable
            orders={visibleOrders}
            selectedOrderId={selectedOrder?.id}
            reviewOnly={reviewOnly}
            onDetail={(order) => openOrderPanel(order, "detail")}
            onEdit={(order) => openOrderPanel(order, "edit")}
            onDelete={deleteOrder}
            onStatus={updateStatus}
            onReopen={setReopenTarget}
            onOrangePay={reviewOnly ? undefined : setOrangePayOrderId}
            onMtnPay={reviewOnly ? undefined : setMtnPayOrderId}
          />
        </DashboardSection>

        {panelOpen && selectedOrder && (
          <div className="border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase text-[var(--dashboard-primary)]">
                  {panelMode === "edit" ? "Modification" : "Détail commande"}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-900">{selectedOrder.order_number}</h2>
              </div>
              <button type="button" onClick={closeOrderPanel} className="lte-tool-btn" title="Fermer">
                <DashboardIcon name="X" size={16} />
              </button>
            </div>

            {panelMode === "edit" && !reviewOnly && editForm ? (
              <form onSubmit={saveOrder} className="space-y-4 p-5">
                <Field name="customer_name" label="Client" required value={editForm.customer_name} onChange={updateEditField} />
                <Field name="customer_phone" label="Téléphone" required value={editForm.customer_phone} onChange={updateEditField} />
                <Field name="customer_address" label="Adresse" value={editForm.customer_address} onChange={updateEditField} />
                <Field label="Statut">
                  <select name="status" value={editForm.status} onChange={updateEditField} className="form-control">
                    {nextStatuses.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </Field>
                <Field name="fulfillment_type" label="Canal" value={editForm.fulfillment_type} onChange={updateEditField} />
                <Field name="payment_method" label="Paiement" value={editForm.payment_method} onChange={updateEditField} />
                <Field name="discount_amount" label="Remise" type="number" min="0" value={editForm.discount_amount} onChange={updateEditField} />
                <Field name="delivery_fee" label="Livraison" type="number" min="0" value={editForm.delivery_fee} onChange={updateEditField} />
                <Field name="notes" label="Notes" value={editForm.notes} onChange={updateEditField} />
                <PrimaryAction icon="Pencil" type="submit" disabled={isLoading}>Enregistrer</PrimaryAction>
              </form>
            ) : (
              <div className="p-5">
                <OrderDetail
                  order={selectedOrder}
                  reviewOnly={reviewOnly}
                  onStatus={updateStatus}
                  onDelete={deleteOrder}
                  onOrangePay={reviewOnly ? undefined : setOrangePayOrderId}
                  onMtnPay={reviewOnly ? undefined : setMtnPayOrderId}
                />
                {!reviewOnly && (
                  <button
                    type="button"
                    onClick={() => startEdit(selectedOrder)}
                    className="mt-4 lte-btn lte-btn-primary w-full"
                  >
                    <DashboardIcon name="Pencil" size={15} />
                    Modifier
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Modal paiement Orange Money */}
      {!reviewOnly && orangePayOrderId && (() => {
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
      {/* Modal paiement MTN Money */}
      {!reviewOnly && mtnPayOrderId && (() => {
        const payOrder = orders.find((o) => o.id === mtnPayOrderId);
        if (!payOrder) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md">
              <MtnMoneyPayment
                apiBaseUrl={apiBaseUrl}
                order={payOrder}
                onSuccess={() => {
                  setMtnPayOrderId(null);
                  loadOrders({ silent: true });
                  onMessage(`Paiement MTN Mobile Money confirmé pour la commande ${payOrder.order_number}.`);
                }}
                onClose={() => setMtnPayOrderId(null)}
              />
            </div>
          </div>
        );
      })()}
      {reopenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !reopenBusy && setReopenTarget(null)}>
          <div className="lte-card mb-0 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
            <div className="lte-card-header">
              <h2 className="lte-card-title"><DashboardIcon name="AlertTriangle" size={17} /> Rouvrir la commande {reopenTarget.order_number}</h2>
            </div>
            <div className="lte-card-body space-y-3">
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Action sensible et tracée. L'administrateur sera notifié de cette réouverture.
              </p>
              <label className="lte-form-group">
                <span className="lte-label">Motif de la réouverture <span className="req">*</span></span>
                <textarea
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                  rows={3}
                  placeholder="Ex : ajout d'un plat oublié à la demande du client"
                  className="form-control"
                  autoFocus
                />
                <span className="lte-help">5 caractères minimum.</span>
              </label>
            </div>
            <div className="lte-card-footer">
              <button type="button" onClick={() => setReopenTarget(null)} disabled={reopenBusy} className="lte-btn lte-btn-default">Annuler</button>
              <button type="button" onClick={submitReopen} disabled={reopenBusy} className="ml-auto lte-btn lte-btn-primary">
                {reopenBusy ? "Réouverture…" : "Confirmer la réouverture"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

function OrdersTable({ orders, selectedOrderId, reviewOnly, onDetail, onEdit, onDelete, onStatus, onReopen }) {
  if (!orders.length) return <EmptyState icon="ClipboardList" title="Aucune commande" text="Les commandes clients apparaîtront ici." />;
  return (
    <>
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[820px]">
        <thead>
          <tr>
            <th className="py-3">Référence</th>
            <th className="py-3">Client / Table</th>
            <th className="py-3">Total</th>
            <th className="py-3">Statut</th>
            <th className="py-3">Date</th>
            <th className="py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => (
            <tr key={order.id} className={`${selectedOrderId === order.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
              <td className="py-3 font-black text-slate-950">{order.order_number}</td>
              <td className="py-3">
                <p className="font-black text-slate-900">{order.table_id ? `Table ${order.table_name || order.table_id}` : order.customer_name}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {isDeliveryOrder(order)
                    ? orderTakerDisplay(order)
                    : order.server_name || order.customer_phone || "-"}
                </p>
              </td>
              <td className="py-3 font-black text-slate-900">{money(order.total_amount)}</td>
              <td className="py-3">
                <StatusBadge status={order.status} />
                {orderKitchenTimingLabel(order) && (
                  <p className="mt-1 text-[11px] font-bold text-slate-500">{orderKitchenTimingLabel(order)}</p>
                )}
              </td>
              <td className="py-3 font-semibold text-slate-500">{new Date(order.created_at).toLocaleDateString("fr-FR")}</td>
              <td className="py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onDetail(order)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                  >
                    <DashboardIcon name="Eye" size={15} />
                    Détail
                  </button>
                  {!reviewOnly && (
                    <button
                      type="button"
                      onClick={() => onEdit(order)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                    >
                      <DashboardIcon name="Pencil" size={15} />
                      Modifier
                    </button>
                  )}
                  {order.is_closed && !["Payée", "Payee"].includes(order.status) && (
                    <button type="button" onClick={() => onReopen(order)} className="lte-btn lte-btn-default lte-btn-sm">
                      Rouvrir
                    </button>
                  )}
                  {reviewOnly ? (
                    order.status !== "Annulée" && order.status !== "Archivée" && (
                      <button type="button" onClick={() => onStatus(order, "Annulée")} className="lte-btn lte-btn-default lte-btn-sm">
                        Annuler
                      </button>
                    )
                  ) : (
                    <IconButton icon="Trash2" title="Archiver" tone="red" onClick={() => onDelete(order)} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <TableFooter count={orders.length} label="commande" />
    </>
  );
}

function OrderDetail({ order, reviewOnly, onStatus, onDelete, onOrangePay, onMtnPay }) {
  const visibleItems = order.items.filter((item) => item.sale_channel !== "EMBALLAGE");
  const subtotal = visibleItems.reduce((total, item) => total + Number(item.line_total || 0), 0);
  const discount = Number(order.discount_amount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const total = Math.max(0, subtotal + deliveryFee - discount);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-2xl font-black text-[var(--dashboard-secondary)]">{order.order_number}</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">{order.customer_name} · {new Date(order.created_at).toLocaleString("fr-FR")}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          {order.order_source || order.fulfillment_type} · {order.table_id ? `${order.table_room || "Salle"} / Table ${order.table_name || order.table_id}` : "Commande client"} · {orderTakerRole(order)} : {orderTakerDisplay(order)}
        </p>
        <div className="mt-2"><StatusBadge status={order.status} /></div>
        {orderKitchenTimingDetails(order).length > 0 && (
          <div className="mt-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
            {orderKitchenTimingDetails(order).map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
                <span>{row.label}</span>
                <span className="text-slate-900">{formatMinutes(row.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
        <DetailInfo label="Caissier(ère)" value={cashierDisplay(order)} />
        <DetailInfo label="Mode de paiement" value={order.payment_method || "—"} />
        {order.paid_at && (
          <DetailInfo
            label="Payée le"
            value={new Date(order.paid_at).toLocaleString("fr-FR")}
          />
        )}
        {isDeliveryOrder(order) && order.delivery_area_name && (
          <DetailInfo label="Quartier" value={order.delivery_area_name} />
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {visibleItems.map((item) => (
          <div key={item.id} className="flex justify-between py-2 text-sm">
            <span className="font-semibold text-slate-600">{item.quantity} x {item.name}</span>
            <strong>{money(item.line_total)}</strong>
          </div>
        ))}
      </div>

      <div className="space-y-1 rounded-lg border border-slate-100 bg-white p-3 text-sm font-semibold text-slate-700">
        <div className="flex justify-between"><span>Sous-total</span><span>{money(subtotal)}</span></div>
        {deliveryFee > 0 && (
          <div className="flex justify-between"><span>Frais de livraison</span><span>{money(deliveryFee)}</span></div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Réduction</span>
            <span>- {money(discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-950">
          <span>Total TTC</span>
          <span>{money(order.total_amount ?? total)}</span>
        </div>
      </div>

      {order.notes && <div className="rounded-lg bg-orange-50 p-3 text-sm font-semibold text-orange-700">{order.notes}</div>}

      {/* Bouton Orange Money — visible si commande non payée */}
      {onOrangePay && ["Prête", "Livrée"].includes(order.status) && !order.payment_locked && (
        <button
          type="button"
          onClick={() => onOrangePay(order.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 text-sm font-black text-white transition hover:bg-orange-600"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-black">OM</span>
          Payer par Orange Money · {money(order.total_amount)}
        </button>
      )}
      {onMtnPay && ["Prête", "Livrée"].includes(order.status) && !order.payment_locked && (
        <button
          type="button"
          onClick={() => onMtnPay(order.id)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 py-3 text-sm font-black text-white transition hover:bg-yellow-600"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-black">M</span>
          Payer par MTN Mobile Money · {money(order.total_amount)}
        </button>
      )}

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

function DetailInfo({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const tones = {
    Nouvelle: "blue",
    Acceptée: "green",
    "En préparation": "orange",
    Prête: "green",
    Livrée: "slate",
    Payée: "green",
    PENDING_PAYMENT: "orange",
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
