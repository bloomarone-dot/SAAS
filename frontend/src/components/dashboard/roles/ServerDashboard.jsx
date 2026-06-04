import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";
import { DashboardHeader, KpiGrid, Panel, SimpleRows } from "../DashboardPrimitives";
import TableGrid from "@/modules/menu/components/TableGrid";
import TableSessionModal from "@/modules/menu/components/TableSessionModal";
import { kitchenApi } from "@/modules/menu/services/kitchenApi";
import { menuApi } from "@/modules/menu/services/menuApi";
import { tableApi } from "@/modules/menu/services/tableApi";
import { orderApi } from "@/modules/orders/services/orderApi";

export function ServerDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  const restaurantId = currentUser?.restaurant_id;
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    loadServerData();
  }, [restaurantId]);

  async function loadServerData() {
    const [tableData, orderData] = await Promise.all([
      tableApi.getTables(restaurantId).catch(() => []),
      orderApi.list().catch(() => []),
    ]);
    setTables(tableData);
    setOrders(orderData);

    const categories = await menuApi.getCategories(restaurantId).catch(() => []);
    const dishGroups = await Promise.all(categories.map((category) => menuApi.getDishesByCategory(category.id, false).catch(() => [])));
    setDishes(dishGroups.flat());
  }

  const tableStats = useMemo(() => {
    const occupied = tables.filter((table) => table.status === "Occupée").length;
    const available = tables.filter((table) => table.status === "Libre").length;
    return { occupied, available, total: tables.length };
  }, [tables]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !["Payée", "Payee", "Livrée", "Livree", "Annulée", "Annulee"].includes(order.status)),
    [orders]
  );
  const readyOrders = useMemo(() => orders.filter((order) => order.status === "Prête"), [orders]);

  const kpis = [
    { label: "Tables occupées", value: tableStats.occupied, trend: `Sur ${tableStats.total} tables`, icon: "Users", tone: "green" },
    { label: "Tables disponibles", value: tableStats.available, trend: `Sur ${tableStats.total} tables`, icon: "Table2", tone: "green" },
    { label: "Commandes en cours", value: activeOrders.length, trend: "En service", icon: "Package", tone: "orange" },
    { label: "Commandes prêtes", value: readyOrders.length, trend: "À servir", icon: "CheckCircle2", tone: "orange" },
  ];

  function chooseTable(tableId) {
    setSelectedTableId(tableId);
    const table = tables.find((item) => String(item.id) === String(tableId));
    if (table) setSelectedTable(table);
  }

  function openOrder(orderId, tableName) {
    setActiveOrder({ id: orderId, tableName });
    setMessage(`Commande ouverte pour la table ${tableName}.`);
    loadServerData();
  }

  function addDish(dish) {
    if (!activeOrder) {
      setMessage("Sélectionnez une table et ouvrez une commande avant d'ajouter un plat.");
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === dish.id);
      if (existing) return current.map((item) => item.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...dish, quantity: 1 }];
    });
  }

  async function sendToKitchen() {
    if (!activeOrder || cart.length === 0) {
      setMessage("Aucun plat à envoyer en cuisine.");
      return;
    }
    const items = cart.map((item) => ({ menu_item_id: item.id, quantity: item.quantity }));
    await orderApi.update(activeOrder.id, { status: "En préparation", items });
    await Promise.all(cart.map((item) => kitchenApi.createTicket({
      order_id: activeOrder.id,
      table_number: activeOrder.tableName,
      item_name: item.name,
      quantity: item.quantity,
      notes: "",
    })));
    setCart([]);
    setMessage("Commande envoyée en cuisine.");
    loadServerData();
  }

  async function markServed(order) {
    await orderApi.updateStatus(order.id, "Livrée");
    setMessage(`Commande ${order.order_number} marquée comme servie.`);
    loadServerData();
  }

  async function requestBill() {
    if (!activeOrder) {
      setMessage("Ouvrez une commande avant de demander l'addition.");
      return;
    }
    await orderApi.updateStatus(activeOrder.id, "Prête");
    setMessage("Addition demandée. La caisse peut encaisser cette commande.");
    loadServerData();
  }

  return (
    <section className="space-y-4">
      <DashboardHeader title="Dashboard Serveur" subtitle={`Bienvenue ${currentUser?.first_name ?? ""} ! Voici un aperçu de votre service.`} />
      <KpiGrid kpis={kpis} />
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <TableGrid restaurantId={restaurantId} onSelectTable={setSelectedTable} />
        <Panel title="Nouvelle commande">
          <div className="space-y-3">
            <select value={selectedTableId} onChange={(event) => chooseTable(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600">
              <option value="">Choisir une table...</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name || table.number} · {Number(table.free_seats ?? table.capacity)} place(s) libre(s) / {table.capacity}
                </option>
              ))}
            </select>
            <div className="max-h-[360px] overflow-y-auto">
              {dishes.slice(0, 8).map((dish) => (
                <div key={dish.id} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm">
                  <span className="font-bold text-slate-700">{dish.name}</span>
                  <span className="font-black text-slate-900">{Number(dish.price || 0).toLocaleString("fr-FR")} FCFA</span>
                  <button type="button" onClick={() => addDish(dish)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <DashboardIcon name="Plus" size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-sm font-black text-emerald-800">
              Commande: {activeOrder ? `Table ${activeOrder.tableName}` : "aucune"} · {cart.reduce((total, item) => total + item.quantity, 0)} plat(s)
            </div>
            <button type="button" onClick={sendToKitchen} className="h-11 w-full rounded-lg bg-emerald-700 font-black text-white">Envoyer en cuisine</button>
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.95fr]">
        <Panel title="Commandes en cours" link="Voir tout">
          <SimpleRows rows={(activeOrders.length ? activeOrders : []).slice(0, 5).map((order) => [`Table ${order.table_id ?? "-"}`, order.order_number, order.status])} />
        </Panel>
        <Panel title="Commandes prêtes à servir" link="Voir tout">
          <SimpleRows rows={(readyOrders.length ? readyOrders : []).slice(0, 5).map((order) => [`Table ${order.table_id ?? "-"}`, order.items.map((item) => item.name).join(", ") || order.order_number, order.status])} />
          <button type="button" onClick={() => readyOrders[0] && markServed(readyOrders[0])} className="mt-4 h-11 w-full rounded-lg bg-emerald-600 font-black text-white">Marquer la première comme servie</button>
        </Panel>
        <Panel title="Demander l'addition">
          <button type="button" onClick={requestBill} className="h-11 w-full rounded-lg bg-emerald-700 font-black text-white">Demander l'addition</button>
        </Panel>
      </div>

      {selectedTable && (
        <TableSessionModal
          table={selectedTable}
          currentUser={currentUser}
          onClose={() => setSelectedTable(null)}
          onOpenMenuForOrder={openOrder}
        />
      )}
    </section>
  );
}
