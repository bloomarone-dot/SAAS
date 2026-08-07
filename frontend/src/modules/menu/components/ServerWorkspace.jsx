import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PageHeader } from "@/modules/admin/components/AdminUi";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { menuApi } from "../services/menuApi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { paymentApi } from "@/modules/orders/services/paymentApi";
import TableGrid from "./TableGrid";
import TableSessionModal from "./TableSessionModal";
import { clearServerSession, loadOrderSnapshot, loadServerSession, saveOrderSnapshot, saveServerSession } from "../utils/serverSessionStorage";
import { AlphabetFilter, filterByLetter } from "@/components/shared/AlphabetFilter";
import { cacheMenuCatalog, getCachedMenuCatalogAsync } from "@/utils/offlineCache";
import { enqueueOfflineAction, isNetworkError, preferLocalOpsAfterProbe, shouldPreferLocalData } from "@/utils/network";
import { loadLocalFirst } from "@/offline/localFirst";
import {
  buildServerReportText,
  downloadTextFile,
  shareReportOnWhatsApp,
  toCsv,
} from "@/utils/roleReportShare";
import { useAutoClearMessage } from "@/utils/useAutoClearMessage";
import { formatMinutes, orderKitchenTimingDetails, orderKitchenTimingLabel } from "../utils/kitchenTiming";
import {
  closeLocalOrderForBill,
  getLocalOrder,
  isLocalId,
  markLocalOrderServed,
  mirrorOrderLocal,
  sendLocalOrderToKitchen,
  updateLocalOrderItems,
  listLocalOrders,
} from "@/offline";
import { KITCHEN_ENABLED } from "@/config/features";

const money = (value) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
const PAID_STATUSES = ["Payée", "Payee", "Annulée", "Annulee"];
const PAYMENT_READY_STATUSES = ["Prête", "Prete", "Livrée", "Livree", "Servie"];

function normalizeStatus(status) {
  const value = String(status || "").trim();
  if (value === "Prete") return "Prête";
  if (value === "Livree") return "Livrée";
  return value;
}

function isPaid(status) {
  return PAID_STATUSES.includes(normalizeStatus(status));
}

function isActiveServerOrder(order) {
  if (!order) return false;
  const status = normalizeStatus(order.status);
  return !isPaid(status) && !["Annulée", "Annulee"].includes(status);
}

function orderStatusBadge(order) {
  const status = normalizeStatus(order?.status);
  if (status === "Prête") return { label: "Prête", tone: "ready" };
  if (["Livrée", "Servie"].includes(status)) return { label: "Servie", tone: "served" };
  if (["En préparation", "Acceptée"].includes(status)) return { label: "Cuisine", tone: "kitchen" };
  if (order?.is_closed) return { label: "Addition", tone: "bill" };
  return { label: status || "Nouvelle", tone: "default" };
}

function isReadyStatus(status) {
  return normalizeStatus(status) === "Prête";
}

function isServedStatus(status) {
  return ["Livrée", "Servie"].includes(normalizeStatus(status));
}

function canPayOrder(order) {
  if (!order || isPaid(order.status)) return false;
  if (Number(order.total_amount || 0) <= 0) return false;
  return order.is_closed || PAYMENT_READY_STATUSES.includes(normalizeStatus(order.status));
}

/** Commande 100 % boissons bar (pas de passage cuisine). */
function dishSaleChannel(dish, item) {
  const channel = String(item?.sale_channel || dish?.sale_channel || "").toUpperCase();
  if (channel === "REPAS" || channel === "BOISSON") return channel;
  if (dish?.requires_kitchen === true) return "REPAS";
  if (dish?.requires_kitchen === false) return "BOISSON";
  return "REPAS";
}

function isDrinksOnlyOrder(order, dishes = []) {
  const items = (order?.items || []).filter((item) => String(item.sale_channel || "").toUpperCase() !== "EMBALLAGE");
  if (!items.length) return false;
  const dishesById = Object.fromEntries((dishes || []).map((dish) => [dish.id, dish]));
  return items.every((item) => dishSaleChannel(dishesById[item.menu_item_id], item) === "BOISSON");
}

const STEPS = KITCHEN_ENABLED
  ? [
      { key: "table", label: "Table" },
      { key: "order", label: "Commande" },
      { key: "kitchen", label: "Cuisine" },
      { key: "serve", label: "Service" },
      { key: "payment", label: "Paiement" },
    ]
  : [
      { key: "table", label: "Table" },
      { key: "order", label: "Commande" },
      { key: "serve", label: "Service" },
      { key: "payment", label: "Paiement" },
    ];

function formatMsisdn(raw) {
  return String(raw || "")
    .replace(/\D/g, "")
    .replace(/^(?:237|00237)/, "")
    .slice(0, 9);
}

function activeStep(order) {
  if (!order) return "table";
  if (isPaid(order.status)) return "payment";
  if (canPayOrder(order) && order.is_closed) return "payment";
  if (isServedStatus(order.status)) return "serve";
  if (KITCHEN_ENABLED && isReadyStatus(order.status)) return "serve";
  if (KITCHEN_ENABLED && ["En préparation", "Acceptée"].includes(normalizeStatus(order.status))) return "kitchen";
  if (!KITCHEN_ENABLED && ["Acceptée", "En préparation"].includes(normalizeStatus(order.status))) return "serve";
  return "order";
}

export default function ServerWorkspace({ restaurantId, currentUser }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [session, setSession] = useState(null);
  const [order, setOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [letterFilter, setLetterFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  useAutoClearMessage(message, setMessage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [menuMode, setMenuMode] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [readyAlert, setReadyAlert] = useState(false);
  const [dailyStats, setDailyStats] = useState(null);
  const [activeOrders, setActiveOrders] = useState([]);
  const [resuming, setResuming] = useState(true);
  const autoResumeRef = useRef(true);

  const loadActiveOrders = useCallback(async () => {
    if (!currentUser?.id) return [];
    const mergeById = new Map();

    async function applyLocal() {
      if (!restaurantId) return;
      const local = await listLocalOrders(restaurantId);
      local
        .filter(
          (item) =>
            isActiveServerOrder(item)
            && (item.server_id === currentUser.id || !item.server_id),
        )
        .forEach((item) => mergeById.set(String(item.id), item));
    }

    if (shouldPreferLocalData()) {
      await applyLocal();
      const rows = [...mergeById.values()].sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
      );
      setActiveOrders(rows);
      return rows;
    }

    try {
      const orders = await orderApi.list({ server_id: currentUser.id, limit: 100 });
      orders
        .filter((item) => item.server_id === currentUser.id && isActiveServerOrder(item))
        .forEach((item) => mergeById.set(String(item.id), item));
      await applyLocal();
      const rows = [...mergeById.values()].sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
      );
      setActiveOrders(rows);
      return rows;
    } catch {
      await applyLocal();
      const rows = [...mergeById.values()].sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
      );
      setActiveOrders(rows);
      return rows;
    }
  }, [currentUser?.id, restaurantId]);

  const loadOrder = useCallback(async (orderId) => {
    if (!orderId) return;
    if (isLocalId(orderId)) {
      const local = await getLocalOrder(orderId);
      if (local) {
        setOrder(local);
        if (currentUser?.id) saveOrderSnapshot(currentUser.id, local);
      } else {
        setError("Commande locale introuvable.");
      }
      return;
    }
    if (shouldPreferLocalData()) {
      const local = await getLocalOrder(orderId);
      const snapshot = currentUser?.id ? loadOrderSnapshot(currentUser.id, orderId) : null;
      const fallback = local || snapshot;
      if (fallback) {
        setOrder(fallback);
        setMessage("Commande chargée depuis la mémoire locale.");
        return;
      }
    }
    try {
      const data = await orderApi.get(orderId);
      setOrder(data);
      if (currentUser?.id) saveOrderSnapshot(currentUser.id, data);
      if (restaurantId) mirrorOrderLocal(data, restaurantId).catch(() => {});
      const status = normalizeStatus(data.status);
      if (isReadyStatus(status) || (isServedStatus(status) && !isPaid(status) && !data.is_closed)) {
        setReadyAlert(true);
      }
    } catch (err) {
      const snapshot = currentUser?.id ? loadOrderSnapshot(currentUser.id, orderId) : null;
      const local = await getLocalOrder(orderId);
      const fallback = local || snapshot;
      if (fallback) {
        setOrder(fallback);
        setMessage("Connexion instable : affichage de la dernière commande enregistrée localement.");
      } else if (!isNetworkError(err)) {
        setError(err.message || "Impossible de charger la commande.");
      }
    }
  }, [currentUser?.id, restaurantId]);

  const loadMenu = useCallback(async () => {
    if (!restaurantId) return;

    try {
      await loadLocalFirst({
        loadCache: () => getCachedMenuCatalogAsync(restaurantId),
        fetchRemote: async () => {
          const catalog = await menuApi.getCatalog(restaurantId, true);
          const nextCategories = (catalog.categories || []).filter((item) => item.is_active !== false);
          const nextDishes = (catalog.dishes || []).filter((dish) => dish.is_available !== false);
          cacheMenuCatalog(restaurantId, nextCategories, nextDishes);
          return { categories: nextCategories, dishes: nextDishes };
        },
        apply: ({ categories = [], dishes = [] }) => {
          setCategories(categories.filter((item) => item.is_active !== false));
          setDishes(dishes.filter((dish) => dish.is_available !== false));
          setError("");
        },
        onNotice: (notice) => setMessage(notice),
      });
    } catch {
      setError("Impossible de charger le menu. Connectez-vous une fois en ligne pour le mémoriser.");
    }
  }, [restaurantId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    if (!session?.orderId) return;
    loadOrder(session.orderId);
  }, [session?.orderId, loadOrder]);

  useAutoRefresh(() => {
    if (session?.orderId) loadOrder(session.orderId);
    loadActiveOrders();
  }, currentUser?.id ? 8000 : 0, [session?.orderId, loadOrder, loadActiveOrders, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadActiveOrders();
  }, [currentUser?.id, loadActiveOrders]);

  useEffect(() => {
    if (session || !currentUser?.id) {
      setResuming(false);
      return;
    }
    if (!autoResumeRef.current) {
      setResuming(false);
      return;
    }

    let cancelled = false;

    async function tryResumeSession() {
      const saved = loadServerSession(currentUser.id);
      if (saved?.orderId) {
        if (isLocalId(saved.orderId)) {
          const local = await getLocalOrder(saved.orderId);
          if (local && !cancelled) {
            setSession({
              orderId: saved.orderId,
              tableId: saved.tableId || local.table_id,
              tableName: saved.tableName || local.table_name || "—",
              tableRoom: saved.tableRoom || local.table_room || "Rez-de-chaussée",
            });
            setMenuMode(saved.menuMode !== false);
            setOrder(local);
            setMessage("Reprise hors ligne de votre commande locale.");
            setResuming(false);
            return;
          }
        }
        try {
          const data = await orderApi.get(saved.orderId);
          if (cancelled) return;
          if (isPaid(data.status) || ["Annulée", "Annulee"].includes(normalizeStatus(data.status))) {
            clearServerSession();
          } else if (data.server_id && data.server_id !== currentUser.id) {
            clearServerSession();
          } else {
            setSession({
              orderId: saved.orderId,
              tableId: saved.tableId || data.table_id,
              tableName: saved.tableName || data.table_name || "—",
              tableRoom: saved.tableRoom || data.table_room || "Rez-de-chaussée",
            });
            setMenuMode(saved.menuMode !== false);
            setOrder(data);
            setMessage("Reprise de votre commande en cours.");
            setResuming(false);
            return;
          }
        } catch {
          const snapshot = loadOrderSnapshot(currentUser.id, saved.orderId);
          if (snapshot) {
            if (cancelled) return;
            setSession({
              orderId: saved.orderId,
              tableId: saved.tableId || snapshot.table_id,
              tableName: saved.tableName || snapshot.table_name || "—",
              tableRoom: saved.tableRoom || snapshot.table_room || "Rez-de-chaussée",
            });
            setMenuMode(saved.menuMode !== false);
            setOrder(snapshot);
            setMessage("Reprise hors ligne de votre commande en cours.");
            setResuming(false);
            return;
          }
          if (!navigator.onLine) {
            setResuming(false);
            return;
          }
          clearServerSession();
        }
      }

      try {
        const orders = await orderApi.list({ server_id: currentUser.id, limit: 100 });
        if (cancelled) return;
        const active = orders.filter(
          (item) =>
            item.server_id === currentUser.id &&
            !isPaid(item.status) &&
            !["Annulée", "Annulee"].includes(normalizeStatus(item.status))
        );
        const latest = active.sort(
          (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        )[0];
        if (latest) {
          setSession({
            orderId: latest.id,
            tableId: latest.table_id,
            tableName: latest.table_name || "—",
            tableRoom: latest.table_room || "Rez-de-chaussée",
          });
          setOrder(latest);
          saveServerSession(currentUser.id, {
            orderId: latest.id,
            tableId: latest.table_id,
            tableName: latest.table_name || "—",
            tableRoom: latest.table_room || "Rez-de-chaussée",
            menuMode: true,
          });
          setMessage("Votre dernière commande active a été reprise automatiquement.");
        }
      } catch {
        // pas de reprise possible
      } finally {
        if (!cancelled) setResuming(false);
      }
    }

    tryResumeSession();
    return () => {
      cancelled = true;
    };
  }, [session, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || resuming) return;
    orderApi
      .list({ server_id: currentUser.id, limit: 200 })
      .then((orders) => {
        const today = new Date().toDateString();
        const mineToday = orders.filter(
          (item) =>
            item.server_id === currentUser.id &&
            new Date(item.created_at).toDateString() === today &&
            !["Annulée", "Annulee"].includes(normalizeStatus(item.status))
        );
        const clients = mineToday.reduce(
          (total, item) => total + Math.max(1, Number(item.party_size || 1)),
          0
        );
        const sales = mineToday.reduce((total, item) => total + Number(item.total_amount || 0), 0);
        const paid = mineToday.filter((item) => isPaid(item.status)).length;
        setDailyStats({
          orders: mineToday.length,
          clients,
          sales,
          paid,
          recent: mineToday.slice(0, 6),
        });
      })
      .catch(() =>
        setDailyStats({
          orders: 0,
          clients: 0,
          sales: 0,
          paid: 0,
          recent: [],
        }),
      );
  }, [session, currentUser?.id, resuming]);

  const visibleDishes = useMemo(() => {
    const byCategory =
      categoryFilter === "ALL" ? dishes : dishes.filter((dish) => dish.category_id === categoryFilter);
    return filterByLetter(byCategory, letterFilter);
  }, [categoryFilter, dishes, letterFilter]);

  const visibleItems = useMemo(
    () => (order?.items ?? []).filter((item) => item.sale_channel !== "EMBALLAGE"),
    [order?.items]
  );

  const orderStatus = normalizeStatus(order?.status);
  const currentStep = session ? activeStep(order) : "table";
  const canEditOrder = order && !order.is_closed && !isPaid(order?.status);
  const showMenu = menuMode && canEditOrder;
  const hasItems = visibleItems.length > 0;
  const canSendKitchen =
    canEditOrder &&
    hasItems &&
    ["Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée"].includes(orderStatus);
  const isReady = isReadyStatus(order?.status);
  const isServed = isServedStatus(order?.status);
  const drinksOnly = isDrinksOnlyOrder(order, dishes);
  const canRequestPayment = canPayOrder(order);
  const waitingKitchen = KITCHEN_ENABLED && !drinksOnly && ["En préparation", "Acceptée"].includes(orderStatus) && !isReady && !isServed;
  const canMarkServed = !drinksOnly && !isServed && (
    KITCHEN_ENABLED
      ? isReady && !(order?.is_closed && isReady)
      : ["Acceptée", "En préparation"].includes(orderStatus)
  );

  function switchToOrder(orderRow) {
    if (!orderRow?.id) return;
    openOrder(
      orderRow.id,
      orderRow.table_name || orderRow.tableName || "—",
      orderRow.table_room || orderRow.tableRoom || "Rez-de-chaussée",
      orderRow.table_id || orderRow.tableId || null,
    );
  }

  function openOrder(orderId, tableName, tableRoom, tableId = null) {
    const nextSession = {
      orderId,
      tableId,
      tableName,
      tableRoom: tableRoom || "Rez-de-chaussée",
    };
    setSession(nextSession);
    setSelectedTable(null);
    setMenuMode(true);
    setMessage("");
    setError("");
    setReadyAlert(false);
    if (currentUser?.id) {
      saveServerSession(currentUser.id, { ...nextSession, menuMode: true });
    }
    loadActiveOrders();
  }

  function openTablePicker() {
    autoResumeRef.current = false;
    setSession(null);
    setOrder(null);
    setSelectedTable(null);
    setMenuMode(true);
    setMessage("Choisissez une table pour une nouvelle commande, ou reprenez une commande ci-dessus.");
    setError("");
    setReadyAlert(false);
  }

  useEffect(() => {
    function onRemap(event) {
      const { localId, serverId } = event.detail || {};
      if (!localId || !serverId) return;
      setSession((current) => {
        if (!current || current.orderId !== localId) return current;
        const next = { ...current, orderId: serverId };
        if (currentUser?.id) {
          saveServerSession(currentUser.id, { ...next, menuMode });
        }
        return next;
      });
      setOrder((current) => (current?.id === localId ? { ...current, id: serverId, _local: false } : current));
      setMessage("Commande synchronisée avec le serveur.");
    }
    window.addEventListener("offline-id-remapped", onRemap);
    return () => window.removeEventListener("offline-id-remapped", onRemap);
  }, [currentUser?.id, menuMode]);

  async function updateOrderItems(items) {
    if (!session?.orderId || !canEditOrder) return;
    setBusy("items");
    setError("");
    const dishesById = Object.fromEntries(dishes.map((dish) => [dish.id, dish]));

    if (isLocalId(session.orderId)) {
      try {
        const base = order || (await getLocalOrder(session.orderId));
        const updated = await updateLocalOrderItems(base, items, dishesById);
        setOrder(updated);
        if (currentUser?.id) saveOrderSnapshot(currentUser.id, updated);
        enqueueOfflineAction({
          type: "update_order_items",
          label: `Commande ${session.orderId}`,
          localOrderId: session.orderId,
          items,
          requests: [],
        });
        setMessage("Articles enregistrés localement (hors ligne).");
      } catch (err) {
        setError(err.message || "Mise à jour locale impossible.");
      } finally {
        setBusy("");
      }
      return;
    }

    try {
      const updated = await orderApi.update(session.orderId, { items });
      setOrder(updated);
      if (currentUser?.id) saveOrderSnapshot(currentUser.id, updated);
      if (restaurantId) mirrorOrderLocal(updated, restaurantId).catch(() => {});
    } catch (err) {
      if (isNetworkError(err)) {
        const base = order || {};
        const updated = await updateLocalOrderItems(
          { ...base, id: session.orderId, restaurantId, restaurant_id: restaurantId },
          items,
          dishesById,
        );
        setOrder(updated);
        if (currentUser?.id) saveOrderSnapshot(currentUser.id, updated);
        enqueueOfflineAction({
          type: "update_order_items",
          label: `Commande ${session.orderId}`,
          localOrderId: session.orderId,
          items,
          requests: [{
            path: `/api/v1/orders/${session.orderId}`,
            method: "PATCH",
            requiresAuth: true,
            body: { items },
          }],
        });
        setMessage("Connexion instable. Les plats sont enregistrés localement et seront synchronisés.");
      } else {
        setError(err.message || "Mise à jour impossible.");
      }
    } finally {
      setBusy("");
    }
  }

  function addDish(dish) {
    const currentItems = order?.items ?? [];
    const nextItemsById = new Map(
      currentItems
        .filter((item) => item.menu_item_id)
        .map((item) => [
          item.menu_item_id,
          { menu_item_id: item.menu_item_id, quantity: Number(item.quantity || 0) },
        ])
    );
    const existing = nextItemsById.get(dish.id);
    nextItemsById.set(dish.id, {
      menu_item_id: dish.id,
      quantity: existing ? existing.quantity + 1 : 1,
    });
    updateOrderItems([...nextItemsById.values()]);
  }

  function changeQuantity(menuItemId, quantity) {
    const nextItems = (order?.items ?? [])
      .filter((item) => item.menu_item_id)
      .map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.menu_item_id === menuItemId ? quantity : Number(item.quantity || 0),
      }))
      .filter((item) => item.quantity > 0);
    updateOrderItems(nextItems);
  }

  useEffect(() => {
    if (!session?.orderId || !currentUser?.id) return;
    saveServerSession(currentUser.id, {
      orderId: session.orderId,
      tableId: session.tableId,
      tableName: session.tableName,
      tableRoom: session.tableRoom,
      menuMode,
    });
  }, [session, menuMode, currentUser?.id]);

  useEffect(() => {
    if (!order || !currentUser?.id || !session?.orderId) return;
    if (!isPaid(order.status)) return;
    clearServerSession();
    autoResumeRef.current = false;
    loadActiveOrders().then((rows) => {
      const remaining = rows.filter((item) => String(item.id) !== String(order.id));
      if (remaining.length > 0) {
        switchToOrder(remaining[0]);
        setMessage("Commande payée. Passez à la commande suivante.");
      } else {
        setSession(null);
        setOrder(null);
        setMessage("Commande payée. Vous pouvez prendre une nouvelle commande.");
      }
    });
  }, [order?.status, order?.id, session?.orderId, currentUser?.id, loadActiveOrders]);

  async function sendToKitchen() {
    if (!session?.orderId) return;
    setBusy("kitchen");
    setError("");
    const dishesById = Object.fromEntries(dishes.map((dish) => [dish.id, dish]));

    async function sendLocal() {
      const base = order || (await getLocalOrder(session.orderId)) || { id: session.orderId };
      const result = await sendLocalOrderToKitchen(
        { ...base, restaurantId, restaurant_id: restaurantId },
        restaurantId,
        dishesById,
      );
      setOrder(result.order);
      if (currentUser?.id) saveOrderSnapshot(currentUser.id, result.order);
      const drinksOnlyOrder = isDrinksOnlyOrder(result.order, dishes);
      if (KITCHEN_ENABLED || drinksOnlyOrder) {
        setMenuMode(false);
      }
      if (drinksOnlyOrder || result.order?.status === "Prête") {
        setMessage("Boissons confirmées — demandez le paiement à la caisse maintenant.");
        setPaymentOrder(result.order);
        return;
      }
      setMessage(
        isLocalId(session.orderId)
          ? (KITCHEN_ENABLED ? "Commande envoyée en cuisine locale. Sync à la reconnexion." : "Commande confirmée localement. Sync à la reconnexion.")
          : (KITCHEN_ENABLED ? "Connexion instable. L'envoi cuisine sera synchronisé automatiquement." : "Connexion instable. La confirmation sera synchronisée."),
      );
    }

    const useLocalOnly = isLocalId(session.orderId) || await preferLocalOpsAfterProbe();
    if (useLocalOnly) {
      try {
        await sendLocal();
      } catch (err) {
        setError(err.message || "Envoi cuisine locale impossible.");
      } finally {
        setBusy("");
      }
      return;
    }

    try {
      const updated = await orderApi.sendToKitchen(session.orderId);
      setOrder(updated);
      if (restaurantId) mirrorOrderLocal(updated, restaurantId).catch(() => {});
      const drinksOnlyOrder = isDrinksOnlyOrder(updated, dishes);
      if (KITCHEN_ENABLED || drinksOnlyOrder) {
        setMenuMode(false);
      }
      if (drinksOnlyOrder || updated?.status === "Prête") {
        setMessage("Boissons confirmées — paiement immédiat demandé à la caisse.");
        setPaymentOrder(updated);
      } else {
        setMessage(KITCHEN_ENABLED
          ? "Commande envoyée en cuisine. Attendez la notification « prête »."
          : "Commande confirmée. Servez le client puis marquez « servie ».");
      }
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await sendLocal();
        } catch (localErr) {
          setError(localErr.message || "Envoi cuisine locale impossible.");
        }
      } else {
        setError(err.message || "Envoi en cuisine impossible.");
      }
    } finally {
      setBusy("");
    }
  }

  async function markServed() {
    if (!session?.orderId) return;
    setBusy("served");
    setError("");

    if (isLocalId(session.orderId)) {
      try {
        const base = order || (await getLocalOrder(session.orderId));
        const updated = await markLocalOrderServed(base, restaurantId);
        setOrder(updated);
        if (currentUser?.id) saveOrderSnapshot(currentUser.id, updated);
        setReadyAlert(false);
        setMessage("Commande marquée servie localement.");
      } catch (err) {
        setError(err.message || "Impossible de marquer comme servie.");
      } finally {
        setBusy("");
      }
      return;
    }

    try {
      const updated = await orderApi.updateStatus(session.orderId, "Livrée");
      setOrder(updated);
      if (restaurantId) mirrorOrderLocal(updated, restaurantId).catch(() => {});
      setReadyAlert(false);
      setMessage("Commande servie au client.");
    } catch (err) {
      if (isNetworkError(err)) {
        const base = order || { id: session.orderId };
        const updated = await markLocalOrderServed(
          { ...base, restaurantId, restaurant_id: restaurantId },
          restaurantId,
        );
        setOrder(updated);
        setReadyAlert(false);
        setMessage("Connexion instable. La commande est marquée servie localement et sera synchronisée.");
      } else {
        setError(err.message || "Impossible de marquer comme servie.");
      }
    } finally {
      setBusy("");
    }
  }

  async function closeOrderForBill() {
    if (!session?.orderId) return;
    setBusy("close");
    setError("");

    async function closeLocal() {
      const base = order || (await getLocalOrder(session.orderId)) || { id: session.orderId };
      const updated = await closeLocalOrderForBill(
        { ...base, restaurantId, restaurant_id: restaurantId },
        restaurantId,
      );
      setOrder(updated);
      if (currentUser?.id) saveOrderSnapshot(currentUser.id, updated);
      setMenuMode(false);
      setMessage("Commande clôturée localement. Sync à la reconnexion — paiement en caisse possible.");
    }

    const useLocalClose = isLocalId(session.orderId) || await preferLocalOpsAfterProbe();
    if (useLocalClose) {
      try {
        await closeLocal();
      } catch (err) {
        setError(err.message || "Clôture locale impossible.");
      } finally {
        setBusy("");
      }
      return;
    }

    try {
      const updated = await orderApi.close(session.orderId);
      setOrder(updated);
      if (restaurantId) mirrorOrderLocal(updated, restaurantId).catch(() => {});
      setMenuMode(false);
      setMessage("Commande clôturée. Vous pouvez demander le paiement en caisse.");
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await closeLocal();
        } catch (localErr) {
          setError(localErr.message || "Clôture locale impossible.");
        }
      } else {
        setError(err.message || "Clôture impossible.");
      }
    } finally {
      setBusy("");
    }
  }

  if (resuming) {
    return <div className="p-6 text-sm font-semibold text-slate-500">Reprise de votre session...</div>;
  }

  const reportStats = dailyStats || { orders: 0, clients: 0, sales: 0, paid: 0, recent: [] };
  const serverName = currentUser?.first_name || currentUser?.username || "Serveuse";

  function exportServerReport() {
    const dateLabel = new Date().toLocaleDateString("fr-FR");
    const rows = [
      ["Rapport serveuse", serverName],
      ["Date", dateLabel],
      ["Commandes", reportStats.orders],
      ["Clients servis", reportStats.clients],
      ["Encaissées", reportStats.paid],
      ["Total du jour", reportStats.sales],
      [],
      ["Commande", "Statut", "Montant"],
      ...(reportStats.recent || []).map((item) => [item.order_number, item.status, item.total_amount]),
    ];
    downloadTextFile(`rapport-serveuse-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${toCsv(rows)}`);
  }

  function shareServerReport() {
    shareReportOnWhatsApp(
      buildServerReportText({
        name: serverName,
        stats: reportStats,
        dateLabel: new Date().toLocaleDateString("fr-FR"),
      }),
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Service"
        title={session ? `${session.tableRoom} · Table ${session.tableName}` : "Choisissez une table"}
        subtitle={
          session
            ? "Gérez cette commande ou basculez vers une autre via la barre ci-dessous."
            : "Plusieurs commandes en parallèle : ouvrez une table ou reprenez une commande en cours."
        }
        secondaryActions={
          <>
            <button type="button" onClick={exportServerReport} className="lte-btn lte-btn-default">
              <DashboardIcon name="Download" size={16} />
              Exporter
            </button>
            <button type="button" onClick={shareServerReport} className="lte-btn lte-btn-primary">
              <DashboardIcon name="Phone" size={16} />
              WhatsApp
            </button>
          </>
        }
        primaryAction={(
            <button
              type="button"
              onClick={openTablePicker}
              className="lte-btn lte-btn-default"
            >
              <DashboardIcon name="Plus" size={16} />
              Nouvelle commande
            </button>
          )}
        meta={<StepBar current={currentStep} />}
      />

      <ServerActiveOrdersBar
        orders={activeOrders}
        currentOrderId={session?.orderId}
        onSelect={switchToOrder}
        onNewOrder={openTablePicker}
      />

      {(message || error || readyAlert) && (
        <div className="space-y-2">
          {readyAlert && (isReady || isServed) && !isPaid(order?.status) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <DashboardIcon name="Bell" size={18} />
                </span>
                <div>
                  <p className="text-sm font-black text-emerald-900">
                    {isReady && !isServed ? "Commande prête en cuisine" : "Étape suivante : paiement"}
                  </p>
                  <p className="text-xs font-semibold text-emerald-700">
                    {isReady && !isServed
                      ? "Récupérez les plats, servez le client puis validez ou demandez directement le paiement."
                      : "Le client peut régler. Envoyez la demande à la caisse."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isReady && !isServed && (
                  <button type="button" onClick={markServed} disabled={busy === "served"} className="lte-btn lte-btn-default">
                    {busy === "served" ? "Validation…" : "Marquer servie"}
                  </button>
                )}
                {canRequestPayment && (
                  <button type="button" onClick={() => setPaymentOrder(order)} className="lte-btn lte-btn-primary">
                    Demander le paiement
                  </button>
                )}
              </div>
            </div>
          )}
          {waitingKitchen && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              <p>Commande en cuisine — vous serez notifiée dès que les plats seront prêts.</p>
              {orderKitchenTimingLabel(order) && (
                <p className="mt-1 text-xs font-black text-amber-900">{orderKitchenTimingLabel(order)}</p>
              )}
              {orderKitchenTimingDetails(order).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {orderKitchenTimingDetails(order).map((row) => (
                    <span key={row.label} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      {row.label} · {formatMinutes(row.minutes)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}
        </div>
      )}

      {!session ? (
        <>
          <ServerDailyStats
            stats={reportStats}
            name={serverName}
            onExport={exportServerReport}
            onWhatsApp={shareServerReport}
          />
          <TableGrid
            restaurantId={restaurantId}
            onSelectTable={setSelectedTable}
          />
          {selectedTable && (
            <TableSessionModal
              table={selectedTable}
              currentUser={currentUser}
              restaurantId={restaurantId}
              onClose={() => setSelectedTable(null)}
              onOpenMenuForOrder={(orderId, tableName, tableRoom) =>
                openOrder(orderId, tableName, tableRoom, selectedTable?.id)
              }
              primaryActionLabel="Commande"
            />
          )}
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <MenuPanel
            hidden={!showMenu}
            categories={categories}
            dishes={visibleDishes}
            allDishes={dishes}
            categoryFilter={categoryFilter}
            letterFilter={letterFilter}
            onCategoryChange={setCategoryFilter}
            onLetterChange={setLetterFilter}
            onAddDish={addDish}
            disabled={!canEditOrder || busy === "items"}
          />

          <OrderPanel
            order={order}
            session={session}
            items={visibleItems}
            showMenu={showMenu}
            menuMode={menuMode}
            canEditOrder={canEditOrder}
            canSendKitchen={canSendKitchen}
            canMarkServed={canMarkServed}
            kitchenEnabled={KITCHEN_ENABLED}
            drinksOnly={drinksOnly}
            isReady={isReady}
            isServed={isServed}
            canRequestPayment={canRequestPayment}
            waitingKitchen={waitingKitchen}
            orderStatus={orderStatus}
            busy={busy}
            onQuantityChange={changeQuantity}
            onSendKitchen={sendToKitchen}
            onMarkServed={markServed}
            onCompleteOrder={() => {
              setMenuMode(true);
              setMessage("Ajoutez les plats demandés par le client sur la même facture.");
            }}
            onCloseForBill={closeOrderForBill}
            onRequestPayment={() => setPaymentOrder(order)}
            onShowMenu={() => setMenuMode(true)}
            onHideMenu={() => setMenuMode(false)}
          />
        </div>
      )}

      {paymentOrder && (
        <PaymentRequestModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onDone={(text) => {
            setPaymentOrder(null);
            setMessage(text);
            loadOrder(session?.orderId);
          }}
        />
      )}
    </section>
  );
}

function StepBar({ current }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.key}
            className={`rounded-lg border px-3 py-2 text-center text-xs font-black ${
              active
                ? "border-[var(--dashboard-primary)] bg-[color-mix(in_srgb,var(--dashboard-primary)_10%,white)] text-[var(--dashboard-primary)]"
                : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wide">{index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

function MenuPanel({
  hidden,
  categories,
  dishes,
  allDishes,
  categoryFilter,
  letterFilter,
  onCategoryChange,
  onLetterChange,
  onAddDish,
  disabled,
}) {
  if (hidden) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
        <DashboardIcon name="UtensilsCrossed" size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-500">
          Le menu est masqué. Cliquez sur « Compléter la commande » pour ajouter des plats.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">Menu</h2>
          <p className="text-xs font-semibold text-slate-500">Sélectionnez les plats et les quantités</p>
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
        >
          <option value="ALL">Toutes les catégories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 border-b border-slate-100 pb-3">
        <AlphabetFilter value={letterFilter} onChange={onLetterChange} items={allDishes} />
      </div>

      <div className="mt-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
        {dishes.length === 0 && (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucun plat pour cette lettre.</p>
        )}
        {dishes.map((dish) => (
          <div
            key={dish.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{dish.name}</p>
              <p className="text-xs font-semibold text-slate-500">{money(dish.price)}</p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddDish(dish)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-primary)] text-white disabled:opacity-50"
            >
              <DashboardIcon name="Plus" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerActiveOrdersBar({ orders, currentOrderId, onSelect, onNewOrder }) {
  if (!orders?.length) return null;

  const toneClass = {
    ready: "border-emerald-300 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-400",
    served: "border-sky-200 bg-sky-50 text-sky-900",
    kitchen: "border-amber-200 bg-amber-50 text-amber-900",
    bill: "border-violet-200 bg-violet-50 text-violet-900",
    default: "border-slate-200 bg-white text-slate-800",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-slate-500">Mes commandes en cours</p>
          <p className="text-xs font-semibold text-slate-500">
            {orders.length} commande(s) active(s) — touchez une carte pour la gérer
          </p>
        </div>
        <button type="button" onClick={onNewOrder} className="lte-btn lte-btn-primary lte-btn-sm">
          <DashboardIcon name="Plus" size={15} />
          Nouvelle table
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {orders.map((orderRow) => {
          const selected = String(orderRow.id) === String(currentOrderId);
          const badge = orderStatusBadge(orderRow);
          const tableLabel = orderRow.table_name || orderRow.tableName || "Table";
          return (
            <button
              key={orderRow.id}
              type="button"
              onClick={() => onSelect(orderRow)}
              className={`min-w-[170px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                selected
                  ? "border-[var(--dashboard-primary)] bg-[#fff4ed] ring-2 ring-[var(--dashboard-primary)]/30"
                  : toneClass[badge.tone] || toneClass.default
              }`}
            >
              <p className="text-sm font-black">{tableLabel}</p>
              <p className="text-xs font-semibold opacity-80">{orderRow.order_number || `#${String(orderRow.id).slice(0, 8)}`}</p>
              <p className="mt-1 text-[11px] font-black uppercase">{badge.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ServerDailyStats({ stats, name, onExport, onWhatsApp }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase text-slate-500">Vos ventes du jour{name ? ` · ${name}` : ""}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onExport} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700">
            Exporter
          </button>
          <button type="button" onClick={onWhatsApp} className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white">
            WhatsApp
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <StatChip label="Commandes" value={stats.orders} />
        <StatChip label="Clients servis" value={stats.clients} />
        <StatChip label="Encaissées" value={stats.paid} />
        <StatChip label="Total du jour" value={money(stats.sales)} highlight />
      </div>
      {stats.recent.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-black uppercase text-slate-500">Dernières commandes</p>
          <div className="mt-2 space-y-2">
            {stats.recent.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-bold text-slate-800">{item.order_number}</span>
                <span className="font-semibold text-slate-500">{normalizeStatus(item.status)}</span>
                <span className="font-black text-slate-900">{money(item.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, highlight = false }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${highlight ? "text-[var(--dashboard-primary)]" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function OrderPanel({
  order,
  session,
  items,
  showMenu,
  menuMode,
  canEditOrder,
  canSendKitchen,
  canMarkServed = false,
  kitchenEnabled = true,
  drinksOnly = false,
  isReady,
  isServed,
  canRequestPayment,
  waitingKitchen,
  orderStatus,
  busy,
  onQuantityChange,
  onSendKitchen,
  onMarkServed,
  onCompleteOrder,
  onCloseForBill,
  onRequestPayment,
  onShowMenu,
  onHideMenu,
}) {
  const subtotal = items.reduce((total, item) => total + Number(item.line_total || 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-xs font-black uppercase text-slate-500">Récapitulatif</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">
          {order?.order_number ? `Commande ${order.order_number}` : "Chargement…"}
        </h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Table {session.tableName} · {orderStatus || "…"}
          {order?.is_closed ? " · Clôturée" : " · Ouverte"}
          {drinksOnly ? " · Boissons" : ""}
        </p>
      </div>

      {waitingKitchen && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <p>En attente de la cuisine…</p>
          {orderKitchenTimingLabel(order) && (
            <p className="mt-1 font-black text-amber-950">{orderKitchenTimingLabel(order)}</p>
          )}
        </div>
      )}

      {!kitchenEnabled && ["Acceptée", "En préparation"].includes(orderStatus) && !isServed && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
          Commande confirmée : servez le client à table, puis marquez « servie » et demandez le paiement à la caisse.
        </p>
      )}

      {drinksOnly && canEditOrder && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
          Commande boissons uniquement : le paiement sera demandé directement à la caisse (pas de cuisine).
        </p>
      )}

      {(isReady || isServed) && canRequestPayment && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {drinksOnly || (isReady && order?.is_closed)
            ? "Boissons confirmées : demandez le paiement à la caisse maintenant."
            : isServed
              ? "Client servi : vous pouvez demander le paiement à la caisse."
              : "Plats prêts : servez le client puis demandez le paiement."}
        </p>
      )}

      <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto">
        {items.length === 0 && (
          <p className="py-6 text-center text-sm font-semibold text-slate-500">
            Aucun plat pour le moment. Ajoutez depuis le menu.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id || item.menu_item_id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
              <p className="text-xs font-semibold text-slate-500">
                {money(item.unit_price)} × {item.quantity}
              </p>
            </div>
            {canEditOrder && showMenu ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onQuantityChange(item.menu_item_id, Number(item.quantity || 1) - 1)} className="h-8 w-8 rounded border border-slate-200 text-sm font-black">-</button>
                <span className="w-6 text-center text-sm font-black">{item.quantity}</span>
                <button type="button" onClick={() => onQuantityChange(item.menu_item_id, Number(item.quantity || 0) + 1)} className="h-8 w-8 rounded border border-slate-200 text-sm font-black">+</button>
              </div>
            ) : (
              <strong className="text-sm font-black text-slate-900">{money(item.line_total)}</strong>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
          <span>Sous-total</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="text-sm font-black text-slate-900">Total</span>
          <span className="text-xl font-black text-[var(--dashboard-primary)]">
            {money(order?.total_amount ?? subtotal)}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {canEditOrder && showMenu && canSendKitchen && (
          <button
            type="button"
            onClick={onSendKitchen}
            disabled={busy === "kitchen" || items.length === 0}
            className="lte-btn lte-btn-primary w-full"
          >
            <DashboardIcon name={drinksOnly ? "Wallet" : "ChefHat"} size={16} />
            {busy === "kitchen"
              ? "Confirmation…"
              : drinksOnly
                ? "Confirmer et demander le paiement"
                : kitchenEnabled
                  ? "Envoyer en cuisine"
                  : "Confirmer la commande"}
          </button>
        )}

        {canEditOrder && !showMenu && (
          <button type="button" onClick={onShowMenu} className="lte-btn lte-btn-default w-full">
            <DashboardIcon name="Plus" size={16} />
            Compléter la commande
          </button>
        )}

        {canEditOrder && showMenu && !menuMode && (
          <button type="button" onClick={onHideMenu} className="lte-btn lte-btn-default w-full">
            Masquer le menu
          </button>
        )}

        {canMarkServed && (
          <button type="button" onClick={onMarkServed} disabled={busy === "served"} className="lte-btn lte-btn-default w-full">
            <DashboardIcon name="CheckCircle2" size={16} />
            {busy === "served" ? "Validation…" : "Marquer comme servie"}
          </button>
        )}

        {canRequestPayment && (
          <button type="button" onClick={onRequestPayment} className="lte-btn lte-btn-primary w-full">
            <DashboardIcon name="Wallet" size={16} />
            Demander le paiement (caisse)
          </button>
        )}

        {(isServed || isReady || drinksOnly || (!kitchenEnabled && ["Acceptée", "En préparation"].includes(orderStatus))) && canEditOrder && (
          <button type="button" onClick={onCompleteOrder} className="lte-btn lte-btn-default w-full">
            <DashboardIcon name="UtensilsCrossed" size={16} />
            Compléter la commande
          </button>
        )}

        {canEditOrder && !order?.is_closed && (isServed || isReady || drinksOnly || (!kitchenEnabled && ["Acceptée", "En préparation"].includes(orderStatus))) && (
          <button
            type="button"
            onClick={onCloseForBill}
            disabled={busy === "close"}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-black text-slate-700"
          >
            {busy === "close" ? "Clôture…" : "Verrouiller la commande (plus d'ajout)"}
          </button>
        )}
      </div>
    </div>
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
          <h2 className="lte-card-title">
            <DashboardIcon name="Wallet" size={17} /> Demander le paiement
          </h2>
          <div className="lte-card-tools">
            <button type="button" onClick={onClose} className="lte-tool-btn">
              <DashboardIcon name="X" size={14} />
            </button>
          </div>
        </div>
        <div className="lte-card-body space-y-4">
          <p className="text-sm font-semibold text-slate-600">
            Commande <strong>{order.order_number}</strong> · {money(order.total_amount)}
          </p>
          <div>
            <span className="lte-label">Mode de paiement choisi par le client</span>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMethod(item.value)}
                  className={`rounded border px-2 py-2 text-xs font-semibold transition ${
                    method === item.value
                      ? "border-[var(--dashboard-primary)] bg-[color-mix(in_srgb,var(--dashboard-primary)_10%,white)] text-[var(--dashboard-primary)]"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {isMobile && (
            <label className="lte-form-group">
              <span className="lte-label">
                Numéro {method === "ORANGE" ? "Orange" : "MTN"} du client <span className="req">*</span>
              </span>
              <input
                type="tel"
                value={msisdn}
                onChange={(event) => setMsisdn(event.target.value)}
                placeholder="6XX XXX XXX"
                className="form-control"
                autoFocus
              />
            </label>
          )}
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        </div>
        <div className="lte-card-footer">
          <button type="button" onClick={onClose} className="lte-btn lte-btn-default">
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={submitting} className="ml-auto lte-btn lte-btn-primary">
            {submitting ? "Envoi…" : "Envoyer à la caisse"}
          </button>
        </div>
      </div>
    </div>
  );
}
