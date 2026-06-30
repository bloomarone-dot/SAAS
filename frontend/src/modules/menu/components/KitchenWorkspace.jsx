import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { DashboardSection, ErrorState, LoadingState, PageContainer, PageHeader, StatCard } from "@/modules/admin/components/AdminUi";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import CategoriesPage from "../pages/CategoriesPage";
import DishesPage from "../pages/DishesPage";
import { kitchenApi } from "../services/kitchenApi";

const COLUMNS = [
  {
    key: "En attente",
    title: "Nouvelles commandes",
    action: "Préparation",
    next: "En préparation",
    tone: "border-orange-200 bg-orange-50 text-orange-800",
  },
  {
    key: "En préparation",
    title: "En préparation",
    action: "Prêt à servir",
    next: "Prête",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
  },
  {
    key: "Prête",
    title: "Prêtes à servir",
    action: "Servi en salle",
    next: "Servie",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
];

export default function KitchenWorkspace({ restaurantId, currentUser, role = "CUISINE" }) {
  const [screen, setScreen] = useState("production");
  const [tickets, setTickets] = useState([]);
  const [monthStats, setMonthStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadTickets = useCallback(async () => {
    try {
      setTickets(await kitchenApi.getActiveTickets());
      setError("");
    } catch (err) {
      setError(err.message || "Impossible de charger la cuisine.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setMonthStats(await kitchenApi.getMonthStats());
    } catch {
      setMonthStats(null);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    loadStats();
  }, [loadTickets, loadStats]);

  useAutoRefresh(loadTickets, 5000, [loadTickets]);

  const pendingCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "En attente").length,
    [tickets]
  );
  const preparingCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "En préparation").length,
    [tickets]
  );
  const readyCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "Prête").length,
    [tickets]
  );

  async function advanceTicket(ticket, nextStatus) {
    setBusyId(String(ticket.id));
    setError("");
    try {
      await kitchenApi.updateTicketStatus(ticket.id, nextStatus);
      await Promise.all([loadTickets(), loadStats()]);
    } catch (err) {
      setError(err.message || "Mise à jour impossible.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Cuisine"
        title={screen === "production" ? "Production du jour" : "Carte & plats"}
        subtitle={screen === "production" ? `Suivez les tickets à préparer${currentUser?.first_name ? `, ${currentUser.first_name}` : ""} et faites avancer chaque commande.` : "Gérez les catégories et les plats disponibles pour la cuisine."}
        secondaryActions={
          <>
            <TabButton active={screen === "production"} onClick={() => setScreen("production")} icon="ChefHat">
              Production
              {pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-black text-white">
                  {pendingCount}
                </span>
              )}
            </TabButton>
            <TabButton active={screen === "catalog"} onClick={() => setScreen("catalog")} icon="UtensilsCrossed">
              Catégories & plats
            </TabButton>
          </>
        }
        meta={[
          <span key="pending">{pendingCount.toLocaleString("fr-FR")} nouvelle(s)</span>,
          <span key="preparing">{preparingCount.toLocaleString("fr-FR")} en préparation</span>,
          <span key="ready">{readyCount.toLocaleString("fr-FR")} prête(s)</span>,
        ]}
      />

      {error && <ErrorState title="Cuisine indisponible" text={error} />}

      {screen === "catalog" ? (
        <div className="space-y-6">
          <CategoriesPage restaurantId={restaurantId} role={role} />
          <DishesPage restaurantId={restaurantId} role={role} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Nouvelles commandes" value={pendingCount.toLocaleString("fr-FR")} trend="À lancer" icon="ChefHat" tone={pendingCount ? "warning" : "success"} />
            <StatCard label="En préparation" value={preparingCount.toLocaleString("fr-FR")} trend="En cours" icon="Clock3" tone="info" />
            <StatCard label="Prêtes" value={readyCount.toLocaleString("fr-FR")} trend="À servir" icon="CheckCircle2" tone="success" />
            <StatCard label="Plats ce mois" value={Number(monthStats?.total_dishes || 0).toLocaleString("fr-FR")} trend={monthStats?.month || "Mois courant"} icon="UtensilsCrossed" tone="default" />
          </div>

          {monthStats?.top_items?.length > 0 && (
            <DashboardSection title="Plats les plus préparés" description={`Synthèse du mois ${monthStats.month}`}>
              <div className="flex flex-wrap gap-2">
                {monthStats.top_items.slice(0, 8).map((item) => (
                  <span
                    key={item.name}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                  >
                    {item.name} · {item.quantity}
                  </span>
                ))}
              </div>
            </DashboardSection>
          )}

          {loading ? (
            <LoadingState label="Chargement des commandes cuisine..." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {COLUMNS.map((column) => {
                const items = tickets.filter((ticket) => ticket.status === column.key);
                return (
                  <DashboardSection
                    key={column.key}
                    title={column.title}
                    action={<span className={`rounded-full px-3 py-1 text-xs font-black ${column.tone}`}>{items.length}</span>}
                  >
                    <div className="space-y-3">
                      {items.map((ticket) => (
                        <KitchenTicket
                          key={ticket.id}
                          ticket={ticket}
                          action={column.action}
                          isBusy={busyId === String(ticket.id)}
                          onAdvance={() => advanceTicket(ticket, column.next)}
                        />
                      ))}
                      {!items.length && (
                        <EmptyKitchenColumn />
                      )}
                    </div>
                  </DashboardSection>
                );
              })}
            </div>
          )}

          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-sm">
            Les boissons bar (vin, whisky, sodas…) ne passent pas ici — seulement les plats et boissons à préparer en
            cuisine (ex. jus naturel). C’est configurable dans « Catégories & plats ».
          </p>
        </>
      )}
    </PageContainer>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-black ${
        active
          ? "bg-[var(--dashboard-primary)] text-white"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <DashboardIcon name={icon} size={16} />
      {children}
    </button>
  );
}

function KitchenTicket({ ticket, action, isBusy, onAdvance }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">Table {ticket.table_number}</p>
          <p className="mt-1 text-sm font-black text-slate-900">
            {ticket.quantity}x {ticket.item_name}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-500">
          #{String(ticket.id).slice(0, 6)}
        </span>
      </div>
      {ticket.notes && (
        <p className="mt-3 rounded border border-amber-100 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800">
          {ticket.notes}
        </p>
      )}
      <button
        type="button"
        disabled={isBusy}
        onClick={onAdvance}
        className="mt-3 w-full lte-btn lte-btn-primary lte-btn-sm"
      >
        {isBusy ? "..." : action}
      </button>
    </article>
  );
}

function EmptyKitchenColumn() {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <DashboardIcon name="CheckCircle2" size={22} className="mx-auto text-slate-300" />
      <p className="mt-2 text-sm font-semibold text-slate-400">Rien pour le moment.</p>
    </div>
  );
}
