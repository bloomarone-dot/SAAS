import { useEffect, useMemo, useState } from "react";

import { DashboardSection } from "@/modules/admin/components/AdminUi";
import { apiFetch } from "@/config/http";
import { today } from "../shared/format";
import { Input, SimpleTable, Stat, Submit } from "../shared/ui";

const VAT_RATE = 0.1925;

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function splitVat(ttc) {
  const total = Number(ttc || 0);
  const ht = total / (1 + VAT_RATE);
  const tva = total - ht;
  return { ht, tva, ttc: total };
}

export function Encaissements({ onMessage }) {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadReport(event) {
    event?.preventDefault();
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: `${startDate}T00:00:00`,
        end_date: `${endDate}T23:59:59`,
      });
      const data = await apiFetch(`/api/v1/orders/cashier-report?${params.toString()}`, {
        fallback: "Impossible de charger les encaissements.",
      });
      setReport(data);
    } catch (error) {
      onMessage?.(error.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []);

  const totals = useMemo(() => splitVat(report?.total_collected), [report?.total_collected]);

  const methodRows = useMemo(
    () =>
      Object.entries(report?.by_payment_method || {}).map(([method, amount], index) => {
        const split = splitVat(amount);
        return {
          id: `method-${index}`,
          method,
          ht: money(split.ht),
          tva: money(split.tva),
          ttc: money(split.ttc),
        };
      }),
    [report?.by_payment_method],
  );

  const receiptRows = useMemo(
    () =>
      (report?.receipts || []).map((order) => {
        const split = splitVat(order.total_amount);
        return {
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name || "-",
          cashier_name: order.cashier_name || "-",
          payment_method: order.payment_method || "-",
          ht: money(split.ht),
          tva: money(split.tva),
          ttc: money(split.ttc),
          paid_at: order.paid_at ? new Date(order.paid_at).toLocaleString("fr-FR") : "-",
        };
      }),
    [report?.receipts],
  );

  return (
    <DashboardSection
      title="Entrées d'argent (ventes)"
      description="Tout l'argent rentré grâce aux commandes payées : tables, livraisons, caisse. Ce n'est pas ce que vous payez — voir « Sorties d'argent » pour les dépenses."
    >
      <form onSubmit={loadReport} className="mb-4 grid gap-3 md:grid-cols-3">
        <Input label="Début" type="date" value={startDate} onChange={setStartDate} />
        <Input label="Fin" type="date" value={endDate} onChange={setEndDate} />
        <div className="flex items-end">
          <Submit />
        </div>
      </form>

      {loading && (
        <p className="mb-4 text-sm font-semibold text-slate-500">Chargement des encaissements...</p>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label="Commandes payées" value={report?.receipts_count || 0} />
        <Stat label="Total HT" value={money(totals.ht)} />
        <Stat label="TVA collectée" value={money(totals.tva)} />
        <Stat label="Total TTC encaissé" value={money(totals.ttc)} />
      </div>

      <SimpleTable
        columns={[
          ["method", "Mode de paiement"],
          ["ht", "Montant HT"],
          ["tva", "TVA"],
          ["ttc", "Montant TTC"],
        ]}
        rows={methodRows}
      />

      <div className="mt-4">
        <SimpleTable
          columns={[
            ["order_number", "Commande"],
            ["customer_name", "Client"],
            ["cashier_name", "Caissier"],
            ["payment_method", "Paiement"],
            ["ht", "HT"],
            ["tva", "TVA"],
            ["ttc", "TTC"],
            ["paid_at", "Date"],
          ]}
          rows={receiptRows}
        />
      </div>
    </DashboardSection>
  );
}
