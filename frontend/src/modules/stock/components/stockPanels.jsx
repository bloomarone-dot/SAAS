import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { enqueueOfflineAction, formatApiError, friendlyNetworkMessage, isNetworkError } from "@/utils/network";
import { validationFor } from "@/utils/validation";
import { money, movementLabels, productTypeLabels, damageReasonLabels, locationLabels } from "./stockShared";

// Panneaux presentational et helpers du module stock (extraits de StockOperations).

export function getPageCopy(mode) {
  const copy = {
    movements: ["Mouvements de stock", "Enregistrez entrées, sorties, transferts et ajustements d’inventaire."],
    suppliers: ["Entrées stock", "Enregistrez une entrée simple de stock sans gestion fournisseur."],
    inventory: ["Inventaires", "Surveillez les écarts, les seuils d’alerte et la rotation des produits."],
    purchases: ["Achats stock", "Saisissez les achats, les entrées et les prix d’achat pour suivre les marges."],
    accounting: ["Comptabilité stock", "Suivez la valeur du stock, les pertes et les éléments à comptabiliser."],
    expenses: ["Dépenses", "Saisissez et contrôlez les charges du restaurant par période."],
    reports: ["Rapports stock & finances", "Exportez les synthèses hebdomadaires et mensuelles pour le pilotage."],
    "sales-report": ["Rapports ventes", "Analysez le chiffre d'affaires, les commandes et les encaissements par période."],
    "profit-report": ["Rapports bénéfices", "Comparez recettes, dépenses, avaries et marges estimées."],
    "server-report": ["Rapports serveuses", "Suivez le chiffre d'affaires par serveur sur la période choisie."],
    "financial-report": ["États financiers", "Consultez compte de résultat, trésorerie, bilan simplifié et grand livre."],
  };
  const [title, subtitle] = copy[mode] ?? ["Stock & comptabilité", "Pilotez les produits, les mouvements, les alertes et les pertes du restaurant."];
  return { title, subtitle };
}

export function buildPdfReport({ title, header, range, summary, report, finance, items, movements, expenses, payments, margins, rotation }) {
  const generatedAt = new Date().toLocaleString("fr-FR");
  const period = `${formatDateInput(range.start_date)} - ${formatDateInput(range.end_date)}`;
  const movementRows = movements.map((movement) => [
    new Date(movement.created_at).toLocaleString("fr-FR"),
    items.find((item) => item.id === movement.item_id)?.name ?? "-",
    movementLabels[movement.movement_type] ?? movement.movement_type,
    movement.quantity,
    money(movement.valuation_delta),
    `${movement.source_location ? locationLabels[movement.source_location] : "-"} vers ${movement.destination_location ? locationLabels[movement.destination_location] : "-"}`,
    movement.note ?? "",
  ]);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} - PDF</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    header { border-bottom: 2px solid #f04438; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .brand img { width: 54px; height: 54px; object-fit: contain; border: 1px solid #e5e7eb; padding: 5px; }
    .brand strong { display: block; font-size: 15px; color: #070528; }
    h1 { margin: 0; font-size: 22px; color: #070528; }
    h2 { margin: 22px 0 8px; font-size: 14px; color: #070528; }
    p { margin: 4px 0; }
    .muted { color: #667085; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
    .card { border: 1px solid #e5e7eb; padding: 10px; background: #f9fafb; }
    .label { color: #667085; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .value { margin-top: 5px; font-size: 14px; font-weight: 900; color: #070528; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th { background: #fff4ed; color: #9a3412; text-align: left; font-size: 9px; text-transform: uppercase; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
    td.num, th.num { text-align: right; }
    footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #667085; font-size: 10px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <img src="${escapeHtml(header.logo)}" alt="" />
      <div>
        <strong>${escapeHtml(header.name)}</strong>
        <p class="muted">${escapeHtml(header.subtitle)}</p>
      </div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">Période: ${escapeHtml(period)} · Généré le ${escapeHtml(generatedAt)}</p>
  </header>

  <section class="grid">
    ${pdfCard("Valeur stock", money(summary?.stock_value ?? report?.stock_value))}
    ${pdfCard("Stock faible", summary?.low_stock_count ?? report?.low_stock_count ?? 0)}
    ${pdfCard("Chiffre d'affaires", money(finance?.revenue))}
    ${pdfCard("Bénéfice net", money(finance?.net_profit))}
  </section>

  ${pdfTable("Produits en stock", ["Produit", "Unité", "Magasin", "Cuisine", "Boisson", "Seuil", "Prix achat", "Marge"], items.map((item) => [
    item.name,
    item.unit,
    item.quantity,
    item.kitchen_quantity,
    item.drink_quantity,
    item.alert_threshold,
    money(item.purchase_price),
    `${item.sale_margin_rate}%`,
  ]))}

  ${pdfTable("Mouvements", ["Date", "Produit", "Type", "Quantité", "Impact CMUP", "Trajet", "Note"], movementRows)}

  ${pdfTable("Dépenses", ["Date", "Libellé", "Catégorie", "Montant", "Paiement", "Référence"], expenses.map((expense) => [
    new Date(expense.expense_date).toLocaleDateString("fr-FR"),
    expense.label,
    expense.category,
    money(expense.amount),
    expense.payment_method ?? "-",
    expense.reference ?? "-",
  ]))}

  ${pdfTable("Paiements", ["Date", "Commande", "Client", "Mode", "Statut", "Montant"], payments.map((payment) => [
    new Date(payment.created_at).toLocaleDateString("fr-FR"),
    payment.order_number,
    payment.customer_name,
    payment.payment_method,
    payment.status,
    money(payment.amount),
  ]))}

  ${pdfTable("Marges par plat", ["Plat", "Qté", "CA", "Coût estimé", "Marge", "Taux"], margins.map((row) => [
    row.name,
    row.quantity_sold,
    money(row.revenue),
    money(row.estimated_cost),
    money(row.estimated_margin),
    `${Number(row.margin_rate || 0).toFixed(1)}%`,
  ]))}

  ${pdfTable("Rotation stock / plats", ["Plat", "Qté sortie", "CA", "Dernière sortie"], rotation.map((row) => [
    row.name,
    row.quantity_sold,
    money(row.revenue),
    row.last_order_at ? new Date(row.last_order_at).toLocaleDateString("fr-FR") : "-",
  ]))}

  <footer>Rapport généré depuis Restaurant SaaS.</footer>
</body>
</html>`;
}

export function getRestaurantExportHeader() {
  const storedUser = safeJsonParse(localStorage.getItem("current_user")) || safeJsonParse(localStorage.getItem("user")) || {};
  const restaurant = safeJsonParse(localStorage.getItem("restaurant")) || {};
  return {
    name: restaurant.name || storedUser.restaurant_name || storedUser.restaurant?.name || "Restaurant",
    subtitle: restaurant.address || restaurant.phone || storedUser.restaurant?.address || "Entête restaurant",
    logo: restaurant.logo_url || storedUser.restaurant?.logo_url || "/logo.jpeg",
  };
}

export function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function pdfCard(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

export function pdfTable(title, headers, rows) {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Aucune donnée.</td></tr>`;
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

export function printHtmlDocument(html, onBlocked) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    onBlocked?.();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const print = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(print, 250);
    return;
  }

  printWindow.onload = () => setTimeout(print, 250);
}

export function formatDateInput(value) {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function selectedMovementItem(items, itemId) {
  return items.find((item) => item.id === itemId) ?? null;
}

export function getTotalQuantity(item) {
  return Number(item.quantity || 0) + Number(item.kitchen_quantity || 0) + Number(item.drink_quantity || 0);
}

export function getLocationOptions(movementType, item, side) {
  if (movementType === "TRANSFER") {
    if (side === "source") return [["MAGASIN", locationLabels.MAGASIN]];
    if (item?.product_type === "BOISSON") return [["BOISSON", locationLabels.BOISSON]];
    return [["CUISINE", locationLabels.CUISINE]];
  }

  if (item?.product_type === "BOISSON") {
    return [
      ["BOISSON", locationLabels.BOISSON],
      ["MAGASIN", locationLabels.MAGASIN],
    ];
  }

  return [
    ["CUISINE", locationLabels.CUISINE],
    ["MAGASIN", locationLabels.MAGASIN],
  ];
}

export function formatMovementLocations(movement) {
  const source = movement.source_location ? locationLabels[movement.source_location] : "-";
  const destination = movement.destination_location ? locationLabels[movement.destination_location] : "-";
  if (movement.movement_type === "IN") return `vers ${destination}`;
  if (movement.movement_type === "OUT") return `depuis ${source}`;
  if (movement.movement_type === "ADJUSTMENT") return `sur ${source}`;
  return `${source} vers ${destination}`;
}

export function numberPayload(payload, fields) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, fields.includes(key) ? Number(value || 0) : value])
  );
}

export function SectionTitle({ title, subtitle = "Donnée utilisée dans le suivi opérationnel et comptable.", icon }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-[#070528]">{title}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
      </div>
      <div className="flex h-11 w-11 items-center justify-center bg-[#f04438] text-white">
        <DashboardIcon name={icon} size={19} />
      </div>
    </div>
  );
}

export function SupplyGuide() {
  const steps = [
    ["1", "Choisir le produit", "Le produit doit déjà exister dans la liste stock."],
    ["2", "Entrer la quantité", "L’entrée ajoute la quantité au stock magasin."],
    ["3", "Valider", "L’historique et les quantités seront mis à jour automatiquement."],
  ];
  return (
    <div className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 md:grid-cols-3">
      {steps.map(([number, title, text]) => (
        <div key={number} className="flex gap-3 rounded-lg bg-white p-3 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-sm font-black text-white">
            {number}
          </span>
          <span>
            <p className="text-sm font-black text-slate-900">{title}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{text}</p>
          </span>
        </div>
      ))}
    </div>
  );
}

export function StockSummaryStrip({ summary, items, movements, damages, mode }) {
  const lowStockCount = summary?.low_stock_count ?? items.filter((item) => getTotalQuantity(item) <= Number(item.alert_threshold)).length;
  const movementCount = movements.length;
  const damageLoss = summary?.total_damage_loss ?? damages.reduce((total, row) => total + Number(row.estimated_loss || 0), 0);
  const cards = [
    { label: "Produits suivis", value: summary?.product_count ?? items.length, icon: "Package" },
    { label: "Stock faible", value: lowStockCount, icon: "AlertTriangle", tone: lowStockCount ? "orange" : "green" },
    { label: mode === "movements" ? "Mouvements" : "Valeur stock", value: mode === "movements" ? movementCount : money(summary?.stock_value), icon: mode === "movements" ? "Activity" : "Wallet" },
    { label: "Avaries", value: money(damageLoss), icon: "TrendingDown", tone: damageLoss ? "red" : "green" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-slate-500">{card.label}</p>
              <p className="mt-1 text-xl font-black text-[#070528]">{card.value}</p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              card.tone === "red"
                ? "bg-red-50 text-red-600"
                : card.tone === "orange"
                  ? "bg-orange-50 text-orange-600"
                  : "bg-emerald-50 text-emerald-700"
            }`}>
              <DashboardIcon name={card.icon} size={18} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticStockPanel({ rows }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase text-[#f04438]">Comptabilité analytique stock</p>
          <h2 className="mt-1 text-xl font-black text-[#070528]">Centres de coût restaurant</h2>
        </div>
        <DashboardIcon name="Calculator" size={22} className="text-[#f04438]" />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#f04438] shadow-sm">
                <DashboardIcon name={row.icon} size={17} />
              </span>
              <div>
                <p className="text-xs font-black uppercase text-slate-500">{row.label}</p>
                <p className="mt-1 text-lg font-black text-[#070528]">{row.value}</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LossReasonPanel({ rows }) {
  const entries = Object.entries(rows);
  return (
    <CompactPanel title="Pertes par motif" icon="TrendingDown">
      {entries.length ? entries.map(([reason, value]) => (
        <div key={reason} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-bold text-slate-600">{damageReasonLabels[reason] || reason}</span>
          <span className="font-black text-slate-950">{money(value)}</span>
        </div>
      )) : <p className="py-6 text-center text-sm font-semibold text-slate-500">Aucune perte.</p>}
    </CompactPanel>
  );
}

export function ExpiringLotsPanel({ lots, items, costCenters }) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const centerById = new Map(costCenters.map((center) => [center.id, center]));
  const soon = lots
    .filter((lot) => lot.expiration_date && Number(lot.available_quantity || 0) > 0)
    .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date))
    .slice(0, 5);
  return (
    <CompactPanel title="DLC proche" icon="Clock3">
      {soon.length ? soon.map((lot) => (
        <div key={lot.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-black text-slate-900">{itemById.get(lot.item_id)?.name || "-"}</span>
            <span className="text-xs font-black text-orange-600">{new Date(lot.expiration_date).toLocaleDateString("fr-FR")}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{centerById.get(lot.cost_center_id)?.name || "-"} · {lot.available_quantity} dispo</p>
        </div>
      )) : <p className="py-6 text-center text-sm font-semibold text-slate-500">Aucun lot proche DLC.</p>}
    </CompactPanel>
  );
}

export function InventoryStatusPanel({ inventories }) {
  const latest = inventories[0];
  return (
    <CompactPanel title="Inventaire" icon="ClipboardList">
      {latest ? (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="font-black text-slate-950">{latest.period}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{latest.lines?.length || 0} ligne(s) · {latest.status === "OPEN" ? "Ouvert" : "Clôturé"}</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${latest.status === "OPEN" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
            {latest.status === "OPEN" ? "En comptage" : "Clôturé"}
          </span>
        </div>
      ) : <p className="py-6 text-center text-sm font-semibold text-slate-500">Aucun inventaire.</p>}
    </CompactPanel>
  );
}

export function InventoryManager({ inventories, items, costCenters, period, onPeriodChange, onOpen, onLineChange, onClose, isLoading }) {
  const openInventory = inventories.find((inventory) => inventory.status === "OPEN");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const centerById = new Map(costCenters.map((center) => [center.id, center]));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-black uppercase text-[#f04438]">Inventaire hebdomadaire</p>
          <h2 className="mt-1 text-xl font-black text-[#070528]">{openInventory ? openInventory.period : "Nouvel inventaire"}</h2>
        </div>
        {!openInventory ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={period} onChange={(event) => onPeriodChange(event.target.value)} className="form-control" />
            <button type="button" onClick={onOpen} disabled={isLoading} className="lte-btn lte-btn-primary">Ouvrir</button>
          </div>
        ) : (
          <button type="button" onClick={() => onClose(openInventory.id)} disabled={isLoading} className="h-11 rounded-lg bg-[#f04438] px-4 text-sm font-black text-white disabled:opacity-60">Clôturer l’inventaire</button>
        )}
      </div>
      {openInventory ? (
        <div className="mt-5 overflow-x-auto">
          <table className="lte-table min-w-[920px]">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Article</th>
                <th className="px-4 py-3">Centre</th>
                <th className="px-4 py-3">Théorique</th>
                <th className="px-4 py-3">Réel</th>
                <th className="px-4 py-3">Écart</th>
                <th className="px-4 py-3">Valeur écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(openInventory.lines || []).slice(0, 80).map((line) => {
                const item = itemById.get(line.item_id);
                return (
                  <tr key={line.id} className={line.exceeds_threshold ? "bg-orange-50" : ""}>
                    <td className="px-4 py-3 font-black text-slate-950">{item?.name || "-"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{centerById.get(line.cost_center_id)?.name || "-"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{line.theoretical_stock} {item?.unit || ""}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        defaultValue={line.real_stock ?? ""}
                        onBlur={(event) => event.target.value !== "" && onLineChange(openInventory.id, line.id, event.target.value)}
                        className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-sm font-black outline-none focus:border-emerald-600"
                      />
                    </td>
                    <td className="px-4 py-3 font-black text-slate-700">{Number(line.variance || 0).toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 font-black text-[#f04438]">{money(line.variance_value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">Aucun inventaire ouvert. Lancez un comptage pour figer le stock théorique.</p>
      )}
    </div>
  );
}

export function CompactPanel({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <DashboardIcon name={icon} size={17} className="text-[#f04438]" />
        <h2 className="text-sm font-black text-[#070528]">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function DamageForm({ form, items, selectedItem, isLoading, onChange, onSubmit }) {
  const stockOptions = getLocationOptions("OUT", selectedItem, "source");
  const currentStock = selectedItem ? getLocationQuantityFromItem(selectedItem, form.location) : 0;
  const estimatedLoss = Number(form.estimated_loss || 0);

  return (
    <form onSubmit={onSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <DashboardIcon name="AlertTriangle" size={18} />
          </span>
          <div>
            <p className="text-xs font-black uppercase text-red-600">Avarie stock</p>
            <h2 className="text-lg font-black text-[#070528]">Déclarer une perte</h2>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <p className="mb-4 text-sm font-black text-[#070528]">Produit concerné</p>
          <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <SelectField name="item_id" label="Produit" value={form.item_id} onChange={onChange} options={items.map((item) => [item.id, item.name])} required />
            <SelectField name="location" label="Stock impacté" value={form.location} onChange={onChange} options={stockOptions} required />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CompactInfo label="Catégorie" value={productTypeLabels[selectedItem?.product_type] ?? "-"} />
            <CompactInfo label="Unité" value={selectedItem?.unit ?? "-"} />
            <CompactInfo label="Disponible" value={`${Number(currentStock || 0).toLocaleString("fr-FR")} ${selectedItem?.unit ?? ""}`.trim()} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <p className="mb-4 text-sm font-black text-[#070528]">Perte enregistrée</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="quantity" label="Quantité perdue" type="number" min="0" value={form.quantity} onChange={onChange} required />
            <Field name="estimated_loss" label="Valeur estimée" type="number" min="0" value={form.estimated_loss} onChange={onChange} required />
          </div>
          <SelectField name="reason" label="Motif" value={form.reason} onChange={onChange} options={Object.entries(damageReasonLabels)} required className="mt-4" />
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-slate-500">Impact estimé</p>
            <p className="mt-1 text-xl font-black text-red-600">{money(estimatedLoss)}</p>
          </div>
          <button
            type="submit"
            disabled={isLoading || !items.length}
            className="lte-btn lte-btn-primary"
          >
            <DashboardIcon name="CheckCircle2" size={17} />
            Enregistrer l’avarie
          </button>
        </div>
      </div>
    </form>
  );
}

export function CompactInfo({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-800">{value || "-"}</p>
    </div>
  );
}

export function getLocationQuantityFromItem(item, location) {
  if (!item) return 0;
  if (location === "CUISINE") return item.kitchen_quantity;
  if (location === "BOISSON") return item.drink_quantity;
  return item.quantity;
}

export function Field({ label, required, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        {...props}
        {...validationFor(props.name)}
        required={required}
        className="mt-2 form-control"
      />
    </label>
  );
}

export function ReadonlyField({ label, value }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">{label}</span>
      <div className="mt-2 flex h-11 items-center border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700">
        {value || "-"}
      </div>
    </label>
  );
}

export function SelectField({ label, options, required, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <select
        {...props}
        required={required}
        className="mt-2 form-control"
      >
        <option value="">Choisir</option>
        {options.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </label>
  );
}

export function PrimaryButton({ children, icon, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-6 lte-btn lte-btn-primary"
    >
      <DashboardIcon name={icon} size={17} />
      {children}
    </button>
  );
}

export function StockTable({ items, onEdit }) {
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const sortedItems = useMemo(
    () =>
      sortRows(items, sort, {
        name: (item) => item.name,
        type: (item) => productTypeLabels[item.product_type] ?? item.product_type,
        magasin: (item) => Number(item.quantity),
        cuisine: (item) => Number(item.kitchen_quantity),
        boisson: (item) => Number(item.drink_quantity),
        threshold: (item) => Number(item.alert_threshold),
        purchase_price: (item) => Number(item.purchase_price),
        cmup: (item) => Number(item.cmup_current || item.purchase_price),
        packaging_sale_price: (item) => Number(item.packaging_sale_price),
        margin: (item) => Number(item.sale_margin_rate),
        status: (item) => Number(getTotalQuantity(item) > Number(item.alert_threshold)),
      }),
    [items, sort]
  );

  return (
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[1160px]">
        <thead>
          <tr>
            <th className="px-5 py-4"><SortButton label="Produit" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Type" column="type" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Magasin" column="magasin" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Cuisine" column="cuisine" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Boisson" column="boisson" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Seuil" column="threshold" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Prix achat" column="purchase_price" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="CMUP" column="cmup" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Prix emballage" column="packaging_sale_price" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Marge" column="margin" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedItems.map((item) => {
            const isLow = getTotalQuantity(item) <= Number(item.alert_threshold);
            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-black text-[#070528]">{item.name}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{productTypeLabels[item.product_type] ?? item.product_type}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.quantity} {item.unit}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.kitchen_quantity} {item.unit}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.drink_quantity} {item.unit}</td>
                <td className="px-5 py-4 text-sm font-semibold text-slate-500">{item.alert_threshold} {item.unit}</td>
                <td className="px-5 py-4 text-sm font-black text-[#070528]">{money(item.purchase_price)}</td>
                <td className="px-5 py-4 text-sm font-black text-[#070528]">{money(item.cmup_current || item.purchase_price)}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.product_type === "EMBALLAGE" ? money(item.packaging_sale_price) : "-"}</td>
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.sale_margin_rate}%</td>
                <td className="px-5 py-4">
                  <span className={`px-3 py-1 text-xs font-black ${isLow ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                    {isLow ? "Alerte" : "Normal"}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit?.(item)}
                    className="lte-btn lte-btn-default"
                  >
                    <DashboardIcon name="Pencil" size={14} />
                    Modifier
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!sortedItems.length && (
        <div className="px-5 py-16 text-center">
          <p className="text-lg font-black text-[#070528]">Aucun produit stock</p>
          <p className="mt-1 text-sm font-medium text-slate-500">Créez une référence ou ajustez les filtres.</p>
        </div>
      )}
    </div>
  );
}

export function RecipeRows({ recipes, items, menuItems, onDelete }) {
  return (
    <div className="mt-5 divide-y divide-slate-100 border border-slate-100 bg-slate-50/50">
      {recipes.slice(0, 6).map((recipe) => {
        const dish = menuItems.find((item) => item.id === recipe.menu_item_id);
        const stockItem = items.find((item) => item.id === recipe.stock_item_id);
        return (
          <div key={recipe.id} className="flex items-start justify-between gap-4 bg-white px-4 py-3">
            <div>
              <p className="font-black text-[#070528]">{dish?.name ?? "Plat introuvable"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {recipe.quantity_per_dish} {stockItem?.unit ?? ""} de {stockItem?.name ?? "produit stock"} depuis {locationLabels[recipe.location] ?? recipe.location}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(recipe)}
              className="shrink-0 border border-red-100 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
            >
              Supprimer
            </button>
          </div>
        );
      })}
      {!recipes.length && (
        <p className="bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
          Aucun ingrédient lié aux plats.
        </p>
      )}
    </div>
  );
}

export function PackagingRows({ links, items, menuItems, onDelete }) {
  return (
    <div className="mt-5 overflow-hidden border border-slate-100 bg-slate-50">
      {links.slice(0, 6).map((link) => {
        const dish = menuItems.find((item) => item.id === link.menu_item_id);
        const packaging = items.find((item) => item.id === link.packaging_item_id);
        return (
          <div key={link.id} className="flex items-start justify-between gap-4 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-black text-[#070528]">{dish?.name ?? "Plat"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {link.required_quantity} x {packaging?.name ?? "emballage"} · {money(packaging?.packaging_sale_price)}
              </p>
            </div>
            <button type="button" onClick={() => onDelete(link)} className="text-xs font-black text-red-600">Retirer</button>
          </div>
        );
      })}
      {!links.length && (
        <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Aucun emballage lié.</p>
      )}
    </div>
  );
}

export function ProductionRows({ rows, menuItems }) {
  return (
    <div className="mt-5 divide-y divide-slate-100 border border-slate-100 bg-slate-50/50">
      {rows.slice(0, 6).map((row) => {
        const dish = menuItems.find((item) => item.id === row.menu_item_id);
        return (
          <div key={row.id} className="bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <p className="font-black text-[#070528]">{dish?.name ?? "Plat introuvable"}</p>
              <span className="text-sm font-black text-[#f04438]">{row.quantity}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {new Date(row.created_at).toLocaleString("fr-FR")} {row.note ? `- ${row.note}` : ""}
            </p>
          </div>
        );
      })}
      {!rows.length && (
        <p className="bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
          Aucune fiche de production.
        </p>
      )}
    </div>
  );
}

export function ReportPanel({ report, finance, serverRevenue, statements, margins, rotation, range, setRange, onSubmit }) {
  const cards = [
    ["Valeur stock", report?.stock_value],
    ["Chiffre d'affaires", finance?.revenue],
    ["Dépenses", finance?.expenses],
    ["Bénéfice net", finance?.net_profit],
    ["Pertes", report?.damage_loss],
    ["Mouvements", report?.movement_count, "number"],
  ];

  return (
    <form onSubmit={onSubmit} className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SectionTitle title="Rapport stock" icon="BarChart3" />
        <div className="grid gap-3 sm:grid-cols-[160px_160px_auto]">
          <Field
            name="start_date"
            label="Début"
            type="date"
            value={range.start_date}
            onChange={(event) => setRange((current) => ({ ...current, start_date: event.target.value }))}
            required
          />
          <Field
            name="end_date"
            label="Fin"
            type="date"
            value={range.end_date}
            onChange={(event) => setRange((current) => ({ ...current, end_date: event.target.value }))}
            required
          />
          <PrimaryButton icon="Activity">Générer</PrimaryButton>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, type]) => (
          <div key={label} className="border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-[#070528]">
              {type === "number" ? Number(value || 0).toLocaleString("fr-FR") : money(value)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 2xl:grid-cols-2">
        <ReportRows
          title="CA par serveuse"
          empty="Aucune commande rattachée à une serveuse sur la période."
          rows={serverRevenue}
          render={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[#070528]">{row.server_name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {row.orders_count} commande(s) · {row.paid_orders_count} payée(s) · ticket moyen {money(row.average_ticket)}
                </p>
              </div>
              <p className="font-black text-emerald-700">{money(row.revenue)}</p>
            </div>
          )}
        />
        <ReportRows
          title="Marges par plat"
          empty="Aucune marge calculée sur la période."
          rows={margins}
          render={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[#070528]">{row.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{row.quantity_sold} vendu(s) · coût {money(row.estimated_cost)}</p>
              </div>
              <p className="font-black text-emerald-700">{money(row.estimated_margin)}</p>
            </div>
          )}
        />
        <ReportRows
          title="Rotation stock / plats"
          empty="Aucune sortie plat sur la période."
          rows={rotation}
          render={(row) => (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[#070528]">{row.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{row.quantity_sold} sortie(s)</p>
              </div>
              <p className="font-black text-[#070528]">{money(row.revenue)}</p>
            </div>
          )}
        />
        <div className="border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm font-black text-[#070528]">États financiers</p>
          <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
            <p className="flex justify-between"><span>Compte de résultat</span><strong>{money(statements?.income_statement?.net_profit)}</strong></p>
            <p className="flex justify-between"><span>Flux de trésorerie</span><strong>{money(statements?.cash_flow?.net_cash_flow)}</strong></p>
            <p className="flex justify-between"><span>Actifs estimés</span><strong>{money(sumObject(statements?.balance_sheet?.assets))}</strong></p>
            <p className="flex justify-between"><span>Grand livre</span><strong>{Number(statements?.ledger?.length || 0).toLocaleString("fr-FR")} écriture(s)</strong></p>
          </div>
        </div>
      </div>
    </form>
  );
}

export function ReportRows({ title, rows, empty, render }) {
  return (
    <div className="border border-slate-100 bg-slate-50 p-4">
      <p className="text-sm font-black text-[#070528]">{title}</p>
      <div className="mt-3 divide-y divide-slate-200">
        {rows?.slice(0, 8).map((row, index) => (
          <div key={row.id ?? row.server_id ?? row.menu_item_id ?? `${title}-${index}`} className="py-3">
            {render(row)}
          </div>
        ))}
        {!rows?.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">{empty}</p>}
      </div>
    </div>
  );
}

export function sumObject(value) {
  return Object.values(value ?? {}).reduce((total, item) => total + Number(item || 0), 0);
}

export function FinancePanel({ finance, expenses, payments, margins, rotation, form, setForm, canEdit, isLoading, onSubmit, onDelete }) {
  const financeCards = [
    ["Chiffre d'affaires", finance?.revenue],
    ["Dépenses", finance?.expenses],
    ["Pertes avaries", finance?.damage_loss],
    ["Bénéfice net", finance?.net_profit],
    ["Commandes", finance?.orders_count, "number"],
    ["Ticket moyen", finance?.average_order_value],
  ];

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white p-6 shadow-sm">
        <SectionTitle title="États financiers" icon="Wallet" />
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {financeCards.map(([label, value, type]) => (
            <div key={label} className="border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-black uppercase text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-black text-[#070528]">
                {type === "number" ? Number(value || 0).toLocaleString("fr-FR") : money(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <form onSubmit={onSubmit} className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Dépenses & charges" icon="TrendingDown" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field name="label" label="Libellé" value={form.label} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="category" label="Catégorie" value={form.category} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="amount" label="Montant" type="number" min="0" value={form.amount} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="payment_method" label="Mode paiement" value={form.payment_method} onChange={updateField} disabled={!canEdit || isLoading} />
            <Field name="reference" label="Référence" value={form.reference} onChange={updateField} disabled={!canEdit || isLoading} />
            <Field name="expense_date" label="Date" type="date" value={form.expense_date} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="note" label="Note" value={form.note} onChange={updateField} disabled={!canEdit || isLoading} />
          </div>
          <PrimaryButton disabled={!canEdit || isLoading} icon="Plus">Enregistrer la dépense</PrimaryButton>
          <SimpleRows
            rows={expenses}
            empty="Aucune dépense sur la période."
            render={(expense) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{expense.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {expense.category} · {new Date(expense.expense_date).toLocaleDateString("fr-FR")} · {expense.reference || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#f04438]">{money(expense.amount)}</p>
                  {canEdit && (
                    <button type="button" onClick={() => onDelete(expense)} className="mt-2 text-xs font-black text-red-600">
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            )}
          />
        </form>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Paiements & encaissements" icon="ReceiptText" />
          <SimpleRows
            rows={payments}
            empty="Aucun encaissement sur la période."
            render={(payment) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{payment.order_number}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {payment.customer_name} · {payment.payment_method} · {payment.status}
                  </p>
                </div>
                <p className="font-black text-[#070528]">{money(payment.amount)}</p>
              </div>
            )}
          />
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Marges par plat" icon="TrendingUp" />
          <SimpleRows
            rows={margins}
            empty="Aucune marge calculée sur la période."
            render={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{row.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {row.quantity_sold} vendu(s) · coût estimé {money(row.estimated_cost)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-emerald-700">{money(row.estimated_margin)}</p>
                  <p className="text-xs font-semibold text-slate-500">{Number(row.margin_rate || 0).toFixed(1)}%</p>
                </div>
              </div>
            )}
          />
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Rotation stock / plats" icon="Activity" />
          <SimpleRows
            rows={rotation}
            empty="Aucune sortie liée aux plats sur la période."
            render={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{row.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Dernière sortie: {row.last_order_at ? new Date(row.last_order_at).toLocaleDateString("fr-FR") : "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#070528]">{row.quantity_sold}</p>
                  <p className="text-xs font-semibold text-slate-500">{money(row.revenue)}</p>
                </div>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function SimpleRows({ rows, empty, render }) {
  return (
    <div className="mt-5 divide-y divide-slate-100 border border-slate-100">
      {rows.slice(0, 8).map((row) => (
        <div key={row.id ?? row.menu_item_id ?? row.name} className="bg-white px-4 py-3">
          {render(row)}
        </div>
      ))}
      {!rows.length && <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">{empty}</p>}
    </div>
  );
}

export function HistoryPanel({ title, filter, onFilter, rows, items }) {
  return (
    <div className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#070528]">{title}</h2>
        <select value={filter} onChange={(event) => onFilter(event.target.value)} className="form-control h-8 w-auto text-xs">
          <option value="ALL">Tous</option>
          {Object.entries(movementLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.slice(0, 8).map((movement) => (
          <div key={movement.id} className="py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="font-black text-[#070528]">{items.find((item) => item.id === movement.item_id)?.name ?? "-"}</p>
              <span className="text-sm font-black text-[#f04438]">{movement.quantity}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {movementLabels[movement.movement_type]} • {formatMovementLocations(movement)} • {new Date(movement.created_at).toLocaleString("fr-FR")}
            </p>
            {Number(movement.valuation_delta || 0) !== 0 && (
              <p className={`mt-1 text-xs font-black ${Number(movement.valuation_delta) > 0 ? "text-orange-600" : "text-emerald-700"}`}>
                Impact CMUP: {money(movement.valuation_delta)}
              </p>
            )}
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucun mouvement.</p>}
      </div>
    </div>
  );
}

export function DamagePanel({ rows, items, canAccount, onAccount }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-red-600">Historique</p>
          <h2 className="text-lg font-black text-[#070528]">Avaries & pertes</h2>
        </div>
        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">{rows.length}</span>
      </div>
      <div className="space-y-3">
        {rows.slice(0, 8).map((damage) => (
          <div key={damage.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black text-[#070528]">{items.find((item) => item.id === damage.item_id)?.name ?? "-"}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{locationLabels[damage.location] ?? damage.location} · {damage.reason}</p>
                <p className="mt-2 text-sm font-black text-red-600">{money(damage.estimated_loss)}</p>
              </div>
              {damage.accounted_at ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Comptabilisée</span>
              ) : canAccount ? (
                <button type="button" onClick={() => onAccount(damage)} className="shrink-0 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50">
                  Comptabiliser
                </button>
              ) : (
                <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">À valider</span>
              )}
            </div>
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucune avarie.</p>}
      </div>
    </div>
  );
}
