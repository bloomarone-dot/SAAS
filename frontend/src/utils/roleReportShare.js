/**
 * Partage / export des rapports métier (serveur, cuisine, caisse).
 */

export function downloadTextFile(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
          return value;
        })
        .join(";"),
    )
    .join("\n");
}

/**
 * Ouvre WhatsApp Web/App avec le texte du rapport.
 * Avec numéro : ouvre directement la conversation (ex. patron).
 * Sans numéro : WhatsApp s’ouvre avec le message prérempli à envoyer au contact choisi.
 */
export function shareReportOnWhatsApp(text, phone = "") {
  const message = String(text || "").trim();
  if (!message) return;
  const digits = String(phone || "").replace(/\D/g, "");
  const target = digits ? `https://wa.me/${digits.startsWith("237") ? digits : `237${digits}`}` : "https://wa.me/";
  const url = `${target}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function moneyFr(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatVariationFr(value) {
  if (value == null) return "—";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Texte prêt à coller / envoyer dans le groupe WhatsApp de l’entreprise. */
export function buildDailyReportText(report) {
  if (!report) return "";
  const kpis = report.kpis || {};
  const dateLabel = report.date
    ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
        new Date(`${report.date}T12:00:00`),
      )
    : "Aujourd'hui";

  const lines = [
    `*Rapport de la journée*`,
    `${report.restaurant_name || "Restaurant"}`,
    dateLabel,
    "",
    `CA : ${moneyFr(kpis.revenue)}`,
    `Commandes : ${kpis.orders_count ?? 0}`,
    `Ticket moyen : ${moneyFr(kpis.average_ticket)}`,
    `Bénéfice estimé : ${moneyFr(kpis.profit)}`,
    `Marge : ${Number(kpis.margin_rate || 0).toFixed(1)} %`,
    `Réductions : -${moneyFr(kpis.total_discounts)} (${kpis.discounted_orders_count || 0} cmd)`,
    `vs hier (même heure) : ${formatVariationFr(report.comparison?.variation_pct)}`,
    "",
    `Repas : ${moneyFr(kpis.meal_revenue)}`,
    `Boissons : ${moneyFr(kpis.drink_revenue)}`,
  ];

  const payments = report.payment_methods || [];
  if (payments.length) {
    lines.push("", "*Modes de paiement*");
    for (const row of payments) {
      lines.push(`• ${row.method} : ${moneyFr(row.amount)} (${row.share}%)`);
    }
  }

  const products = (report.top_products || []).slice(0, 8);
  if (products.length) {
    lines.push("", "*Meilleures ventes*");
    for (const row of products) {
      lines.push(`• ${row.name} × ${row.quantity} — ${moneyFr(row.revenue)}`);
    }
  }

  const team = (report.employee_performance || []).slice(0, 8);
  if (team.length) {
    lines.push("", "*Équipe*");
    for (const row of team) {
      lines.push(`• ${row.name} — ${moneyFr(row.revenue)} (${row.orders} cmd)`);
    }
  }

  const alerts = (report.stock_alerts || []).slice(0, 5);
  if (alerts.length) {
    lines.push("", "*Alertes stock*");
    for (const row of alerts) {
      const label = row.name || row.product_name || "Article";
      lines.push(`• ${label} (${row.current_stock ?? "?"} / min ${row.minimum_stock ?? "?"})`);
    }
  }

  lines.push("", `_Généré automatiquement — Bloomar_`);
  return lines.join("\n");
}

export function printHtmlReport(html, title = "Rapport") {
  const popup = window.open("", "_blank", "width=720,height=900");
  if (!popup) {
    window.alert("Autorisez les pop-ups pour imprimer le rapport.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
}

export function buildServerReportText({ name, stats, dateLabel }) {
  const lines = [
    `Rapport serveuse — ${name || "Serveur"}`,
    `Période : ${dateLabel || "Aujourd'hui"}`,
    `Commandes : ${stats?.orders ?? 0}`,
    `Clients servis : ${stats?.clients ?? 0}`,
    `Encaissées : ${stats?.paid ?? 0}`,
    `Total du jour : ${Number(stats?.sales || 0).toLocaleString("fr-FR")} FCFA`,
  ];
  if (stats?.recent?.length) {
    lines.push("", "Dernières commandes :");
    for (const item of stats.recent.slice(0, 8)) {
      lines.push(
        `• ${item.order_number} — ${item.status} — ${Number(item.total_amount || 0).toLocaleString("fr-FR")} FCFA`,
      );
    }
  }
  return lines.join("\n");
}

export function buildKitchenReportText({ name, monthStats, pending, preparing, ready }) {
  const lines = [
    `Rapport cuisine — ${name || "Cuisine"}`,
    `Mois : ${monthStats?.month || "courant"}`,
    `Nouvelles : ${pending ?? 0}`,
    `En préparation : ${preparing ?? 0}`,
    `Prêtes : ${ready ?? 0}`,
    `Plats ce mois : ${monthStats?.total_dishes ?? 0}`,
  ];
  if (monthStats?.top_items?.length) {
    lines.push("", "Top plats :");
    for (const item of monthStats.top_items.slice(0, 8)) {
      lines.push(`• ${item.name} × ${item.quantity}`);
    }
  }
  return lines.join("\n");
}

export function buildCashierReportText({ name, report }) {
  const methods = Object.entries(report?.by_payment_method || {})
    .map(([method, amount]) => `• ${method} : ${Number(amount || 0).toLocaleString("fr-FR")} FCFA`)
    .join("\n");
  return [
    `Rapport caisse — ${name || "Caisse"}`,
    `Total encaissé : ${Number(report?.total_collected || 0).toLocaleString("fr-FR")} FCFA`,
    `Réductions : ${Number(report?.total_discounts || 0).toLocaleString("fr-FR")} FCFA`,
    `Transactions : ${report?.paid_orders_count ?? 0}`,
    "",
    "Modes de paiement :",
    methods || "• Aucun",
  ].join("\n");
}
