import { useEffect, useMemo, useState } from "react";

import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  Panel,
  SimpleRows,
} from "../DashboardPrimitives";
import { orderApi } from "@/modules/orders/services/orderApi";
import { tableApi } from "@/modules/menu/services/tableApi";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { apiFetch } from "@/config/http";

function isToday(value) {
  if (!value) return false;
  return new Date(value).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function ManagerDashboard({ overrides = {} }) {
  const apiBaseUrl = overrides.__apiBaseUrl;
  const currentUser = overrides.__currentUser;
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadDashboard();
  }, [apiBaseUrl, currentUser?.restaurant_id]);

  useAutoRefresh(() => loadDashboard({ silent: true }), 15000, [apiBaseUrl, currentUser?.restaurant_id]);

  async function loadDashboard({ silent = false } = {}) {
    if (!currentUser?.restaurant_id) return;
    if (!silent) setMessage("");
    try {
      const [orderData, tableData, userData] = await Promise.all([
        orderApi.list().catch(() => []),
        tableApi.getTables(currentUser.restaurant_id).catch(() => []),
        fetchUsers().catch(() => []),
      ]);
      setOrders(orderData);
      setTables(tableData);
      setUsers(userData);
    } catch (error) {
      if (!silent) setMessage(error.message || "Impossible de charger le tableau de bord manager.");
    }
  }

  async function fetchUsers() {
    return apiFetch("/api/v1/users", { fallback: "Impossible de charger les utilisateurs." });
  }

  const todayOrders = useMemo(() => orders.filter((order) => isToday(order.created_at)), [orders]);
  const occupiedTables = tables.filter((table) => table.status === "Occupée").length;
  const readyOrders = orders.filter((order) => order.status === "Prête").length;
  const activeUsers = users.filter((user) => user.is_active).length;

  const kpis = [
    { label: "Commandes du jour", value: todayOrders.length, trend: "Données réelles", icon: "ClipboardList", tone: "pink" },
    { label: "Tables occupées", value: occupiedTables, trend: `${tables.length} table(s)`, icon: "Table2", tone: "blue" },
    { label: "Équipe active", value: activeUsers, trend: `${users.length} compte(s)`, icon: "Users", tone: "green" },
    { label: "Commandes prêtes", value: readyOrders, trend: "À servir / encaisser", icon: "TrendingUp", tone: "purple" },
  ];

  const activityRows = [
    ["Service", `${todayOrders.length} commande(s)`, todayOrders.length ? "Actif" : "Calme"],
    ["Cuisine", `${orders.filter((order) => order.status === "En préparation").length} en préparation`, "Suivi"],
    ["Caisse", `${orders.filter((order) => order.status === "Prête" || order.status === "Livrée").length} à encaisser`, "À traiter"],
    ["Stock", "Voir alertes stock", "Module stock"],
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Tableau de bord manager"
        subtitle="Vue opérationnelle construite avec les commandes, tables et comptes du restaurant."
      />
      {message && <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">{message}</div>}
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Priorités opérationnelles" link="Données réelles">
          <SimpleRows rows={activityRows} />
        </Panel>
        <Panel title="Répartition des activités" action="Aujourd'hui">
          <div className="grid gap-6 md:grid-cols-[180px_1fr]">
            <DonutChart total={String(todayOrders.length + occupiedTables + readyOrders)} label="Actions" segments={["#f04438", "#2f80ed", "#31b86f", "#ff9b21"]} />
            <Legend
              items={[
                ["Commandes", String(todayOrders.length), "bg-[#f04438]"],
                ["Tables occupées", String(occupiedTables), "bg-[#2f80ed]"],
                ["Prêtes", String(readyOrders), "bg-[#31b86f]"],
                ["Équipe active", String(activeUsers), "bg-[#ff9b21]"],
              ]}
            />
          </div>
        </Panel>
      </div>
      <Panel title="Suivi d'équipe">
        <SimpleRows
          rows={users.length ? users.slice(0, 5).map((user) => [
            `${user.first_name} ${user.last_name}`,
            user.role,
            user.is_active ? "Actif" : "Désactivé",
          ]) : [["Aucun compte", "-", "À configurer"]]}
        />
      </Panel>
    </section>
  );
}
