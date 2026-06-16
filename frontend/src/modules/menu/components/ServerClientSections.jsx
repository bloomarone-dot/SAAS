import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import DishesPage from "@/modules/menu/pages/DishesPage";
import { orderApi } from "@/modules/orders/services/orderApi";
import { paymentApi } from "@/modules/orders/services/paymentApi";
import { tableApi } from "@/modules/menu/services/tableApi";

const PAYMENT_REQUESTABLE_STATUSES = ["Prête", "Livrée", "Livree", "Servie"];
const PAID_OR_DEAD_STATUSES = ["Payée", "Payee", "Annulée", "Annulee", "PENDING_PAYMENT", "Archivée"];

function isPaymentRequestable(order) {
  if (PAID_OR_DEAD_STATUSES.includes(order.status)) return false;
  if (Number(order.total_amount || 0) <= 0) return false;
  return Boolean(order.is_closed) || PAYMENT_REQUESTABLE_STATUSES.includes(order.status);
}

function formatMsisdn(raw) {
  return String(raw || "").replace(/\D/g, "").replace(/^(?:237|00237)/, "").slice(0, 9);
}

export function ServerClients() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    orderApi.list().then(setOrders).catch(() => setOrders([]));
  }, []);

  const clients = useMemo(() => {
    const map = new Map();
    orders.filter(isBillableOrder).forEach((order) => {
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

  const billableOrders = useMemo(() => orders.filter(isBillableOrder), [orders]);
  const invoiceTotal = useMemo(
    () => billableOrders.reduce((total, order) => total + Number(order.total_amount || 0), 0),
    [billableOrders]
  );

  return (
    <section className="space-y-5">
      <Header title="Factures" subtitle="Commandes à facturer, additions demandées et commandes payées." icon="FileText" />
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Factures actives" value={billableOrders.length} icon="ReceiptText" />
        <SummaryCard label="Total factures" value={`${invoiceTotal.toLocaleString("fr-FR")} FCFA`} icon="Wallet" />
        <SummaryCard label="Commandes annulées" value={orders.length - billableOrders.length} icon="TrendingDown" />
      </div>
      <DataTable
        headers={["Facture", "Client / Table", "Salle", "Statut", "Montant"]}
        rows={orders.map((order) => [
          order.order_number,
          order.table_id ? `Table ${order.table_name || order.table_id}` : order.customer_name,
          order.table_room || "-",
          order.status,
          `${Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA`,
        ])}
        empty="Aucune facture trouvée."
        footerLabel="Somme des factures"
        footerValue={`${invoiceTotal.toLocaleString("fr-FR")} FCFA`}
      />
    </section>
  );
}

export function ServerOpenTables({ restaurantId }) {
  const [tables, setTables] = useState([]);
  const [partySizes, setPartySizes] = useState({});
  const [message, setMessage] = useState("");
  const [loadingTableId, setLoadingTableId] = useState("");

  useEffect(() => {
    loadTables();
  }, [restaurantId]);

  async function loadTables() {
    if (!restaurantId) return;
    setTables(await tableApi.getTables(restaurantId).catch(() => []));
  }

  async function openTable(table) {
    const partySize = Math.max(1, Number(partySizes[table.id] || 1));
    setLoadingTableId(table.id);
    setMessage("");
    try {
      const result = await tableApi.createOrder(table.id, { party_size: partySize });
      setMessage(`Table ${table.name || table.number} ouverte avec la commande ${result.order.order_number}.`);
      await loadTables();
    } catch (error) {
      setMessage(error.message || "Ouverture de table impossible.");
    } finally {
      setLoadingTableId("");
    }
  }

  const availableTables = useMemo(
    () => tables.filter((table) => Number(table.free_seats ?? table.capacity ?? 0) > 0),
    [tables]
  );

  return (
    <section className="space-y-5">
      <Header title="Ouverture table" subtitle="Sélectionnez une table libre, précisez le nombre de personnes et ouvrez une commande." icon="Plus" />
      {message && <Message text={message} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {availableTables.map((table) => (
          <TableActionCard key={table.id} table={table}>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Personnes</span>
              <input
                type="number"
                min="1"
                max={Math.max(1, Number(table.free_seats ?? table.capacity ?? 1))}
                value={partySizes[table.id] || 1}
                onChange={(event) => setPartySizes((current) => ({ ...current, [table.id]: event.target.value }))}
                className="mt-2 form-control focus:border-emerald-600"
              />
            </label>
            <button
              type="button"
              onClick={() => openTable(table)}
              disabled={loadingTableId === table.id}
              className="mt-4 w-full lte-btn lte-btn-primary"
            >
              Ouvrir la table
            </button>
          </TableActionCard>
        ))}
      </div>
      {!availableTables.length && <EmptyBox text="Aucune table libre pour le moment." />}
    </section>
  );
}

export function ServerFreeTables({ restaurantId }) {
  const [tables, setTables] = useState([]);
  const [ordersByTable, setOrdersByTable] = useState({});
  const [message, setMessage] = useState("");
  const [loadingTableId, setLoadingTableId] = useState("");

  useEffect(() => {
    loadData();
  }, [restaurantId]);

  async function loadData() {
    if (!restaurantId) return;
    const tableRows = await tableApi.getTables(restaurantId).catch(() => []);
    setTables(tableRows);
    const entries = await Promise.all(
      tableRows
        .filter((table) => table.status === "Occupée" || Number(table.occupied_seats || 0) > 0)
        .map(async (table) => [table.id, await tableApi.getActiveOrders(table.id).catch(() => [])])
    );
    setOrdersByTable(Object.fromEntries(entries));
  }

  async function freeTable(table) {
    const orders = ordersByTable[table.id] || [];
    if (!orders.length) {
      setMessage(`Aucune commande active sur la table ${table.name || table.number}.`);
      await tableApi.updateTableStatus(table.id, "Libre").catch(() => null);
      await loadData();
      return;
    }
    if (!window.confirm(`Libérer la table ${table.name || table.number} ?\n\nLes commandes actives seront marquées comme livrées.`)) return;
    setLoadingTableId(table.id);
    setMessage("");
    try {
      await Promise.all(orders.map((order) => orderApi.updateStatus(order.id, "Livrée")));
      setMessage(`Table ${table.name || table.number} libérée.`);
      await loadData();
    } catch (error) {
      setMessage(error.message || "Libération de table impossible.");
    } finally {
      setLoadingTableId("");
    }
  }

  const occupiedTables = useMemo(
    () => tables.filter((table) => table.status === "Occupée" || Number(table.occupied_seats || 0) > 0),
    [tables]
  );

  return (
    <section className="space-y-5">
      <Header title="Libération table" subtitle="Clôturez le service d'une table et rendez-la disponible pour une nouvelle commande." icon="Power" />
      {message && <Message text={message} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {occupiedTables.map((table) => (
          <TableActionCard key={table.id} table={table}>
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Commandes actives</p>
              <div className="mt-2 space-y-2">
                {(ordersByTable[table.id] || []).map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
                    <span>{order.order_number}</span>
                    <span>{Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA</span>
                  </div>
                ))}
                {!(ordersByTable[table.id] || []).length && <p className="text-xs font-semibold text-slate-500">Aucune commande chargée.</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => freeTable(table)}
              disabled={loadingTableId === table.id}
              className="mt-4 h-11 w-full rounded-lg bg-red-600 text-sm font-black text-white disabled:opacity-60"
            >
              Libérer la table
            </button>
          </TableActionCard>
        ))}
      </div>
      {!occupiedTables.length && <EmptyBox text="Aucune table occupée à libérer." />}
    </section>
  );
}

export function ServerOrderWorkspace({ restaurantId, role, view }) {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [loadingOrderId, setLoadingOrderId] = useState("");

  useEffect(() => {
    loadOrders();
  }, [view]);

  async function loadOrders() {
    const data = await orderApi.list({ limit: 200 }).catch(() => []);
    setOrders(data);
    setSelectedOrderId((current) => current || data.find(isActiveOrder)?.id || data[0]?.id || "");
  }

  async function runOrderAction(order, action) {
    setLoadingOrderId(order.id);
    setMessage("");
    try {
      if (action === "send-kitchen") {
        await orderApi.sendToKitchen(order.id);
        setMessage(`Commande ${order.order_number} envoyée en cuisine.`);
      }
      if (action === "served") {
        await orderApi.updateStatus(order.id, "Livrée");
        setMessage(`Commande ${order.order_number} marquée comme servie.`);
      }
      if (action === "bill") {
        await orderApi.updateStatus(order.id, "Prête");
        setMessage(`Addition demandée pour ${order.order_number}.`);
      }
      await loadOrders();
    } catch (error) {
      setMessage(error.message || "Action commande impossible.");
    } finally {
      setLoadingOrderId("");
    }
  }

  if (view === "request-payment") {
    return <ServerPaymentRequests orders={orders} onReload={loadOrders} />;
  }

  if (view === "new-table-order") {
    return <ServerOpenTables restaurantId={restaurantId} />;
  }

  if (view === "add-order-items") {
    const candidates = orders.filter((order) => isActiveOrder(order) && order.table_id);
    const selected = candidates.find((order) => order.id === selectedOrderId) || candidates[0];
    return (
      <section className="space-y-5">
        <Header title="Ajouter plats" subtitle="Choisissez une commande active puis ajoutez les plats depuis le catalogue." icon="UtensilsCrossed" />
        <OrderSelector orders={candidates} selectedOrderId={selected?.id || ""} onSelect={setSelectedOrderId} />
        {selected ? (
          <DishesPage restaurantId={restaurantId} role={role} activeOrderId={selected.id} />
        ) : (
          <EmptyBox text="Aucune commande active sur table. Ouvrez d'abord une nouvelle commande." />
        )}
      </section>
    );
  }

  const config = getOrderWorkspaceConfig(view);
  const visibleOrders = orders.filter(config.filter);

  return (
    <section className="space-y-5">
      <Header title={config.title} subtitle={config.subtitle} icon={config.icon} />
      {message && <Message text={message} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleOrders.map((order) => (
          <OrderActionCard
            key={order.id}
            order={order}
            actionLabel={config.actionLabel}
            disabled={!config.action}
            loading={loadingOrderId === order.id}
            onAction={() => runOrderAction(order, config.action)}
          />
        ))}
      </div>
      {!visibleOrders.length && <EmptyBox text={config.empty} />}
    </section>
  );
}

function isBillableOrder(order) {
  return !["Annulée", "Annulee"].includes(order.status);
}

function isActiveOrder(order) {
  return !["Payée", "Payee", "Livrée", "Livree", "Annulée", "Annulee"].includes(order.status);
}

function getOrderWorkspaceConfig(view) {
  const configs = {
    orders: {
      title: "Suivi commandes",
      subtitle: "Suivez les commandes de table et leur progression.",
      icon: "ClipboardList",
      filter: () => true,
      empty: "Aucune commande trouvée.",
    },
    "send-kitchen": {
      title: "Envoyer cuisine",
      subtitle: "Envoyez en cuisine les commandes composées par les serveuses.",
      icon: "ChefHat",
      filter: (order) => ["Nouvelle", "Acceptée"].includes(order.status) && Number(order.items?.length || 0) > 0,
      action: "send-kitchen",
      actionLabel: "Envoyer en cuisine",
      empty: "Aucune commande prête à envoyer en cuisine.",
    },
    "ready-notifications": {
      title: "Commandes prêtes",
      subtitle: "Consultez les commandes prêtes à servir.",
      icon: "Bell",
      filter: (order) => order.status === "Prête",
      empty: "Aucune commande prête.",
    },
    "served-orders": {
      title: "Marquer servie",
      subtitle: "Validez les commandes prêtes une fois servies en salle.",
      icon: "CheckCircle2",
      filter: (order) => order.status === "Prête",
      action: "served",
      actionLabel: "Marquer servie",
      empty: "Aucune commande prête à marquer comme servie.",
    },
    "request-bill": {
      title: "Demander addition",
      subtitle: "Passez une commande en attente d'encaissement pour la caisse.",
      icon: "ReceiptText",
      filter: (order) => isActiveOrder(order) && Number(order.total_amount || 0) > 0,
      action: "bill",
      actionLabel: "Demander addition",
      empty: "Aucune commande facturable pour le moment.",
    },
  };
  return configs[view] || configs.orders;
}

function OrderSelector({ orders, selectedOrderId, onSelect }) {
  return (
    <select value={selectedOrderId} onChange={(event) => onSelect(event.target.value)} className="h-12 max-w-xl rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none">
      {orders.map((order) => (
        <option key={order.id} value={order.id}>
          {order.order_number} · {order.table_room || "Salle"} · Table {order.table_name || order.table_id} · {Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA
        </option>
      ))}
    </select>
  );
}

function OrderActionCard({ order, actionLabel, disabled, loading, onAction }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-slate-950">{order.order_number}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {order.table_id ? `${order.table_room || "Salle"} · Table ${order.table_name || order.table_id}` : order.customer_name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{order.status}</span>
          <OrderOpenBadge order={order} />
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
        <p>Source : {order.order_source || order.fulfillment_type}</p>
        <p>Serveuse : {order.server_name || "-"}</p>
        <p>Articles : {order.items?.length || 0}</p>
        <p className="text-base font-black text-slate-950">{Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA</p>
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled || loading}
          className="mt-4 w-full lte-btn lte-btn-primary"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function ServerPaymentRequests({ orders, onReload }) {
  const [activeOrder, setActiveOrder] = useState(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const eligible = orders.filter(isPaymentRequestable);

  async function closeOrder(order) {
    setBusyId(order.id);
    setMessage("");
    try {
      await orderApi.close(order.id);
      setMessage(`Commande ${order.order_number} fermée. Vous pouvez demander le paiement.`);
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "Fermeture de la commande impossible.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="space-y-5">
      <Header title="Fermer & demander le paiement" subtitle="Quand le client demande la note : fermez la commande (plus d'ajout possible), puis transmettez le mode de paiement à la caisse." icon="Wallet" />
      {message && <Message text={message} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {eligible.map((order) => (
          <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-slate-950">{order.order_number}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {order.table_id ? `${order.table_room || "Salle"} · Table ${order.table_name || order.table_id}` : order.customer_name}
                </p>
              </div>
              <OrderOpenBadge order={order} />
            </div>
            <p className="mt-4 text-base font-black text-slate-950">{Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA</p>
            {order.is_closed ? (
              <button type="button" onClick={() => { setMessage(""); setActiveOrder(order); }} className="mt-4 w-full lte-btn lte-btn-primary">
                <DashboardIcon name="Wallet" size={16} /> Demander le paiement
              </button>
            ) : (
              <button type="button" onClick={() => closeOrder(order)} disabled={busyId === order.id} className="mt-4 w-full lte-btn lte-btn-default">
                <DashboardIcon name="ReceiptText" size={16} /> {busyId === order.id ? "Fermeture…" : "Fermer la commande (note)"}
              </button>
            )}
          </div>
        ))}
      </div>
      {!eligible.length && <EmptyBox text="Aucune commande finalisée à encaisser pour le moment." />}

      {activeOrder && (
        <PaymentRequestModal
          order={activeOrder}
          onClose={() => setActiveOrder(null)}
          onDone={(label) => {
            setActiveOrder(null);
            setMessage(label);
            onReload?.();
          }}
        />
      )}
    </section>
  );
}

function OrderOpenBadge({ order }) {
  return order.is_closed ? (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Fermée</span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Ouverte</span>
  );
}

function PaymentRequestModal({ order, onClose, onDone }) {
  const [method, setMethod] = useState("ORANGE");
  const [msisdn, setMsisdn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isMobile = method === "ORANGE" || method === "MTN";

  async function submit() {
    setError("");
    const cleaned = formatMsisdn(msisdn);
    if (isMobile && cleaned.length < 8) {
      setError("Numéro Mobile Money du client invalide (ex: 690 000 000).");
      return;
    }
    setSubmitting(true);
    try {
      await paymentApi.createRequest({
        order_id: order.id,
        method,
        payer_msisdn: isMobile ? cleaned : null,
      });
      onDone(`Demande de paiement envoyée à la caisse pour ${order.order_number}.`);
    } catch (err) {
      setError(err.message || "Envoi de la demande impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  const methods = [
    { value: "ORANGE", label: "Orange Money" },
    { value: "MTN", label: "MTN Mobile Money" },
    { value: "CASH", label: "Espèces" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="lte-card mb-0 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
        <div className="lte-card-header">
          <h2 className="lte-card-title"><DashboardIcon name="Wallet" size={17} /> Demander le paiement</h2>
          <div className="lte-card-tools">
            <button type="button" onClick={onClose} className="lte-tool-btn"><DashboardIcon name="X" size={14} /></button>
          </div>
        </div>
        <div className="lte-card-body space-y-4">
          <p className="text-sm font-semibold text-slate-600">
            Commande <strong>{order.order_number}</strong> · {Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA
          </p>

          <div>
            <span className="lte-label">Mode de paiement choisi par le client</span>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMethod(item.value)}
                  className={`rounded border px-2 py-2 text-xs font-semibold transition ${method === item.value ? "border-[var(--dashboard-primary)] bg-[color-mix(in_srgb,var(--dashboard-primary)_10%,white)] text-[var(--dashboard-primary)]" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {isMobile && (
            <label className="lte-form-group">
              <span className="lte-label">Numéro {method === "ORANGE" ? "Orange" : "MTN"} du client <span className="req">*</span></span>
              <input
                type="tel"
                value={msisdn}
                onChange={(event) => setMsisdn(event.target.value)}
                placeholder="6XX XXX XXX"
                className="form-control"
                autoFocus
              />
              <span className="lte-help">Format camerounais : 6XX XXX XXX (sans indicatif). Le client confirmera le paiement par USSD.</span>
            </label>
          )}

          {method === "CASH" && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              La caisse confirmera l'encaissement des espèces. Aucune notification automatique au client.
            </p>
          )}

          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        </div>
        <div className="lte-card-footer">
          <button type="button" onClick={onClose} className="lte-btn lte-btn-default">Annuler</button>
          <button type="button" onClick={submit} disabled={submitting} className="ml-auto lte-btn lte-btn-primary">
            {submitting ? "Envoi…" : "Envoyer à la caisse"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TableActionCard({ table, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-black text-slate-950">Table {table.name || table.number}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{table.room || "Rez-de-chaussée"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${table.status === "Occupée" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
          {table.status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Capacité" value={table.capacity} />
        <Info label="Places libres" value={table.free_seats ?? table.capacity} />
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function Message({ text }) {
  const isError = /impossible|erreur|insuffisantes/i.test(text);
  return (
    <div className={`rounded-lg border p-3 text-sm font-semibold ${isError ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
      {text}
    </div>
  );
}

function EmptyBox({ text }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
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

function SummaryCard({ label, value, icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <DashboardIcon name={icon} size={18} />
        </span>
        <div>
          <p className="text-xs font-black uppercase text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DataTable({ headers, rows, empty, footerLabel, footerValue }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.length === 0 ? (
        <div className="p-10 text-center text-sm font-semibold text-slate-500">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="lte-table min-w-[720px]">
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
            {footerValue && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={Math.max(1, headers.length - 1)} className="px-5 py-4 text-right text-sm font-black uppercase text-slate-500">
                    {footerLabel || "Total"}
                  </td>
                  <td className="px-5 py-4 text-right text-base font-black text-slate-950">
                    {footerValue}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
