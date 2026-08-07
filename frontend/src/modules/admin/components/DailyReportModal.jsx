import { useEffect, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { apiFetch } from "@/config/http";
import { shouldPreferLocalData } from "@/utils/network";
import { AdminFormModal } from "@/modules/admin/components/AdminUi";
import {
  buildDailyReportText,
  downloadTextFile,
  shareReportOnWhatsApp,
  toCsv,
} from "@/utils/roleReportShare";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatVariation(value) {
  if (value == null) return "—";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function Metric({ label, value, highlight = false }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className={`mt-2 text-lg font-black ${highlight ? "text-[var(--dashboard-primary)]" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function printDailyReport(report) {
  const kpis = report.kpis ?? {};
  const paymentRows = (report.payment_methods ?? [])
    .map((row) => `<tr><td>${escapeHtml(row.method)}</td><td style="text-align:right;">${money(row.amount)} (${row.share}%)</td></tr>`)
    .join("");
  const productRows = (report.top_products ?? [])
    .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.quantity}</td><td style="text-align:right;">${money(row.revenue)}</td></tr>`)
    .join("");
  const teamRows = (report.employee_performance ?? [])
    .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td style="text-align:right;">${money(row.revenue)}</td><td style="text-align:right;">${row.orders}</td></tr>`)
    .join("");
  const discountRows = (report.discount_lines ?? [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.order_number)}</td><td>${escapeHtml(row.server_name || "-")}</td><td style="text-align:right; color:#dc2626;">-${money(row.discount_amount)}</td><td style="text-align:right;">${money(row.total_amount)}</td></tr>`
    )
    .join("");

  const html = `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Rapport du jour</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          .muted { color: #6b7280; font-size: 13px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
          .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .box strong { display: block; margin-top: 6px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 0; text-align: left; }
          th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
          h2 { margin-top: 24px; font-size: 16px; }
        </style>
      </head>
      <body>
        <h1>Rapport de la journée</h1>
        <p class="muted">${escapeHtml(report.restaurant_name || "Restaurant")} · ${formatDate(report.date)}</p>
        <p class="muted">Généré le ${formatDateTime(report.generated_at)}</p>
        <div class="grid">
          <div class="box">Chiffre d'affaires<strong>${money(kpis.revenue)}</strong></div>
          <div class="box">Commandes<strong>${Number(kpis.orders_count || 0).toLocaleString("fr-FR")}</strong></div>
          <div class="box">Ticket moyen<strong>${money(kpis.average_ticket)}</strong></div>
          <div class="box">Bénéfice estimé<strong>${money(kpis.profit)}</strong></div>
          <div class="box">Réductions<strong style="color:#dc2626;">-${money(kpis.total_discounts)}</strong></div>
          <div class="box">vs Hier (même heure)<strong>${formatVariation(report.comparison?.variation_pct)}</strong></div>
        </div>
        <h2>Modes de paiement</h2>
        <table><tbody>${paymentRows || "<tr><td colspan=\"2\">Aucun paiement</td></tr>"}</tbody></table>
        <h2>Meilleures ventes</h2>
        <table><thead><tr><th>Produit</th><th>Qté</th><th style="text-align:right;">CA</th></tr></thead><tbody>${productRows || "<tr><td colspan=\"3\">Aucune vente</td></tr>"}</tbody></table>
        <h2>Performance équipe</h2>
        <table><thead><tr><th>Employé</th><th style="text-align:right;">CA</th><th style="text-align:right;">Cmd</th></tr></thead><tbody>${teamRows || "<tr><td colspan=\"3\">Aucune donnée</td></tr>"}</tbody></table>
        <h2>Réductions accordées (${Number(kpis.discounted_orders_count || 0)})</h2>
        <table><thead><tr><th>Commande</th><th>Serveur</th><th style="text-align:right;">Réduction</th><th style="text-align:right;">Total</th></tr></thead><tbody>${discountRows || "<tr><td colspan=\"4\">Aucune réduction</td></tr>"}</tbody></table>
        <script>window.print(); window.onafterprint = () => window.close();</script>
      </body>
    </html>`;

  const popup = window.open("", "_blank", "width=900,height=760");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function DailyReportModal({ open, onClose, branchId = "", restaurantId = "" }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("local");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");

    async function loadReport() {
      try {
        if (restaurantId) {
          const { computeAdminDailyReportLocal } = await import("@/offline/adminAnalytics");
          const local = await computeAdminDailyReportLocal(restaurantId, { branchId });
          if (local && active) {
            setReport(local);
            setSource("local");
          }
        }
        if (shouldPreferLocalData()) {
          return;
        }
        const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : "";
        const remote = await apiFetch(`/api/v1/dashboard/daily-report${query}`, {
          fallback: "Impossible de charger le rapport du jour.",
          softAuth: true,
        });
        if (active) {
          setReport(remote);
          setSource("remote");
        }
      } catch (err) {
        if (!report && active) {
          setError(err.message || "Chargement impossible.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReport();
    return () => {
      active = false;
    };
  }, [open, branchId, restaurantId]);

  const kpis = report?.kpis ?? {};

  function shareOnWhatsApp() {
    if (!report) return;
    const phone = report.owner_whatsapp || "";
    if (!phone) {
      window.alert(
        "Numéro WhatsApp du patron manquant. Renseignez-le dans Paramètres restaurant → WhatsApp du patron.",
      );
      return;
    }
    shareReportOnWhatsApp(buildDailyReportText(report), phone);
  }

  function exportCsv() {
    if (!report) return;
    const k = report.kpis || {};
    const rows = [
      ["Indicateur", "Valeur"],
      ["Restaurant", report.restaurant_name],
      ["Date", report.date],
      ["Chiffre d'affaires", k.revenue],
      ["Commandes", k.orders_count],
      ["Ticket moyen", k.average_ticket],
      ["Bénéfice estimé", k.profit],
      ["Marge %", k.margin_rate],
      ["Réductions", k.total_discounts],
      ["Repas", k.meal_revenue],
      ["Boissons", k.drink_revenue],
      ["vs hier %", report.comparison?.variation_pct],
      [],
      ["Mode de paiement", "Montant", "Part %"],
      ...(report.payment_methods || []).map((row) => [row.method, row.amount, row.share]),
      [],
      ["Produit", "Qté", "CA"],
      ...(report.top_products || []).map((row) => [row.name, row.quantity, row.revenue]),
      [],
      ["Employé", "CA", "Commandes"],
      ...(report.employee_performance || []).map((row) => [row.name, row.revenue, row.orders]),
    ];
    downloadTextFile(`rapport-journee-${report.date || new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${toCsv(rows)}`);
  }

  return (
    <AdminFormModal
      open={open}
      onClose={onClose}
      title="Rapport de la journée"
      description={report ? `${report.restaurant_name} · ${formatDate(report.date)}` : "Synthèse des ventes, encaissements et réductions du jour."}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="lte-btn lte-btn-default">
            Fermer
          </button>
          <button type="button" disabled={!report} onClick={exportCsv} className="lte-btn lte-btn-default">
            <DashboardIcon name="Download" size={16} />
            Exporter CSV
          </button>
          <button type="button" disabled={!report} onClick={shareOnWhatsApp} className="lte-btn lte-btn-default">
            <DashboardIcon name="Phone" size={16} />
            Envoyer au patron
          </button>
          <button type="button" disabled={!report} onClick={() => printDailyReport(report)} className="lte-btn lte-btn-primary">
            <DashboardIcon name="ReceiptText" size={16} />
            Imprimer
          </button>
        </>
      }
    >
      {loading && !report && <p className="py-10 text-center text-sm font-semibold text-slate-400">Chargement du rapport...</p>}
      {error && !report && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
      {source === "local" && report && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          Rapport généré localement — export PDF/CSV disponible hors ligne.
        </p>
      )}
      {report && !loading && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Chiffre d'affaires" value={money(kpis.revenue)} highlight />
            <Metric label="Commandes payées" value={Number(kpis.orders_count || 0).toLocaleString("fr-FR")} />
            <Metric label="Ticket moyen" value={money(kpis.average_ticket)} />
            <Metric label="Bénéfice estimé" value={money(kpis.profit)} />
            <Metric label="Marge" value={`${Number(kpis.margin_rate || 0).toFixed(1)} %`} />
            <Metric label="vs Hier (même heure)" value={formatVariation(report.comparison?.variation_pct)} />
          </div>

          <div className="rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-slate-600">Total des réductions accordées</p>
            <p className="mt-1 text-2xl font-black text-red-600">
              - {money(kpis.total_discounts)} · {kpis.discounted_orders_count || 0} commande(s)
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 text-sm font-black text-slate-900">Modes de paiement</h3>
              <div className="space-y-2">
                {(report.payment_methods ?? []).map((row) => (
                  <div key={row.method} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700">{row.method}</span>
                    <span className="font-black text-slate-900">
                      {money(row.amount)} · {row.share}%
                    </span>
                  </div>
                ))}
                {!(report.payment_methods ?? []).length && (
                  <p className="text-sm font-semibold text-slate-400">Aucun encaissement aujourd'hui.</p>
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-black text-slate-900">Repas / Boissons</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-semibold text-slate-600">Repas</span>
                  <span className="font-black text-slate-900">{money(kpis.meal_revenue)}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-semibold text-slate-600">Boissons</span>
                  <span className="font-black text-slate-900">{money(kpis.drink_revenue)}</span>
                </div>
              </div>
            </section>
          </div>

          <section>
            <h3 className="mb-3 text-sm font-black text-slate-900">Meilleures ventes</h3>
            <div className="overflow-x-auto">
              <table className="lte-table min-w-[480px]">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Qté</th>
                    <th className="text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.top_products ?? []).map((row) => (
                    <tr key={row.name}>
                      <td className="font-semibold text-slate-800">{row.name}</td>
                      <td>{row.quantity}</td>
                      <td className="text-right font-black">{money(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-slate-900">Performance équipe</h3>
            <div className="overflow-x-auto">
              <table className="lte-table min-w-[480px]">
                <thead>
                  <tr>
                    <th>Employé</th>
                    <th className="text-right">CA</th>
                    <th className="text-right">Commandes</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.employee_performance ?? []).map((row) => (
                    <tr key={row.name}>
                      <td className="font-semibold text-slate-800">{row.name}</td>
                      <td className="text-right font-black">{money(row.revenue)}</td>
                      <td className="text-right">{row.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(report.discount_lines ?? []).length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-black text-slate-900">Détail des réductions</h3>
              <div className="overflow-x-auto">
                <table className="lte-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th>Commande</th>
                      <th>Serveur</th>
                      <th className="text-right">Réduction</th>
                      <th className="text-right">Total payé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.discount_lines.map((line) => (
                      <tr key={line.order_number}>
                        <td className="font-black text-slate-900">{line.order_number}</td>
                        <td className="font-semibold text-slate-600">{line.server_name || "—"}</td>
                        <td className="text-right font-black text-red-600">- {money(line.discount_amount)}</td>
                        <td className="text-right font-black">{money(line.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-xs font-medium text-slate-400">
            Généré le {formatDateTime(report.generated_at)}. « Envoyer au patron » ouvre WhatsApp avec le rapport prêt pour
            le numéro configuré dans Paramètres restaurant.
          </p>
        </div>
      )}
    </AdminFormModal>
  );
}

export function DailyReportPage({ onClose }) {
  return <DailyReportModal open onClose={onClose} />;
}
