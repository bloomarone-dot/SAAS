import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { money, qty } from "../shared/format";
import { Table } from "../shared/ui";

export function Alerts({ products }) {
  return (
    <DashboardSection
      title="Produits sous seuil minimum"
      description={`${products.length.toLocaleString("fr-FR")} produit(s) à surveiller`}
    >
      <Table
        columns={["Produit", "Stock", "Seuil", "Valeur"]}
        rows={products.map((product) => [
          product.name,
          qty(product.current_stock),
          qty(product.minimum_stock),
          money(product.stock_value),
        ])}
      />
    </DashboardSection>
  );
}
