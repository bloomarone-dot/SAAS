import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { apiFetch } from "@/config/http";
import { DashboardSection, ErrorState, LoadingState, PageContainer, PageHeader, SecondaryAction, StatCard } from "@/modules/admin/components/AdminUi";

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

  const recentMovements = movements.slice(0, 7).map((movement) => {
    const item = items.find((entry) => entry.id === movementProductId(movement));
    const type = movementType(movement);
    const sign = isEntryMovement(movement) ? "+" : ["ADJUSTMENT", "INVENTORY_PLUS", "INVENTORY_MINUS"].includes(type) ? "=" : "-";
    return [
      movementLabels[type] ?? type,
      item?.name ?? "Produit supprimé",
      formatDate(movement.movement_date || movement.created_at),
      `${sign} ${Number(movement.quantity || 0).toLocaleString("fr-FR")} ${unitLabel(item)}`,
      String(movement.id || movement.reference || "-").slice(0, 8).toUpperCase(),
    ];
  });

  const lowStockRows = lowStockItems.slice(0, 7).map((item) => [
    item.name,
    `${quantity(item).toLocaleString("fr-FR")} ${unitLabel(item)}`,
    `${minimumStock(item).toLocaleString("fr-FR")} ${unitLabel(item)}`,
    quantity(item) <= minimumStock(item) / 2 ? "Critique" : "Faible",
  ]);

  const damageRows = damages.slice(0, 6).map((damage) => {
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

  return (
    <PageContainer>
      <PageHeader
        eyebrow={isStockView ? "Gestion stock" : "Stock & comptabilité"}
        title={isStockView ? "Tableau de bord Stock" : "Tableau de bord Stock & Comptabilité"}
        subtitle={isStockView ? "Surveillez la valeur du stock, les alertes et les derniers mouvements." : "Suivez la valorisation, les pertes et l’impact comptable du stock."}
        primaryAction={<SecondaryAction icon="Plus" onClick={() => onNavigate?.("entries")}>Nouvelle entrée</SecondaryAction>}
        secondaryActions={<SecondaryAction icon="BarChart3" onClick={() => onNavigate?.("reports")}>Rapports</SecondaryAction>}
      />

      {message && <ErrorState title="Stock indisponible" text={message} />}

      {isLoading ? (
        <LoadingState label="Chargement du dashboard stock..." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Valeur du stock" value={money(summary?.stock_value)} trend={`${items.length} produits suivis`} icon="Wallet" tone="success" />
            <StatCard label="Stock faible" value={Number(summary?.low_stock_count || 0).toLocaleString("fr-FR")} trend={lowStockItems[0]?.name ?? "Aucune alerte"} icon="AlertTriangle" tone={Number(summary?.low_stock_count || 0) ? "warning" : "success"} />
            <StatCard label={isStockView ? "Entrées du jour" : "Pertes avaries"} value={isStockView ? money(todayMovements.filter(isEntryMovement).reduce((total, m) => total + Number(m.total_amount || Number(m.quantity || 0) * Number(m.unit_price || 0)), 0)) : money(summary?.total_damage_loss)} trend={isStockView ? `${todayMovements.filter(isEntryMovement).length} mouvement(s)` : `${damages.length} avarie(s)`} icon={isStockView ? "ShoppingCart" : "AlertTriangle"} tone={isStockView ? "success" : "warning"} />
            <StatCard label={isStockView ? "Sorties du jour" : "Bénéfice estimé"} value={isStockView ? money(todayMovements.filter(isOutputMovement).reduce((total, m) => total + Number(m.total_amount || Number(m.quantity || 0) * Number(m.unit_price || 0)), 0)) : money(report?.estimated_profit)} trend={isStockView ? `${todayMovements.filter(isOutputMovement).length} mouvement(s)` : "Selon taux de marge"} icon={isStockView ? "Package" : "TrendingUp"} tone="info" />
          </div>

          {isStockView ? (
            <StockOnlyContent
              lowStockRows={lowStockRows}
              recentMovements={recentMovements}
              categoryRows={categoryRows}
              damageRows={damageRows}
              stockByType={stockByType}
              summary={summary}
            />
          ) : (
            <AccountingContent
              lowStockRows={lowStockRows}
              recentMovements={recentMovements}
              damageRows={damageRows}
              report={report}
              summary={summary}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickAction icon="Plus" label="Nouvelle entrée" tone="green" onClick={() => onNavigate?.("entries")} />
            <QuickAction icon="Activity" label="Nouvelle sortie" tone="orange" onClick={() => onNavigate?.("outputs")} />
            <QuickAction icon="FileText" label="Inventaire" tone="amber" onClick={() => onNavigate?.("inventories")} />
            <QuickAction icon="BarChart3" label="Rapports" tone="greenSoft" onClick={() => onNavigate?.("reports")} />
          </div>
        </>
      )}
    </PageContainer>
  );
}

function StockOnlyContent({ lowStockRows, recentMovements, categoryRows, damageRows, stockByType, summary }) {
  const legendItems = Object.entries(stockByType).slice(0, 4).map(([label, value], index) => [
    label,
    money(value),
    ["bg-emerald-600", "bg-orange-500", "bg-amber-400", "bg-blue-500"][index] ?? "bg-slate-400",
  ]);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <DashboardSection title="Produits en alerte" description={`${lowStockRows.length} alerte(s) à traiter`}>
          <DataTable headers={["Produit", "Stock actuel", "Seuil d'alerte", "Statut"]} rows={lowStockRows} empty="Aucun produit en stock faible." />
        </DashboardSection>
        <DashboardSection title="Mouvements récents" description="Dernières entrées, sorties et corrections.">
          <DataTable headers={["Type", "Produit", "Date", "Quantité", "Référence"]} rows={recentMovements} movement empty="Aucun mouvement enregistré." />
        </DashboardSection>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardSection title="Répartition du stock">
          <ValueList rows={legendItems.length ? legendItems.map(([label, value]) => [label, value, "Valorisé"]) : [["Aucun stock", "0 FCFA", "Vide"]]} />
        </DashboardSection>
        <DashboardSection title="Stock par catégorie">
          <ValueList rows={categoryRows.length ? categoryRows : [["Aucune catégorie", "0 FCFA", "Vide"]]} />
        </DashboardSection>
        <DashboardSection title="Avaries récentes">
          <ValueList rows={damageRows.length ? damageRows : [["Aucune avarie", "-", "RAS"]]} />
        </DashboardSection>
      </div>
    </>
  );
}

function AccountingContent({ lowStockRows, recentMovements, damageRows, report, summary }) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <DashboardSection title="Résumé comptable stock" description="Valorisation et pertes sur la période récente.">
          <div className="grid gap-3 md:grid-cols-2">
            <StatCard label="Valeur d'achat" value={money(summary?.stock_value)} trend="Stock courant" icon="Wallet" tone="success" />
            <StatCard label="Vente estimée" value={money(report?.estimated_sales_value)} trend="Avec taux de marge" icon="TrendingUp" tone="info" />
            <StatCard label="Entrées" value={money(report?.entries_value)} trend="Achats période" icon="ShoppingCart" tone="success" />
            <StatCard label="Avaries" value={money(report?.damage_loss)} trend="Pertes période" icon="AlertTriangle" tone="warning" />
          </div>
        </DashboardSection>
        <DashboardSection title="Mouvements de stock" description="Dernières opérations validées.">
          <DataTable headers={["Type", "Produit", "Date", "Quantité", "Référence"]} rows={recentMovements} movement empty="Aucun mouvement enregistré." />
        </DashboardSection>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardSection title="Produits en alerte">
          <DataTable headers={["Produit", "Stock actuel", "Stock min.", "Statut"]} rows={lowStockRows} empty="Aucune alerte." />
        </DashboardSection>
        <DashboardSection title="Avaries">
          <ValueList rows={damageRows.length ? damageRows : [["Aucune avarie", "-", "RAS"]]} />
        </DashboardSection>
        <DashboardSection title="Valorisation par emplacement">
          <ValueList rows={[
            ["Magasin", money(summary?.main_stock_value), "Principal"],
            ["Cuisine", money(summary?.kitchen_stock_value), "Production"],
            ["Boisson", money(summary?.drink_stock_value), "Bar"],
          ]} />
        </DashboardSection>
      </div>
    </>
  );
}

function DataTable({ headers, rows, movement = false, empty }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-500">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[560px]">
        <thead>
          <tr>{headers.map((header) => <th key={header} className="pb-3">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell, index) => (
                <td key={`${row[0]}-${index}`} className={`py-3 ${index === 0 ? "font-black text-slate-800" : "font-semibold text-slate-600"}`}>
                  {movement && index === 0 ? <Badge label={cell} /> : index === row.length - 1 ? <Badge label={cell} /> : cell}
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
  const danger = ["Critique", "Sortie", "Périmé", "Faible", "À comptabiliser"].includes(label);
  return <span className={`rounded-md px-2 py-1 text-xs font-black ${danger ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-700"}`}>{label}</span>;
}

function ValueList({ rows }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div key={row.join("-")} className="flex items-center justify-between gap-3 py-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-800">{row[0]}</p>
            <p className="truncate text-xs font-semibold text-slate-400">{row[2]}</p>
          </div>
          <span className="shrink-0 font-black text-slate-900">{row[1]}</span>
        </div>
      ))}
    </div>
  );
}

function QuickAction({ icon, label, tone, onClick }) {
  const colors = {
    green: "bg-emerald-600 text-white",
    orange: "bg-orange-500 text-white",
    amber: "bg-amber-50 text-amber-700",
    greenSoft: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
  };
  return (
    <button type="button" onClick={onClick} className={`flex h-16 items-center justify-center gap-3 rounded-lg px-4 text-sm font-black shadow-sm ${colors[tone]}`}>
      <DashboardIcon name={icon} size={18} />
      {label}
    </button>
  );
}
