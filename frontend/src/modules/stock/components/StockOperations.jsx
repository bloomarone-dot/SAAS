import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";

const emptyItem = {
  name: "",
  product_type: "INGREDIENT",
  unit: "Kilogramme",
  quantity: "",
  kitchen_quantity: "",
  drink_quantity: "",
  alert_threshold: "",
  purchase_price: "",
  sale_margin_rate: "",
};

const emptyMovement = {
  item_id: "",
  movement_type: "IN",
  source_location: "MAGASIN",
  destination_location: "CUISINE",
  quantity: "",
  unit_price: "",
  destination: "",
  note: "",
};

const emptyDamage = {
  item_id: "",
  location: "MAGASIN",
  quantity: "",
  estimated_loss: "",
  reason: "",
};

const movementLabels = {
  IN: "Entrée vers magasin",
  OUT: "Sortie / consommation",
  TRANSFER: "Transfert magasin",
  ADJUSTMENT: "Ajustement inventaire",
};

const productTypeLabels = {
  INGREDIENT: "Ingrédient / nourriture",
  BOISSON: "Boisson / vin",
};

const locationLabels = {
  MAGASIN: "Stock magasin",
  CUISINE: "Stock cuisine",
  BOISSON: "Stock boisson",
};

const unitsByType = {
  INGREDIENT: ["Kilogramme"],
  BOISSON: ["Bouteille", "Carton", "Casier"],
};

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export function StockOperations({ apiBaseUrl, role, mode = "stock", onMessage }) {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [damages, setDamages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [movementForm, setMovementForm] = useState(emptyMovement);
  const [damageForm, setDamageForm] = useState(emptyDamage);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [movementFilter, setMovementFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(false);

  const token = localStorage.getItem("access_token");
  const canAccountDamage = role === "ADMIN" || role === "COMPTABLE";
  const pageCopy = getPageCopy(mode);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const isLow = Number(item.quantity) <= Number(item.alert_threshold);
      const totalQuantity = getTotalQuantity(item);
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.unit.toLowerCase().includes(query) ||
        (productTypeLabels[item.product_type] ?? item.product_type ?? "").toLowerCase().includes(query);
      const matchesStock =
        stockFilter === "ALL" ||
        (stockFilter === "LOW" && totalQuantity <= Number(item.alert_threshold)) ||
        (stockFilter === "OK" && totalQuantity > Number(item.alert_threshold));
      return matchesSearch && matchesStock;
    });
  }, [items, search, stockFilter]);

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => movementFilter === "ALL" || movement.movement_type === movementFilter);
  }, [movementFilter, movements]);

  const kpis = useMemo(
    () => [
      { label: "Valeur stock", value: money(summary?.stock_value), icon: "Wallet" },
      { label: "Produits", value: summary?.product_count ?? 0, icon: "Package" },
      { label: "Stock faible", value: summary?.low_stock_count ?? 0, icon: "AlertTriangle" },
      { label: "Pertes comptabilisées", value: money(summary?.total_damage_loss), icon: "TrendingDown" },
    ],
    [summary]
  );

  useEffect(() => {
    loadStock();
  }, []);

  async function api(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail ?? "Opération impossible.");
    return data;
  }

  async function loadStock() {
    setIsLoading(true);
    try {
      const [summaryData, itemData, movementData, damageData] = await Promise.all([
        api("/api/v1/stock/summary"),
        api("/api/v1/stock/items"),
        api("/api/v1/stock/movements"),
        api("/api/v1/stock/damages"),
      ]);
      setSummary(summaryData);
      setItems(itemData);
      setMovements(movementData);
      setDamages(damageData);
      setMovementForm((current) => ({ ...current, item_id: current.item_id || itemData[0]?.id || "" }));
      setDamageForm((current) => ({ ...current, item_id: current.item_id || itemData[0]?.id || "" }));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateItemField(event) {
    const { name, value } = event.target;
    setItemForm((current) => ({ ...current, [name]: value }));
  }

  function updateMovementField(event) {
    const { name, value } = event.target;
    setMovementForm((current) => {
      const next = { ...current, [name]: value };
      const nextItem = selectedMovementItem(items, name === "item_id" ? value : next.item_id);
      const nextType = name === "movement_type" ? value : next.movement_type;
      if (name === "item_id" || name === "movement_type") {
        if (nextType === "TRANSFER") {
          next.source_location = "MAGASIN";
          next.destination_location = nextItem?.product_type === "BOISSON" ? "BOISSON" : "CUISINE";
        } else if (nextType === "OUT") {
          next.source_location = nextItem?.product_type === "BOISSON" ? "BOISSON" : "CUISINE";
          next.destination_location = "";
        } else if (nextType === "ADJUSTMENT") {
          next.source_location = "MAGASIN";
          next.destination_location = "";
        } else {
          next.source_location = "";
          next.destination_location = "MAGASIN";
        }
      }
      return next;
    });
  }

  function updateDamageField(event) {
    const { name, value } = event.target;
    setDamageForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "item_id") {
        const nextItem = selectedMovementItem(items, value);
        next.location = nextItem?.product_type === "BOISSON" ? "BOISSON" : "CUISINE";
      }
      return next;
    });
  }

  async function createItem(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const created = await api("/api/v1/stock/items", {
        method: "POST",
        body: JSON.stringify(
          numberPayload(itemForm, [
            "quantity",
            "kitchen_quantity",
            "drink_quantity",
            "alert_threshold",
            "purchase_price",
            "sale_margin_rate",
          ])
        ),
      });
      setItems((current) => [created, ...current]);
      setItemForm(emptyItem);
      await loadStock();
      onMessage(`Produit stock "${created.name}" créé.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createMovement(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await api("/api/v1/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          ...numberPayload(movementForm, ["quantity", "unit_price"]),
          unit_price: Number(movementForm.unit_price || 0),
          destination: movementForm.destination || null,
          note: movementForm.note || null,
        }),
      });
      setMovementForm({ ...emptyMovement, item_id: movementForm.item_id });
      await loadStock();
      onMessage("Mouvement de stock enregistré.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createDamage(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await api("/api/v1/stock/damages", {
        method: "POST",
        body: JSON.stringify(numberPayload(damageForm, ["quantity", "estimated_loss"])),
      });
      setDamageForm({ ...emptyDamage, item_id: damageForm.item_id });
      await loadStock();
      onMessage("Avarie enregistrée.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function accountDamage(damage) {
    setIsLoading(true);
    try {
      await api(`/api/v1/stock/damages/${damage.id}/account`, { method: "PATCH" });
      await loadStock();
      onMessage("Avarie comptabilisée.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Produit", "Unité", "Quantité", "Seuil", "Prix achat", "Marge"],
      ...items.map((item) => [
        item.name,
        item.unit,
        `Magasin: ${item.quantity} / Cuisine: ${item.kitchen_quantity} / Boisson: ${item.drink_quantity}`,
        item.alert_threshold,
        item.purchase_price,
        item.sale_margin_rate,
      ]),
      [],
      ["Date", "Produit", "Type", "Quantité", "Destination", "Note"],
      ...movements.map((movement) => [
        new Date(movement.created_at).toLocaleString("fr-FR"),
        items.find((item) => item.id === movement.item_id)?.name ?? "-",
        movementLabels[movement.movement_type],
        movement.quantity,
        `${movement.source_location ? locationLabels[movement.source_location] : "-"} -> ${movement.destination_location ? locationLabels[movement.destination_location] : "-"}`,
        movement.note ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase text-[#f04438]">Gestionnaire stock / Comptable</p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">{pageCopy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">{pageCopy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={exportCsv} className="inline-flex h-12 items-center gap-2 border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]">
            <DashboardIcon name="FileText" size={17} />
            Export Excel
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex h-12 items-center gap-2 border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]">
            <DashboardIcon name="ReceiptText" size={17} />
            Imprimer
          </button>
          <button type="button" onClick={loadStock} className="inline-flex h-12 items-center gap-2 bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] hover:bg-[#d92d20]">
            <DashboardIcon name="Activity" size={17} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center bg-[#fff4ed] text-[#f04438]">
              <DashboardIcon name={kpi.icon} size={19} />
            </div>
            <p className="mt-5 text-sm font-bold text-slate-500">{kpi.label}</p>
            <p className="mt-1 text-3xl font-black text-[#070528]">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <form onSubmit={createItem} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle title="Référence stock" icon="Package" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field name="name" label="Produit" value={itemForm.name} onChange={updateItemField} required />
              <SelectField
                name="product_type"
                label="Nature du produit"
                value={itemForm.product_type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setItemForm((current) => ({
                    ...current,
                    product_type: nextType,
                    unit: unitsByType[nextType][0],
                    drink_quantity: nextType === "BOISSON" ? current.drink_quantity : "",
                    kitchen_quantity: nextType === "INGREDIENT" ? current.kitchen_quantity : "",
                  }));
                }}
                options={Object.entries(productTypeLabels)}
                required
              />
              <SelectField
                name="unit"
                label="Unité d’entrée"
                value={itemForm.unit}
                onChange={updateItemField}
                options={unitsByType[itemForm.product_type].map((unit) => [unit, unit])}
                required
              />
              <Field name="quantity" label="Quantité magasin initiale" type="number" min="0" value={itemForm.quantity} onChange={updateItemField} required />
              <Field name="alert_threshold" label="Seuil alerte" type="number" min="0" value={itemForm.alert_threshold} onChange={updateItemField} required />
              <Field name="purchase_price" label="Prix achat unitaire" type="number" min="0" value={itemForm.purchase_price} onChange={updateItemField} required />
              <Field name="sale_margin_rate" label="Taux marge (%)" type="number" min="0" value={itemForm.sale_margin_rate} onChange={updateItemField} required />
            </div>
            <PrimaryButton disabled={isLoading} icon="Plus">Créer le produit</PrimaryButton>
          </form>

          <form onSubmit={createMovement} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle title="Mouvement stock" icon="Truck" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <SelectField name="item_id" label="Produit" value={movementForm.item_id} onChange={updateMovementField} options={items.map((item) => [item.id, item.name])} required />
              <SelectField name="movement_type" label="Type" value={movementForm.movement_type} onChange={updateMovementField} options={Object.entries(movementLabels)} required />
              {movementForm.movement_type !== "IN" && (
                <SelectField
                  name="source_location"
                  label={movementForm.movement_type === "TRANSFER" ? "Source" : "Stock concerné"}
                  value={movementForm.source_location}
                  onChange={updateMovementField}
                  options={getLocationOptions(movementForm.movement_type, selectedMovementItem(items, movementForm.item_id), "source")}
                  required
                />
              )}
              {movementForm.movement_type === "TRANSFER" && (
                <SelectField
                  name="destination_location"
                  label="Destination"
                  value={movementForm.destination_location}
                  onChange={updateMovementField}
                  options={getLocationOptions(movementForm.movement_type, selectedMovementItem(items, movementForm.item_id), "destination")}
                  required
                />
              )}
              <Field name="quantity" label="Quantité" type="number" min="0" value={movementForm.quantity} onChange={updateMovementField} required />
              <Field name="unit_price" label="Prix unitaire achat" type="number" min="0" value={movementForm.unit_price} onChange={updateMovementField} />
              <Field name="destination" label="Service ou motif" value={movementForm.destination} onChange={updateMovementField} />
              <Field name="note" label="Note" value={movementForm.note} onChange={updateMovementField} />
            </div>
            <PrimaryButton disabled={isLoading || !items.length} icon="Truck">Enregistrer le mouvement</PrimaryButton>
          </form>

          <form onSubmit={createDamage} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle title="Casse, avarie ou perte" icon="AlertTriangle" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <SelectField name="item_id" label="Produit" value={damageForm.item_id} onChange={updateDamageField} options={items.map((item) => [item.id, item.name])} required />
              <SelectField
                name="location"
                label="Stock impacté"
                value={damageForm.location}
                onChange={updateDamageField}
                options={getLocationOptions("OUT", selectedMovementItem(items, damageForm.item_id), "source")}
                required
              />
              <Field name="quantity" label="Quantité perdue" type="number" min="0" value={damageForm.quantity} onChange={updateDamageField} required />
              <Field name="estimated_loss" label="Valeur estimée" type="number" min="0" value={damageForm.estimated_loss} onChange={updateDamageField} required />
              <Field name="reason" label="Motif" value={damageForm.reason} onChange={updateDamageField} required />
            </div>
            <PrimaryButton disabled={isLoading || !items.length} icon="TrendingDown">Enregistrer l’avarie</PrimaryButton>
          </form>
        </div>

        <div className="space-y-6">
          <div className="border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_190px]">
                <div className="flex h-12 items-center gap-3 border border-slate-200 bg-white px-4">
                  <DashboardIcon name="Search" size={17} className="text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher produit, unité..."
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                  />
                </div>
                <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="h-12 border border-slate-200 bg-white px-4 text-sm font-black outline-none">
                  <option value="ALL">Tous les produits</option>
                  <option value="LOW">Stock faible</option>
                  <option value="OK">Stock normal</option>
                </select>
              </div>
            </div>
            <StockTable items={filteredItems} />
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <HistoryPanel
              title="Derniers mouvements"
              filter={movementFilter}
              onFilter={setMovementFilter}
              rows={filteredMovements}
              items={items}
            />
            <DamagePanel rows={damages} items={items} canAccount={canAccountDamage} onAccount={accountDamage} />
          </div>
        </div>
      </div>
    </section>
  );
}

function getPageCopy(mode) {
  const copy = {
    movements: ["Mouvements de stock", "Enregistrez entrées, sorties, transferts et ajustements d’inventaire."],
    suppliers: ["Fournisseurs & livraisons", "Suivez les approvisionnements, les coûts d’achat et les entrées de stock."],
    inventory: ["Inventaires", "Surveillez les écarts, les seuils d’alerte et la rotation des produits."],
    purchases: ["Achats fournisseurs", "Saisissez les approvisionnements et les prix d’achat pour suivre les marges."],
    accounting: ["Comptabilité stock", "Suivez la valeur du stock, les pertes et les éléments à comptabiliser."],
    reports: ["Rapports stock & finances", "Exportez les synthèses hebdomadaires et mensuelles pour le pilotage."],
  };
  const [title, subtitle] = copy[mode] ?? ["Stock & comptabilité", "Pilotez les produits, les mouvements, les alertes et les pertes du restaurant."];
  return { title, subtitle };
}

function selectedMovementItem(items, itemId) {
  return items.find((item) => item.id === itemId) ?? null;
}

function getTotalQuantity(item) {
  return Number(item.quantity || 0) + Number(item.kitchen_quantity || 0) + Number(item.drink_quantity || 0);
}

function getLocationOptions(movementType, item, side) {
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

function formatMovementLocations(movement) {
  const source = movement.source_location ? locationLabels[movement.source_location] : "-";
  const destination = movement.destination_location ? locationLabels[movement.destination_location] : "-";
  if (movement.movement_type === "IN") return `vers ${destination}`;
  if (movement.movement_type === "OUT") return `depuis ${source}`;
  if (movement.movement_type === "ADJUSTMENT") return `sur ${source}`;
  return `${source} vers ${destination}`;
}

function numberPayload(payload, fields) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, fields.includes(key) ? Number(value || 0) : value])
  );
}

function SectionTitle({ title, icon }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-[#070528]">{title}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Donnée utilisée dans le suivi opérationnel et comptable.</p>
      </div>
      <div className="flex h-11 w-11 items-center justify-center bg-[#f04438] text-white">
        <DashboardIcon name={icon} size={19} />
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">{label}</span>
      <input
        {...props}
        className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
      />
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">{label}</span>
      <select
        {...props}
        className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
      >
        <option value="">Choisir</option>
        {options.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </label>
  );
}

function PrimaryButton({ children, icon, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-6 inline-flex h-12 items-center justify-center gap-2 bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <DashboardIcon name={icon} size={17} />
      {children}
    </button>
  );
}

function StockTable({ items }) {
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
        margin: (item) => Number(item.sale_margin_rate),
        status: (item) => Number(getTotalQuantity(item) > Number(item.alert_threshold)),
      }),
    [items, sort]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left">
        <thead className="bg-[#fff8f3] text-xs font-black uppercase text-[#b42318]">
          <tr>
            <th className="px-5 py-4"><SortButton label="Produit" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Type" column="type" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Magasin" column="magasin" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Cuisine" column="cuisine" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Boisson" column="boisson" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Seuil" column="threshold" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Prix achat" column="purchase_price" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Marge" column="margin" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
            <th className="px-5 py-4"><SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
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
                <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.sale_margin_rate}%</td>
                <td className="px-5 py-4">
                  <span className={`px-3 py-1 text-xs font-black ${isLow ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                    {isLow ? "Alerte" : "Normal"}
                  </span>
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

function HistoryPanel({ title, filter, onFilter, rows, items }) {
  return (
    <div className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#070528]">{title}</h2>
        <select value={filter} onChange={(event) => onFilter(event.target.value)} className="h-10 border border-slate-200 bg-white px-3 text-xs font-black outline-none">
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
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucun mouvement.</p>}
      </div>
    </div>
  );
}

function DamagePanel({ rows, items, canAccount, onAccount }) {
  return (
    <div className="border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-black text-[#070528]">Avaries & pertes</h2>
      <div className="divide-y divide-slate-100">
        {rows.slice(0, 8).map((damage) => (
          <div key={damage.id} className="py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black text-[#070528]">{items.find((item) => item.id === damage.item_id)?.name ?? "-"}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {locationLabels[damage.location] ?? damage.location} • {damage.reason} • {money(damage.estimated_loss)}
                </p>
              </div>
              {damage.accounted_at ? (
                <span className="bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Comptabilisée</span>
              ) : canAccount ? (
                <button type="button" onClick={() => onAccount(damage)} className="border border-red-100 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50">
                  Comptabiliser
                </button>
              ) : (
                <span className="bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">À valider</span>
              )}
            </div>
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucune avarie.</p>}
      </div>
    </div>
  );
}
