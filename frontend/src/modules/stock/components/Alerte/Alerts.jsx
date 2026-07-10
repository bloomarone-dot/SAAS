import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { formatLocalDate, money, qty } from "../shared/format";
import { Table } from "../shared/ui";

export function Alerts({ products, expiringLots = [], productName = () => "-", depotName = () => "-" }) {
  return (
    <div className="space-y-4">
      <DashboardSection
        title="Produits sous seuil minimum"
        description={`${products.length.toLocaleString("fr-FR")} produit(s) à surveiller`}
      >
        {products.length ? (
          <Table
            columns={["Produit", "Stock", "Seuil", "Valeur"]}
            rows={products.map((product) => [
              product.name,
              qty(product.current_stock),
              qty(product.minimum_stock),
              money(product.stock_value),
            ])}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            Aucune alerte de stock faible pour le moment.
          </p>
        )}
      </DashboardSection>

      <DashboardSection
        title="Lots expirés ou proches de la péremption"
        description={`${expiringLots.length.toLocaleString("fr-FR")} lot(s) à traiter`}
      >
        {expiringLots.length ? (
          <Table
            columns={["Produit", "Dépôt", "Lot", "Expiration", "Quantité", "État"]}
            rows={expiringLots.map((lot) => [
              productName(lot.product_id),
              depotName(lot.depot_id),
              lot.lot_number || "-",
              formatLocalDate(lot.expiry_date),
              qty(lot.quantity_remaining),
              lot.expired ? "Expiré" : "À surveiller",
            ])}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            Aucun lot expiré ou proche de la péremption.
          </p>
        )}
      </DashboardSection>
    </div>
  );
}
