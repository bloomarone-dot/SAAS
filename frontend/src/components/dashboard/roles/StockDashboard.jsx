import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { apiFetch } from "@/config/http";
import { DashboardSection, ErrorState, LoadingState, PageContainer, PageHeader, SecondaryAction } from "@/modules/admin/components/AdminUi";

const locationLabels = {
  MAGASIN: "Magasin",
  CUISINE: "Cuisine",
  BOISSON: "Boisson",
};

const movementLabels = {
  IN: "Entrée",
  ENTRY: "Entrée",
  DIRECT_ENTRY: "Entrée directe",
  OUT: "Sortie",
  OUTPUT: "Sortie",
  LOSS: "Avarie",
  TRANSFER: "Transfert",
  ADJUSTMENT: "Inventaire",
  INVENTORY_PLUS: "Inventaire",
  INVENTORY_MINUS: "Inventaire",
};

const typeLabels = {
  INGREDIENT: "Ingrédients",
  BOISSON: "Boissons",
};

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function quantity(item) {
  if (item?.current_stock !== undefined) return Number(item.current_stock || 0);
  return Number(item?.quantity || 0) + Number(item?.kitchen_quantity || 0) + Number(item?.drink_quantity || 0);
}

function unitLabel(item) {
  return item?.unit_symbol || item?.unit_name || item?.unit || "";
}

function unitCost(item) {
  return Number(item?.cmup || item?.purchase_price || 0);
}

function minimumStock(item) {
  return Number(item?.minimum_stock ?? item?.alert_threshold ?? 0);
}

function movementProductId(movement) {
  return movement?.product_id || movement?.item_id;
}

function movementType(movement) {
  return movement?.movement_type || movement?.type;
}

function isEntryMovement(movement) {
  return ["IN", "ENTRY", "DIRECT_ENTRY", "INVENTORY_PLUS"].includes(movementType(movement));
}

function isOutputMovement(movement) {
  return ["OUT", "OUTPUT", "LOSS", "TRANSFER", "INVENTORY_MINUS"].includes(movementType(movement));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StockDashboard({ variant = "accounting", overrides = {}, onNavigate }) {
  const apiBaseUrl = overrides.__apiBaseUrl;
  const isStockView = variant === "stock";
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [damages, setDamages] = useState([]);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!apiBaseUrl) return;
    loadDashboard();
  }, [apiBaseUrl]);

  useAutoRefresh(() => loadDashboard({ silent: true }), 30000, [apiBaseUrl]);

  async function api(path) {
    return apiFetch(path, { fallback: "Chargement du stock impossible." });
  }

  async function loadDashboard({ silent = false } = {}) {
    if (!silent) {
      setIsLoading(true);
      setMessage("");
    }
    const resources = await Promise.allSettled([
      api("/api/v1/stock/summary"),
      api("/api/v1/stock/products"),
      api("/api/v1/stock/movements"),
      api("/api/v1/stock/damages"),
      api("/api/v1/stock/reports"),
    ]);
    const [summaryResult, itemResult, movementResult, damageResult, reportResult] = resources;
    if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
    if (itemResult.status === "fulfilled") setItems(Array.isArray(itemResult.value) ? itemResult.value : []);
    if (movementResult.status === "fulfilled") setMovements(Array.isArray(movementResult.value) ? movementResult.value : []);
    if (damageResult.status === "fulfilled") setDamages(Array.isArray(damageResult.value) ? damageResult.value : []);
    if (reportResult.status === "fulfilled") setReport(reportResult.value);

    const criticalFailed = summaryResult.status === "rejected" && itemResult.status === "rejected";
    if (!silent && criticalFailed) {
      setMessage(summaryResult.reason?.message || itemResult.reason?.message || "Chargement du stock impossible.");
    }
    if (!silent) setIsLoading(false);
  }

  const todayMovements = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return movements.filter((movement) => String(movement.created_at || "").slice(0, 10) === today);
  }, [movements]);

  const lowStockItems = useMemo(
    () => items.filter((item) => quantity(item) <= minimumStock(item)).sort((a, b) => quantity(a) - quantity(b)),
    [items]
  );

  const stockByType = useMemo(() => {
    return items.reduce((acc, item) => {
      const label = typeLabels[item.product_type] ?? item.product_type ?? "Autres";
      acc[label] = (acc[label] || 0) + quantity(item) * unitCost(item);
      return acc;
    }, {});
  }, [items]);

  const recentMovements = movements.slice(0, 10).map((movement) => {
    const item = items.find((entry) => entry.id === movementProductId(movement));
    const type = movementType(movement);
    const sign = isEntryMovement(movement) ? "+" : ["ADJUSTMENT", "INVENTORY_PLUS", "INVENTORY_MINUS"].includes(type) ? "=" : "-";
    return [
      movementLabels[type] ?? type,
      item?.name ?? "Produit supprimé",
      formatDate(movement.movement_date || movement.created_at),
      `${sign} ${Number(movement.quantity || 0).toLocaleString("fr-FR")} ${unitLabel(item)}`,
      money(movement.total_amount),
    ];
  });

  const lowStockRows = lowStockItems.slice(0, 10).map((item) => [
    item.name,
    `${quantity(item).toLocaleString("fr-FR")} ${unitLabel(item)}`,
    `${minimumStock(item).toLocaleString("fr-FR")} ${unitLabel(item)}`,
    quantity(item) <= minimumStock(item) / 2 ? "Critique" : "Faible",
  ]);

  const damageRows = damages.slice(0, 8).map((damage) => {
    const item = items.find((entry) => entry.id === movementProductId(damage));
    return [
      item?.name ?? "Produit supprimé",
      `${Number(damage.quantity || 0).toLocaleString("fr-FR")} ${unitLabel(item)}`,
      locationLabels[damage.location] ?? damage.reason ?? "Stock",
      damage.status === "VALIDATED" ? "Validé" : "À valider",
    ];
  });

  const categoryRows = Object.entries(stockByType)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => [label, money(value), value > 0 ? "Actif" : "Vide"]);

  const entryTotalToday = todayMovements
    .filter(isEntryMovement)
    .reduce((total, movement) => total + Number(movement.total_amount || Number(movement.quantity || 0) * Number(movement.unit_price || 0)), 0);
  const outputTotalToday = todayMovements
    .filter(isOutputMovement)
    .reduce((total, movement) => total + Number(movement.total_amount || Number(movement.quantity || 0) * Number(movement.unit_price || 0)), 0);

  return (
    <PageContainer>
      <PageHeader
        eyebrow={isStockView ? "Gestion stock" : "Stock & comptabilité"}
        title={isStockView ? "Tableau de bord Stock" : "Tableau de bord Stock & Comptabilité"}
        subtitle={
          isStockView
            ? "Surveillez la valeur du stock, les alertes et les derniers mouvements."
            : "Valorisation du stock, pertes et impact comptable en un coup d'œil."
        }
        primaryAction={
          <SecondaryAction icon="Plus" onClick={() => onNavigate?.("entries")}>
            Nouvelle entrée
          </SecondaryAction>
        }
        secondaryActions={
          <SecondaryAction icon="BarChart3" onClick={() => onNavigate?.("reports")}>
            Mouvements
          </SecondaryAction>
        }
      />

      {message && <ErrorState title="Stock indisponible" text={message} />}

      {isLoading ? (
        <LoadingState label="Chargement du dashboard stock..." />
      ) : (
        <div className="space-y-6">
          {isStockView ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                <MetricCard label="Valeur du stock" value={money(summary?.stock_value)} hint={`${items.length} produit(s) suivis`} icon="Wallet" tone="emerald" />
                <MetricCard label="Stock faible" value={Number(summary?.low_stock_count || 0).toLocaleString("fr-FR")} hint={lowStockItems[0]?.name ?? "Aucune alerte"} icon="AlertTriangle" tone="amber" />
                <MetricCard label="Entrées du jour" value={money(entryTotalToday)} hint={`${todayMovements.filter(isEntryMovement).length} mouvement(s)`} icon="ShoppingCart" tone="sky" />
                <MetricCard label="Sorties du jour" value={money(outputTotalToday)} hint={`${todayMovements.filter(isOutputMovement).length} mouvement(s)`} icon="Package" tone="slate" />
              </div>

              <div className="grid gap-6 2xl:grid-cols-2">
                <DashboardSection title="Produits en alerte" description={`${lowStockItems.length} alerte(s) à traiter`}>
                  <DataTable headers={["Produit", "Stock actuel", "Seuil", "Statut"]} rows={lowStockRows} empty="Aucun produit en stock faible." />
                </DashboardSection>
                <DashboardSection title="Mouvements récents" description="Dernières entrées, sorties et corrections.">
                  <DataTable headers={["Type", "Produit", "Date", "Quantité", "Montant"]} rows={recentMovements} movement empty="Aucun mouvement enregistré." />
                </DashboardSection>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <DashboardSection title="Répartition du stock">
                  <ValueList rows={Object.entries(stockByType).slice(0, 6).map(([label, value]) => [label, money(value), "Valorisé"]) || [["Aucun stock", "0 FCFA", "Vide"]]} />
                </DashboardSection>
                <DashboardSection title="Stock par catégorie">
                  <ValueList rows={categoryRows.length ? categoryRows : [["Aucune catégorie", "0 FCFA", "Vide"]]} />
                </DashboardSection>
                <DashboardSection title="Avaries récentes">
                  <ValueList rows={damageRows.length ? damageRows : [["Aucune avarie", "-", "RAS"]]} />
                </DashboardSection>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <MetricCard label="Valeur d'achat" value={money(summary?.stock_value)} hint="Stock courant" icon="Wallet" tone="emerald" />
                <MetricCard label="Vente estimée" value={money(report?.estimated_sales_value)} hint="Avec taux de marge" icon="TrendingUp" tone="sky" />
                <MetricCard label="Bénéfice estimé" value={money(report?.estimated_profit)} hint="Selon marge appliquée" icon="BarChart3" tone="emerald" />
                <MetricCard label="Entrées période" value={money(report?.entries_value)} hint="Achats enregistrés" icon="ShoppingCart" tone="slate" />
                <MetricCard label="Avaries / pertes" value={money(report?.damage_loss ?? summary?.total_damage_loss)} hint={`${damages.length} avarie(s)`} icon="AlertTriangle" tone="amber" />
              </div>

              <DashboardSection title="Valorisation par emplacement" description="Répartition de la valeur du stock sur les dépôts principaux.">
                <div className="grid gap-4 sm:grid-cols-3">
                  <MetricCard label="Magasin" value={money(summary?.main_stock_value)} hint="Dépôt principal" icon="Box" tone="slate" compact />
                  <MetricCard label="Cuisine" value={money(summary?.kitchen_stock_value)} hint="Production" icon="Utensils" tone="slate" compact />
                  <MetricCard label="Boisson" value={money(summary?.drink_stock_value)} hint="Bar / boissons" icon="Package" tone="slate" compact />
                </div>
              </DashboardSection>

              <div className="grid gap-6 2xl:grid-cols-2">
                <DashboardSection title="Produits en alerte" description="Produits sous le seuil minimum.">
                  <DataTable headers={["Produit", "Stock actuel", "Stock min.", "Statut"]} rows={lowStockRows} empty="Aucune alerte." />
                </DashboardSection>
                <DashboardSection title="Mouvements de stock" description="Dernières opérations validées.">
                  <DataTable headers={["Type", "Produit", "Date", "Quantité", "Montant"]} rows={recentMovements} movement empty="Aucun mouvement enregistré." />
                </DashboardSection>
              </div>

              <DashboardSection title="Avaries récentes" description="Pertes et casse à suivre côté comptabilité.">
                <DataTable headers={["Produit", "Quantité", "Emplacement", "Statut"]} rows={damageRows} empty="Aucune avarie enregistrée." />
              </DashboardSection>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickAction icon="Plus" label="Nouvelle entrée" tone="green" onClick={() => onNavigate?.("entries")} />
            <QuickAction icon="Activity" label="Nouvelle sortie" tone="orange" onClick={() => onNavigate?.("outputs")} />
            <QuickAction icon="FileText" label="Inventaire" tone="amber" onClick={() => onNavigate?.("reports")} />
            <QuickAction icon="BarChart3" label="Mouvements" tone="greenSoft" onClick={() => onNavigate?.("reports")} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function MetricCard({ label, value, hint, icon, tone = "slate", compact = false }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-2 break-words font-black tabular-nums leading-tight text-slate-950 ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}>
            {value}
          </p>
          {hint && <p className="mt-2 text-sm font-semibold text-slate-500">{hint}</p>}
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] ?? tones.slate}`}>
          <DashboardIcon name={icon} size={20} />
        </span>
      </div>
    </div>
  );
}

function DataTable({ headers, rows, movement = false, empty }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="lte-table w-full min-w-full">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap pb-3 text-left">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, index) => (
                <td
                  key={`${rowIndex}-${index}`}
                  className={`py-3 align-top ${
                    index === 0
                      ? "font-black text-slate-800"
                      : index === row.length - 1 && (movement || headers[headers.length - 1] === "Statut")
                        ? ""
                        : "font-semibold tabular-nums text-slate-600"
                  }`}
                >
                  {movement && index === 0 ? <Badge label={cell} /> : index === row.length - 1 && headers[headers.length - 1] === "Statut" ? <Badge label={cell} /> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ label }) {
  const danger = ["Critique", "Sortie", "Périmé", "Faible", "À comptabiliser", "À valider"].includes(label);
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-black ${danger ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
      {label}
    </span>
  );
}

function ValueList({ rows }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row, index) => (
        <div key={`${row[0]}-${index}`} className="flex items-center justify-between gap-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800">{row[0]}</p>
            <p className="text-xs font-semibold text-slate-400">{row[2]}</p>
          </div>
          <span className="shrink-0 text-right font-black tabular-nums text-slate-900">{row[1]}</span>
        </div>
      ))}
    </div>
  );
}

function QuickAction({ icon, label, tone, onClick }) {
  const colors = {
    green: "bg-emerald-600 text-white hover:bg-emerald-700",
    orange: "bg-orange-500 text-white hover:bg-orange-600",
    amber: "bg-amber-50 text-amber-800 hover:bg-amber-100",
    greenSoft: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    red: "bg-red-50 text-red-600 hover:bg-red-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 w-full items-center justify-center gap-3 rounded-xl px-4 text-sm font-black shadow-sm transition ${colors[tone]}`}
    >
      <DashboardIcon name={icon} size={18} />
      {label}
    </button>
  );
}
