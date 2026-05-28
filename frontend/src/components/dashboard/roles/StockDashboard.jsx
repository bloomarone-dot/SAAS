import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";
import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  Panel,
  SimpleRows,
  SummaryCard,
} from "../DashboardPrimitives";

const locationLabels = {
  MAGASIN: "Magasin",
  CUISINE: "Cuisine",
  BOISSON: "Boisson",
};

const movementLabels = {
  IN: "Entrée",
  OUT: "Sortie",
  TRANSFER: "Transfert",
  ADJUSTMENT: "Inventaire",
};

const typeLabels = {
  INGREDIENT: "Ingrédients",
  BOISSON: "Boissons",
};

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function quantity(item) {
  return Number(item?.quantity || 0) + Number(item?.kitchen_quantity || 0) + Number(item?.drink_quantity || 0);
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
  const currentUser = overrides.__currentUser;
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

  async function api(path) {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail ?? "Chargement du stock impossible.");
    return data;
  }

  async function loadDashboard() {
    setIsLoading(true);
    setMessage("");
    try {
      const [summaryData, itemData, movementData, damageData, reportData] = await Promise.all([
        api("/api/v1/stock/summary"),
        api("/api/v1/stock/items"),
        api("/api/v1/stock/movements"),
        api("/api/v1/stock/damages"),
        api("/api/v1/stock/reports"),
      ]);
      setSummary(summaryData);
      setItems(itemData);
      setMovements(movementData);
      setDamages(damageData);
      setReport(reportData);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  const todayMovements = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return movements.filter((movement) => String(movement.created_at || "").slice(0, 10) === today);
  }, [movements]);

  const lowStockItems = useMemo(
    () => items.filter((item) => quantity(item) <= Number(item.alert_threshold || 0)).sort((a, b) => quantity(a) - quantity(b)),
    [items]
  );

  const stockByType = useMemo(() => {
    return items.reduce((acc, item) => {
      const label = typeLabels[item.product_type] ?? item.product_type ?? "Autres";
      acc[label] = (acc[label] || 0) + quantity(item) * Number(item.purchase_price || 0);
      return acc;
    }, {});
  }, [items]);

  const recentMovements = movements.slice(0, 7).map((movement) => {
    const item = items.find((entry) => entry.id === movement.item_id);
    const sign = movement.movement_type === "IN" ? "+" : movement.movement_type === "ADJUSTMENT" ? "=" : "-";
    return [
      movementLabels[movement.movement_type] ?? movement.movement_type,
      item?.name ?? "Produit supprimé",
      formatDate(movement.created_at),
      `${sign} ${Number(movement.quantity || 0).toLocaleString("fr-FR")} ${item?.unit ?? ""}`,
      movement.id.slice(0, 8).toUpperCase(),
    ];
  });

  const lowStockRows = lowStockItems.slice(0, 7).map((item) => [
    item.name,
    `${quantity(item).toLocaleString("fr-FR")} ${item.unit}`,
    `${Number(item.alert_threshold || 0).toLocaleString("fr-FR")} ${item.unit}`,
    quantity(item) <= Number(item.alert_threshold || 0) / 2 ? "Critique" : "Faible",
  ]);

  const damageRows = damages.slice(0, 6).map((damage) => {
    const item = items.find((entry) => entry.id === damage.item_id);
    return [
      item?.name ?? "Produit supprimé",
      `${Number(damage.quantity || 0).toLocaleString("fr-FR")} ${item?.unit ?? ""}`,
      locationLabels[damage.location] ?? damage.location,
      damage.accounted_at ? "Comptabilisé" : "À comptabiliser",
    ];
  });

  const categoryRows = Object.entries(stockByType)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => [label, money(value), value > 0 ? "Actif" : "Vide"]);

  const kpis = isStockView
    ? [
        { label: "Valeur du stock", value: money(summary?.stock_value), trend: `${items.length} produits suivis`, icon: "Wallet", tone: "green" },
        { label: "Produits en stock faible", value: Number(summary?.low_stock_count || 0).toLocaleString("fr-FR"), trend: lowStockItems[0]?.name ?? "Aucune alerte", icon: "AlertTriangle", tone: "orange" },
        { label: "Entrées du jour", value: money(todayMovements.filter((m) => m.movement_type === "IN").reduce((total, m) => total + Number(m.quantity || 0) * Number(m.unit_price || 0), 0)), trend: `${todayMovements.filter((m) => m.movement_type === "IN").length} mouvement(s)`, icon: "ShoppingCart", tone: "green" },
        { label: "Sorties du jour", value: money(todayMovements.filter((m) => ["OUT", "TRANSFER"].includes(m.movement_type)).reduce((total, m) => total + Number(m.quantity || 0) * Number(m.unit_price || 0), 0)), trend: `${todayMovements.filter((m) => ["OUT", "TRANSFER"].includes(m.movement_type)).length} mouvement(s)`, icon: "Package", tone: "orange" },
      ]
    : [
        { label: "Valeur du stock", value: money(summary?.stock_value), trend: "Magasin, cuisine et boissons", icon: "Wallet", tone: "green" },
        { label: "Pertes avaries", value: money(summary?.total_damage_loss), trend: `${damages.length} avarie(s)`, icon: "AlertTriangle", tone: "orange" },
        { label: "Bénéfice estimé", value: money(report?.estimated_profit), trend: "Selon les taux de marge", icon: "Wallet", tone: "green" },
        { label: "Sorties période", value: money(report?.outputs_value), trend: `${report?.movement_count ?? 0} mouvement(s)`, icon: "Package", tone: "orange" },
      ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title={isStockView ? "Dashboard Stock" : "Dashboard Stock & Comptabilité"}
        subtitle={isStockView ? "Vue connectée aux produits, mouvements, seuils et avaries du restaurant." : "Suivi des stocks, marges, pertes et sorties sur la période."}
      />

      {message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-600">{message}</div>
      )}

      <KpiGrid kpis={kpis} />

      {isLoading ? (
        <Panel title="Chargement">
          <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
        </Panel>
      ) : (
        <>
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

          <div className="grid gap-4 md:grid-cols-5">
            <QuickAction icon="Plus" label="Ajouter une entrée" tone="green" onClick={() => onNavigate?.("movements")} />
            <QuickAction icon="Activity" label="Enregistrer une sortie" tone="orange" onClick={() => onNavigate?.("movements")} />
            <QuickAction icon="FileText" label={isStockView ? "Faire un inventaire" : "Imprimer état"} tone="amber" onClick={() => onNavigate?.("inventory")} />
            <QuickAction icon="FileText" label="Exporter Excel" tone="greenSoft" onClick={() => onNavigate?.("reports")} />
            <QuickAction icon="FileText" label="Exporter PDF" tone="red" onClick={() => onNavigate?.("reports")} />
          </div>
        </>
      )}
    </section>
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
        <Panel title="Produits en alerte" link={`${lowStockRows.length} alerte(s)`}>
          <DataTable headers={["Produit", "Stock actuel", "Seuil d'alerte", "Statut"]} rows={lowStockRows} empty="Aucun produit en stock faible." />
        </Panel>
        <Panel title="Mouvements récents de stock" link="Temps réel">
          <DataTable headers={["Type", "Produit", "Date", "Quantité", "Référence"]} rows={recentMovements} movement empty="Aucun mouvement enregistré." />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Répartition du stock">
          <div className="grid gap-5 md:grid-cols-[170px_1fr]">
            <DonutChart total={money(summary?.stock_value).replace(" FCFA", "")} label="FCFA" segments={["#079455", "#f04438", "#f59e0b", "#2f80ed"]} />
            <Legend items={legendItems.length ? legendItems : [["Aucun stock", "0 FCFA", "bg-slate-300"]]} />
          </div>
        </Panel>
        <Panel title="État du stock par catégorie" link="Valeur">
          <SimpleRows rows={categoryRows.length ? categoryRows : [["Aucune catégorie", "0 FCFA", "Vide"]]} />
        </Panel>
        <Panel title="Avaries / produits abîmés" link={`${damageRows.length} récent(s)`}>
          <SimpleRows rows={damageRows.length ? damageRows : [["Aucune avarie", "-", "RAS"]]} />
        </Panel>
      </div>
    </>
  );
}

function AccountingContent({ lowStockRows, recentMovements, damageRows, report, summary }) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <Panel title="Résumé comptable stock" action="Période récente">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryCard label="Valeur d'achat" value={money(summary?.stock_value)} trend="Stock courant" tone="green" />
            <SummaryCard label="Valeur de vente estimée" value={money(report?.estimated_sales_value)} trend="Avec taux de marge" tone="green" />
            <SummaryCard label="Entrées" value={money(report?.entries_value)} trend="Achats période" tone="green" />
            <SummaryCard label="Avaries" value={money(report?.damage_loss)} trend="Pertes période" tone="pink" />
          </div>
        </Panel>
        <Panel title="Mouvements de stock" link="Voir tout">
          <DataTable headers={["Type", "Produit", "Date", "Quantité", "Référence"]} rows={recentMovements} movement empty="Aucun mouvement enregistré." />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Produits en alerte" link="Priorité achat">
          <DataTable headers={["Produit", "Stock actuel", "Stock min.", "Statut"]} rows={lowStockRows} empty="Aucune alerte." />
        </Panel>
        <Panel title="Avaries">
          <SimpleRows rows={damageRows.length ? damageRows : [["Aucune avarie", "-", "RAS"]]} />
        </Panel>
        <Panel title="Valorisation par emplacement">
          <SimpleRows rows={[
            ["Magasin", money(summary?.main_stock_value), "Principal"],
            ["Cuisine", money(summary?.kitchen_stock_value), "Production"],
            ["Boisson", money(summary?.drink_stock_value), "Bar"],
          ]} />
        </Panel>
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
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs font-black text-slate-500">
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
