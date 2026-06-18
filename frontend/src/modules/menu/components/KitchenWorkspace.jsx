import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
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
    <section className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[var(--dashboard-primary)]">Cuisine</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              {screen === "production" ? "Production du jour" : "Carte & plats"}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Bonjour {currentUser?.first_name ?? "équipe"} — recevez, préparez, signalez « prêt à servir ».
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>
      )}

      {screen === "catalog" ? (
        <div className="space-y-6">
          <CategoriesPage restaurantId={restaurantId} role={role} />
          <DishesPage restaurantId={restaurantId} role={role} />
        </div>
      ) : (
        <>
          {monthStats && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase text-slate-500">
                Plats préparés ce mois ({monthStats.month})
              </p>
              <p className="mt-2 text-3xl font-black text-[var(--dashboard-primary)]">{monthStats.total_dishes}</p>
              {monthStats.top_items?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {monthStats.top_items.map((item) => (
                    <span
                      key={item.name}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                    >
                      {item.name} · {item.quantity}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-sm font-semibold text-slate-500">Chargement des commandes cuisine…</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {COLUMNS.map((column) => {
                const items = tickets.filter((ticket) => ticket.status === column.key);
                return (
                  <div key={column.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-black text-slate-950">{column.title}</h2>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${column.tone}`}>{items.length}</span>
                    </div>
                    <div className="space-y-3">
                      {items.map((ticket) => (
                        <article key={ticket.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-bold text-slate-500">Table {ticket.table_number}</p>
                          <p className="mt-1 text-sm font-black text-slate-900">
                            {ticket.quantity}× {ticket.item_name}
                          </p>
                          {ticket.notes && (
                            <p className="mt-2 rounded bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                              {ticket.notes}
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={busyId === String(ticket.id)}
                            onClick={() => advanceTicket(ticket, column.next)}
                            className="mt-3 w-full lte-btn lte-btn-primary lte-btn-sm"
                          >
                            {busyId === String(ticket.id) ? "…" : column.action}
                          </button>
                        </article>
                      ))}
                      {!items.length && (
                        <p className="py-8 text-center text-sm font-semibold text-slate-400">Rien pour le moment.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
            Les boissons bar (vin, whisky, sodas…) ne passent pas ici — seulement les plats et boissons à préparer en
            cuisine (ex. jus naturel). C’est configurable dans « Catégories & plats ».
          </p>
        </>
      )}
    </section>
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
