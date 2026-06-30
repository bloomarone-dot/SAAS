import { useEffect, useState } from "react";

import { money } from "../shared/format";
import { Panel, SimpleTable, Stat } from "../shared/ui";

export function FoodCost({ api, onMessage }) {
  const [data, setData] = useState(null);
  const [dishes, setDishes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [foodCost, margins] = await Promise.all([
          api("/api/v1/finance/reports/food-cost"),
          api("/api/v1/finance/dish-margins"),
        ]);
        setData(foodCost);
        setDishes(margins);
      } catch (error) {
        onMessage?.(error.message);
      }
    })();
  }, []);

  const percent = (v) => `${Number(v || 0).toFixed(2)} %`;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Chiffre d'affaires" value={money(data?.revenue)} />
        <Stat label="Coût matière" value={money(data?.material_cost)} />
        <Stat label="Marge" value={money(data?.margin)} />
        <Stat label="Taux coût matière" value={percent(data?.food_cost_rate)} />
      </div>
      <Panel
        title="Coût matière par catégorie"
        description="Comparez le chiffre d'affaires, le coût matière et son poids dans les ventes par famille."
      >
        <SimpleTable
          columns={[
            ["category", "Catégorie"],
            ["revenue", "CA", money],
            ["material_cost", "Coût matière", money],
            ["food_cost_rate", "Taux coût matière", percent],
          ]}
          rows={data?.by_category || []}
        />
      </Panel>
      <Panel
        title="Marge par plat"
        description={`${dishes.length.toLocaleString("fr-FR")} plat(s) analysé(s)`}
      >
        <SimpleTable
          columns={[
            ["name", "Plat"],
            ["quantity_sold", "Vendus"],
            ["revenue", "CA", money],
            ["estimated_cost", "Coût", money],
            ["estimated_margin", "Marge", money],
            ["food_cost_rate", "Taux coût matière", percent],
          ]}
          rows={dishes}
        />
      </Panel>
    </section>
  );
}
