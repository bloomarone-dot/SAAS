import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";
import { DashboardSection, ErrorState, PageContainer, PageHeader, StatCard } from "@/modules/admin/components/AdminUi";
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
    { label: "Commandes du jour", value: todayOrders.length, trend: "Données réelles", icon: "ClipboardList", tone: "success" },
    { label: "Tables occupées", value: occupiedTables, trend: `${tables.length} table(s)`, icon: "Table2", tone: "info" },
    { label: "Équipe active", value: activeUsers, trend: `${users.length} compte(s)`, icon: "Users", tone: "default" },
    { label: "Commandes prêtes", value: readyOrders, trend: "À servir / encaisser", icon: "TrendingUp", tone: readyOrders ? "warning" : "success" },
  ];

  const activityRows = [
    { icon: "ClipboardList", label: "Service", value: `${todayOrders.length} commande(s)`, status: todayOrders.length ? "Actif" : "Calme" },
    { icon: "ChefHat", label: "Cuisine", value: `${orders.filter((order) => order.status === "En préparation").length} en préparation`, status: "Suivi" },
    { icon: "Wallet", label: "Caisse", value: `${orders.filter((order) => order.status === "Prête" || order.status === "Livrée").length} à encaisser`, status: "À traiter" },
    { icon: "Package", label: "Stock", value: "Voir alertes stock", status: "Module stock" },
  ];
  const teamRows = users.length ? users.slice(0, 6).map((user) => ({
    name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Utilisateur",
    role: user.role,
    active: user.is_active,
  })) : [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Manager"
        title="Tableau de bord manager"
        subtitle="Pilotez le service avec une vue courte sur les commandes, les tables, la cuisine et l'équipe."
        meta={[
          <span key="orders">{orders.length.toLocaleString("fr-FR")} commande(s)</span>,
          <span key="tables">{tables.length.toLocaleString("fr-FR")} table(s)</span>,
          <span key="team">{users.length.toLocaleString("fr-FR")} compte(s)</span>,
        ]}
      />

      {message && <ErrorState title="Tableau de bord manager indisponible" text={message} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardSection title="Priorités opérationnelles" description="Les points à surveiller pendant le service.">
          <OperationalRows rows={activityRows} />
        </DashboardSection>
        <DashboardSection title="État du service" description="Vue rapide par zone.">
          <ServiceSnapshot
            rows={[
              ["Commandes", todayOrders.length, "ClipboardList"],
              ["Tables occupées", occupiedTables, "Table2"],
              ["Prêtes", readyOrders, "CheckCircle2"],
              ["Équipe active", activeUsers, "Users"],
            ]}
          />
        </DashboardSection>
      </div>

      <DashboardSection title="Suivi d'équipe" description="Comptes actifs et rôles opérationnels.">
        <TeamRows rows={teamRows} />
      </DashboardSection>
    </PageContainer>
  );
}

function OperationalRows({ rows }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
              <DashboardIcon name={row.icon} size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{row.label}</p>
              <p className="truncate text-xs font-semibold text-slate-500">{row.value}</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{row.status}</span>
        </div>
      ))}
    </div>
  );
}

function ServiceSnapshot({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row[1] || 0)), 1);
  return (
    <div className="space-y-4">
      {rows.map(([label, value, icon]) => (
        <div key={label}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-bold text-slate-700">
              <DashboardIcon name={icon} size={16} className="text-slate-400" />
              {label}
            </span>
            <span className="font-black text-slate-950">{Number(value || 0).toLocaleString("fr-FR")}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[var(--dashboard-primary)]" style={{ width: `${Math.max(8, (Number(value || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamRows({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-400">
        Aucun compte à afficher.
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={`${row.name}-${row.role}`} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">{row.name}</p>
            <p className="truncate text-xs font-semibold text-slate-500">{row.role}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {row.active ? "Actif" : "Désactivé"}
          </span>
        </div>
      ))}
    </div>
  );
}
