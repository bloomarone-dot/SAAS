import { Search } from "lucide-react";

import { DashboardSection } from "@/modules/admin/components/AdminUi";

import { qty } from "../shared/format";
import { Table } from "../shared/ui";

export function ProductList({ products, query, setQuery }) {
  const uniqueProducts = products.filter(
    (product, index, list) =>
      index === list.findIndex((item) => item.id === product.id),
  );

  return (
    <DashboardSection
      title="Produits stock"
      description={`${uniqueProducts.length.toLocaleString("fr-FR")} produit(s) affiché(s)`}
    >
      <div className="mb-4">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm focus-within:border-slate-500">
          <Search size={16} className="text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
            placeholder="Rechercher un produit"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <Table
        columns={["Produit", "Unité", "Stock total", "Seuil"]}
        rows={uniqueProducts.map((product) => [
          <strong key="p">{product.name}</strong>,
          product.unit_symbol || product.unit_name,
          qty(product.current_stock),
          qty(product.minimum_stock),
        ])}
      />
    </DashboardSection>
  );
}
