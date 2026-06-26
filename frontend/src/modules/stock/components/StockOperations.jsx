import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Factory,
  PackagePlus,
  PackageX,
  Plus,
  Search,
  Warehouse,
} from "lucide-react";

import { formatApiError } from "@/utils/network";

const tabs = [
  { key: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { key: "products", label: "Produits", icon: Boxes },
  { key: "depots", label: "Dépôts", icon: Warehouse },
  { key: "entries", label: "Entrées", icon: PackagePlus },
  { key: "transfers", label: "Transferts", icon: ArrowLeftRight },
  { key: "outputs", label: "Sorties", icon: PackageX },
  { key: "inventories", label: "Inventaires", icon: ClipboardCheck },
  { key: "reports", label: "Rapports", icon: ClipboardList },
  { key: "alerts", label: "Alertes", icon: AlertTriangle },
];

const movementLabels = {
  ENTRY: "Entrée",
  DIRECT_ENTRY: "Entrée directe",
  TRANSFER: "Transfert",
  OUTPUT: "Sortie",
  LOSS: "Perte",
  INVENTORY_PLUS: "Inventaire +",
  INVENTORY_MINUS: "Inventaire -",
  CANCELLATION: "Annulation",
};

const depotTypeLabels = {
  principal: "Principal",
  cuisine: "Cuisine",
  boisson: "Boisson",
  autre: "Autre",
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
const qty = (value) => Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const emptyProduct = {
  code: "",
  name: "",
  product_type: "INGREDIENT",
  unit_id: "",
  purchase_price: "",
  minimum_stock: "",
};

const emptyDepot = { name: "", code: "", type: "autre", description: "" };

const emptyEntry = {
  movement_date: today(),
  product_id: "",
  destination_depot_id: "",
  quantity: "",
  unit_price: "",
  supplier_id: "",
  reason: "",
  reference: "",
};

const emptyTransfer = {
  movement_date: today(),
  product_id: "",
  source_depot_id: "",
  destination_depot_id: "",
  quantity: "",
  reason: "",
};

const emptyOutput = {
  movement_date: today(),
  product_id: "",
  source_depot_id: "",
  quantity: "",
  reason: "consommation",
  reference: "",
};

export function StockOperations({ apiBaseUrl, mode = "stock", onMessage }) {
  const [activeTab, setActiveTab] = useState(resolveInitialTab(mode));
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [depots, setDepots] = useState([]);
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [report, setReport] = useState(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [depotForm, setDepotForm] = useState(emptyDepot);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [directEntry, setDirectEntry] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransfer);
  const [outputForm, setOutputForm] = useState(emptyOutput);
  const [isLoss, setIsLoss] = useState(false);
  const [inventoryDepotId, setInventoryDepotId] = useState("");
  const [inventoryRows, setInventoryRows] = useState([]);
  const [filters, setFilters] = useState({
    start_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    end_date: today(),
    depot_id: "",
    product_id: "",
    movement_type: "",
  });

  const token = localStorage.getItem("access_token");

  useEffect(() => {
    setActiveTab(resolveInitialTab(mode));
  }, [mode]);

  const visibleProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products;
    return products.filter((product) =>
      [product.code, product.name, product.unit_name, product.unit_symbol]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(value))
    );
  }, [products, query]);

  const lowStock = useMemo(
    () => products.filter((product) => Number(product.current_stock || 0) <= Number(product.minimum_stock || 0)),
    [products]
  );

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!inventoryDepotId && depots[0]) setInventoryDepotId(depots[0].id);
    if (!entryForm.destination_depot_id && depots[0]) setEntryForm((form) => ({ ...form, destination_depot_id: depots[0].id }));
    if (!transferForm.source_depot_id && depots[0]) setTransferForm((form) => ({ ...form, source_depot_id: depots[0].id }));
    if (!outputForm.source_depot_id && depots[0]) setOutputForm((form) => ({ ...form, source_depot_id: depots[0].id }));
  }, [depots]);

  useEffect(() => {
    if (!productForm.unit_id && units[0]) setProductForm((form) => ({ ...form, unit_id: units[0].id }));
    if (!entryForm.product_id && products[0]) {
      setEntryForm((form) => ({ ...form, product_id: products[0].id }));
      setTransferForm((form) => ({ ...form, product_id: products[0].id }));
      setOutputForm((form) => ({ ...form, product_id: products[0].id }));
    }
  }, [units, products]);

  useEffect(() => {
    if (!inventoryDepotId) return;
    setInventoryRows(
      products.map((product) => {
        const depotStock = product.stock_by_depot?.find((row) => row.depot_id === inventoryDepotId);
        return {
          product_id: product.id,
          name: product.name,
          theoretical_quantity: Number(depotStock?.quantity || 0),
          real_quantity: Number(depotStock?.quantity || 0),
        };
      })
    );
  }, [inventoryDepotId, products]);

  async function api(path, options = {}) {
    const fallback = options.fallback || "Action stock impossible.";
    const { fallback: _fallback, ...requestOptions } = options;
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(requestOptions.headers || {}),
      },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(formatApiError(data?.detail ?? data?.message ?? data?.error, fallback));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function loadAll() {
    setIsLoading(true);
    const resources = [
      ["summary", () => api("/api/v1/stock/summary", { fallback: "Résumé stock indisponible." }), setSummary, null],
      ["products", () => api("/api/v1/stock/products", { fallback: "Chargement des produits impossible." }), setProducts, []],
      ["depots", () => api("/api/v1/stock/depots", { fallback: "Chargement des dépôts impossible." }), setDepots, []],
      ["units", () => api("/api/v1/stock/units", { fallback: "Chargement des unités impossible." }), setUnits, []],
      ["suppliers", () => api("/api/v1/stock/suppliers", { fallback: "Chargement des fournisseurs impossible." }), setSuppliers, []],
      ["movements", () => api("/api/v1/stock/movements", { fallback: "Chargement des mouvements impossible." }), setMovements, []],
      ["inventories", () => api("/api/v1/stock/inventories", { fallback: "Chargement des inventaires impossible." }), setInventories, []],
      ["report", () => api("/api/v1/stock/reports", { fallback: "Rapport stock indisponible." }), setReport, null],
    ];
    const results = await Promise.allSettled(resources.map(([, load]) => load()));
    const errors = [];
    results.forEach((result, index) => {
      const [, , setter, fallbackValue] = resources[index];
      if (result.status === "fulfilled") {
        setter(result.value);
        return;
      }
      setter(fallbackValue);
      errors.push(result.reason?.message || "Chargement partiel du stock impossible.");
    });
    if (errors.length) emit([...new Set(errors)].join(" "));
    setIsLoading(false);
  }

  function emit(message) {
    if (onMessage) onMessage(message);
  }

  function productName(id) {
    return products.find((product) => product.id === id)?.name || "Produit";
  }

  function depotName(id) {
    return depots.find((depot) => depot.id === id)?.name || "-";
  }

  function numericPayload(payload, fields) {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, fields.includes(key) ? Number(value || 0) : value || null])
    );
  }

  async function submitProduct(event) {
    event.preventDefault();
    await submit("/api/v1/stock/products", numericPayload(productForm, ["purchase_price", "minimum_stock"]), () => {
      setProductForm({ ...emptyProduct, unit_id: units[0]?.id || "" });
      emit("Produit stock créé.");
    });
  }

  async function submitDepot(event) {
    event.preventDefault();
    await submit("/api/v1/stock/depots", depotForm, () => {
      setDepotForm(emptyDepot);
      emit("Dépôt créé.");
    }, "Création du dépôt impossible.");
  }

  async function submitEntry(event) {
    event.preventDefault();
    const path = directEntry ? "/api/v1/stock/direct-entries" : "/api/v1/stock/entries";
    await submit(path, numericPayload(entryForm, ["quantity", "unit_price"]), () => {
      setEntryForm({ ...emptyEntry, product_id: products[0]?.id || "", destination_depot_id: depots[0]?.id || "" });
      emit(directEntry ? "Entrée directe validée." : "Entrée stock validée.");
    });
  }

  async function submitTransfer(event) {
    event.preventDefault();
    await submit("/api/v1/stock/transfers", numericPayload(transferForm, ["quantity"]), () => {
      setTransferForm({ ...emptyTransfer, product_id: products[0]?.id || "", source_depot_id: depots[0]?.id || "" });
      emit("Transfert validé.");
    });
  }

  async function submitOutput(event) {
    event.preventDefault();
    const path = isLoss ? "/api/v1/stock/losses" : "/api/v1/stock/outputs";
    await submit(path, numericPayload(outputForm, ["quantity"]), () => {
      setOutputForm({ ...emptyOutput, product_id: products[0]?.id || "", source_depot_id: depots[0]?.id || "" });
      emit(isLoss ? "Perte enregistrée." : "Sortie validée.");
    });
  }

  async function submitInventory(event) {
    event.preventDefault();
    await submit(
      "/api/v1/stock/inventories",
      {
        depot_id: inventoryDepotId,
        inventory_date: new Date().toISOString(),
        observation: "Inventaire saisi depuis l'interface stock",
        details: inventoryRows.map((row) => ({ product_id: row.product_id, real_quantity: Number(row.real_quantity || 0) })),
      },
      async (inventory) => {
        await api(`/api/v1/stock/inventories/${inventory.id}/validate`, { method: "PATCH" });
        emit("Inventaire validé et ajustements générés.");
      }
    );
  }

  async function loadReport(event) {
    event?.preventDefault();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      setReport(await api(`/api/v1/stock/reports?${params.toString()}`));
    } catch (error) {
      emit(error.message || "Rapport indisponible.");
    }
  }

  async function submit(path, payload, afterSuccess, fallback = "Action stock impossible.") {
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(payload), fallback });
      if (afterSuccess) await afterSuccess(result);
      await loadAll();
    } catch (error) {
      emit(error.message || fallback);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Gestion de stock multi-dépôts</h2>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${
              activeTab === key ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {isLoading && <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">Chargement...</div>}

      {activeTab === "dashboard" && <Dashboard summary={summary} />}
      {activeTab === "products" && (
        <Products
          products={visibleProducts}
          units={units}
          query={query}
          setQuery={setQuery}
          form={productForm}
          setForm={setProductForm}
          onSubmit={submitProduct}
        />
      )}
      {activeTab === "depots" && <Depots depots={depots} form={depotForm} setForm={setDepotForm} onSubmit={submitDepot} />}
      {activeTab === "entries" && (
        <EntryForm
          form={entryForm}
          setForm={setEntryForm}
          products={products}
          depots={depots}
          suppliers={suppliers}
          directEntry={directEntry}
          setDirectEntry={setDirectEntry}
          onSubmit={submitEntry}
        />
      )}
      {activeTab === "transfers" && (
        <TransferForm form={transferForm} setForm={setTransferForm} products={products} depots={depots} onSubmit={submitTransfer} />
      )}
      {activeTab === "outputs" && (
        <OutputForm form={outputForm} setForm={setOutputForm} products={products} depots={depots} isLoss={isLoss} setIsLoss={setIsLoss} onSubmit={submitOutput} />
      )}
      {activeTab === "inventories" && (
        <InventoryForm
          depots={depots}
          depotId={inventoryDepotId}
          setDepotId={setInventoryDepotId}
          rows={inventoryRows}
          setRows={setInventoryRows}
          onSubmit={submitInventory}
          inventories={inventories}
        />
      )}
      {activeTab === "reports" && (
        <Reports
          filters={filters}
          setFilters={setFilters}
          depots={depots}
          products={products}
          report={report}
          movements={movements}
          onSubmit={loadReport}
          productName={productName}
          depotName={depotName}
        />
      )}
      {activeTab === "alerts" && <Alerts products={lowStock} />}
    </div>
  );
}

function resolveInitialTab(mode) {
  // Clés d'onglet directes (menu nettoyé) : mapping 1:1.
  if (tabs.some((tab) => tab.key === mode)) return mode;
  if (["stock", "stocks", "create-stock-product"].includes(mode)) return "products";
  if (["movements", "stock-in"].includes(mode)) return "entries";
  if (mode === "transfer") return "transfers";
  if (["stock-out", "damages"].includes(mode)) return "outputs";
  if (mode === "inventory") return "inventories";
  if (["reports", "stock-report", "rotation"].includes(mode)) return "reports";
  if (mode === "low-stock") return "alerts";
  return "dashboard";
}

function Dashboard({ summary }) {
  const cards = [
    ["Produits", summary?.product_count, Boxes],
    ["Valeur stock", money(summary?.stock_value), Factory],
    ["Sous seuil", summary?.low_stock_count, AlertTriangle],
    ["Ruptures", summary?.out_of_stock_count, PackageX],
  ];
  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-sm">{label}</span>
              <Icon size={18} />
            </div>
            <strong className="mt-3 block text-2xl text-slate-950">{value ?? 0}</strong>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MovementList title="Dernières entrées" rows={summary?.latest_entries || []} />
        <MovementList title="Dernières sorties" rows={summary?.latest_outputs || []} />
        <MovementList title="Derniers transferts" rows={summary?.latest_transfers || []} />
      </div>
    </section>
  );
}

function MovementList({ title, rows }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.slice(0, 5).map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span>{movementLabels[row.movement_type] || row.movement_type}</span>
            <strong>{qty(row.quantity)}</strong>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-slate-500">Aucun mouvement.</p>}
      </div>
    </div>
  );
}

function Products({ products, units, query, setQuery, form, setForm, onSubmit }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel title="Ajouter un produit">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input label="Code" value={form.code} onChange={(code) => setForm({ ...form, code })} />
          <Input label="Nom" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Select label="Unité" value={form.unit_id} onChange={(unit_id) => setForm({ ...form, unit_id })} options={units.map((unit) => [unit.id, `${unit.name} (${unit.symbol})`])} />
          <Select label="Type" value={form.product_type} onChange={(product_type) => setForm({ ...form, product_type })} options={[["INGREDIENT", "Ingrédient"], ["BOISSON", "Boisson"], ["EMBALLAGE", "Emballage"]]} />
          <Input label="Prix d'achat" type="number" value={form.purchase_price} onChange={(purchase_price) => setForm({ ...form, purchase_price })} />
          <Input label="Seuil minimum" type="number" value={form.minimum_stock} onChange={(minimum_stock) => setForm({ ...form, minimum_stock })} />
          <Submit label="Créer" />
        </form>
      </Panel>
      <Panel title="Produits">
        <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-200 px-3">
          <Search size={16} className="text-slate-400" />
          <input className="min-h-10 flex-1 outline-none" placeholder="Rechercher un produit" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Table
          columns={["Produit", "Unité", "Stock total", "Seuil", "Valeur", "Stock par dépôt"]}
          rows={products.map((product) => [
            <span key="p"><strong>{product.name}</strong><br /><small className="text-slate-500">{product.code || "-"}</small></span>,
            product.unit_symbol || product.unit_name,
            qty(product.current_stock),
            qty(product.minimum_stock),
            money(product.stock_value),
            product.stock_by_depot?.map((row) => `${row.depot_name}: ${qty(row.quantity)}`).join(" | ") || "-",
          ])}
        />
      </Panel>
    </section>
  );
}

function Depots({ depots, form, setForm, onSubmit }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel title="Créer un dépôt">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input label="Nom" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Input label="Code" required value={form.code} onChange={(code) => setForm({ ...form, code: code.toUpperCase() })} />
          <Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={[["principal", "Principal"], ["cuisine", "Cuisine"], ["boisson", "Boisson"], ["autre", "Autre"]]} />
          <Input label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
          <Submit label="Créer" />
        </form>
      </Panel>
      <Panel title="Dépôts">
        <Table columns={["Nom", "Code", "Type", "Statut"]} rows={depots.map((depot) => [depot.name, depot.code, depotTypeLabels[depot.type], depot.is_active ? "Actif" : "Inactif"])} />
      </Panel>
    </section>
  );
}

function EntryForm({ form, setForm, products, depots, suppliers, directEntry, setDirectEntry, onSubmit }) {
  return (
    <Panel title="Entrée de stock">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Input label="Date" type="date" value={form.movement_date} onChange={(movement_date) => setForm({ ...form, movement_date })} />
        <Select label="Produit" value={form.product_id} onChange={(product_id) => setForm({ ...form, product_id })} options={products.map((p) => [p.id, p.name])} />
        <Select label="Dépôt destination" value={form.destination_depot_id} onChange={(destination_depot_id) => setForm({ ...form, destination_depot_id })} options={depots.map((d) => [d.id, d.name])} />
        <Input label="Quantité" type="number" required value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} />
        <Input label="Prix unitaire" type="number" value={form.unit_price} onChange={(unit_price) => setForm({ ...form, unit_price })} />
        <Select label="Fournisseur" value={form.supplier_id} onChange={(supplier_id) => setForm({ ...form, supplier_id })} options={[["", "Non renseigné"], ...suppliers.map((s) => [s.id, s.name])]} />
        <Input label="Observation" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={directEntry} onChange={(event) => setDirectEntry(event.target.checked)} /> Entrée directe</label>
        <Submit label="Valider l'entrée" />
      </form>
    </Panel>
  );
}

function TransferForm({ form, setForm, products, depots, onSubmit }) {
  return (
    <Panel title="Transfert entre dépôts">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Input label="Date" type="date" value={form.movement_date} onChange={(movement_date) => setForm({ ...form, movement_date })} />
        <Select label="Produit" value={form.product_id} onChange={(product_id) => setForm({ ...form, product_id })} options={products.map((p) => [p.id, p.name])} />
        <Select label="Dépôt source" value={form.source_depot_id} onChange={(source_depot_id) => setForm({ ...form, source_depot_id })} options={depots.map((d) => [d.id, d.name])} />
        <Select label="Dépôt destination" value={form.destination_depot_id} onChange={(destination_depot_id) => setForm({ ...form, destination_depot_id })} options={depots.map((d) => [d.id, d.name])} />
        <Input label="Quantité" type="number" required value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} />
        <Input label="Motif" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <Submit label="Valider le transfert" />
      </form>
    </Panel>
  );
}

function OutputForm({ form, setForm, products, depots, isLoss, setIsLoss, onSubmit }) {
  return (
    <Panel title="Sortie de stock">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Input label="Date" type="date" value={form.movement_date} onChange={(movement_date) => setForm({ ...form, movement_date })} />
        <Select label="Produit" value={form.product_id} onChange={(product_id) => setForm({ ...form, product_id })} options={products.map((p) => [p.id, p.name])} />
        <Select label="Dépôt source" value={form.source_depot_id} onChange={(source_depot_id) => setForm({ ...form, source_depot_id })} options={depots.map((d) => [d.id, d.name])} />
        <Input label="Quantité" type="number" required value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} />
        <Select label="Motif" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} options={[["consommation", "Consommation"], ["vente", "Vente"], ["perte", "Perte"], ["casse", "Casse"], ["perime", "Périmé"], ["autre", "Autre"]]} />
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={isLoss} onChange={(event) => setIsLoss(event.target.checked)} /> Comptabiliser comme perte</label>
        <Submit label="Valider la sortie" />
      </form>
    </Panel>
  );
}

function InventoryForm({ depots, depotId, setDepotId, rows, setRows, onSubmit, inventories }) {
  return (
    <section className="space-y-4">
      <Panel title="Inventaire">
        <form onSubmit={onSubmit} className="space-y-3">
          <Select label="Dépôt" value={depotId} onChange={setDepotId} options={depots.map((d) => [d.id, d.name])} />
          <Table
            columns={["Produit", "Théorique", "Réel", "Écart"]}
            rows={rows.map((row, index) => [
              row.name,
              qty(row.theoretical_quantity),
              <input key={row.product_id} className="min-h-9 w-28 rounded-md border border-slate-200 px-2" type="number" value={row.real_quantity} onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, real_quantity: event.target.value };
                setRows(next);
              }} />,
              qty(Number(row.real_quantity || 0) - Number(row.theoretical_quantity || 0)),
            ])}
          />
          <Submit label="Valider l'inventaire" />
        </form>
      </Panel>
      <Panel title="Historique inventaires">
        <Table columns={["Date", "Dépôt", "Statut", "Lignes"]} rows={inventories.map((inventory) => [new Date(inventory.inventory_date).toLocaleDateString("fr-FR"), inventory.depot_id, inventory.status, inventory.details?.length || 0])} />
      </Panel>
    </section>
  );
}

function Reports({ filters, setFilters, depots, products, report, movements, onSubmit, productName, depotName }) {
  const rows = report?.movements || movements;
  return (
    <Panel title="Rapports de stock">
      <form onSubmit={onSubmit} className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Input label="Début" type="date" value={filters.start_date} onChange={(start_date) => setFilters({ ...filters, start_date })} />
        <Input label="Fin" type="date" value={filters.end_date} onChange={(end_date) => setFilters({ ...filters, end_date })} />
        <Select label="Dépôt" value={filters.depot_id} onChange={(depot_id) => setFilters({ ...filters, depot_id })} options={[["", "Tous"], ...depots.map((d) => [d.id, d.name])]} />
        <Select label="Produit" value={filters.product_id} onChange={(product_id) => setFilters({ ...filters, product_id })} options={[["", "Tous"], ...products.map((p) => [p.id, p.name])]} />
        <Select label="Type" value={filters.movement_type} onChange={(movement_type) => setFilters({ ...filters, movement_type })} options={[["", "Tous"], ...Object.entries(movementLabels)]} />
        <Submit label="Filtrer" />
      </form>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MiniStat label="Valeur stock" value={money(report?.stock_value)} />
        <MiniStat label="Entrées" value={money(report?.entries_value)} />
        <MiniStat label="Sorties" value={money(report?.outputs_value)} />
        <MiniStat label="Stock faible" value={report?.low_stock_count || 0} />
      </div>
      <Table
        columns={["Date", "Type", "Produit", "Source", "Destination", "Quantité", "Montant"]}
        rows={rows.map((movement) => [
          new Date(movement.movement_date || movement.created_at).toLocaleDateString("fr-FR"),
          movementLabels[movement.movement_type] || movement.movement_type,
          productName(movement.product_id),
          depotName(movement.source_depot_id),
          depotName(movement.destination_depot_id),
          qty(movement.quantity),
          money(movement.total_amount),
        ])}
      />
    </Panel>
  );
}

function Alerts({ products }) {
  return (
    <Panel title="Produits sous seuil minimum">
      <Table columns={["Produit", "Stock", "Seuil", "Valeur"]} rows={products.map((product) => [product.name, qty(product.current_stock), qty(product.minimum_stock), money(product.stock_value)])} />
    </Panel>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-lg font-semibold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-1 block text-lg text-slate-950">{value}</strong>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        required={required}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        className="min-h-10 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-slate-500"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <select className="min-h-10 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-slate-500" value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, labelText]) => <option key={optionValue || "empty"} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function Submit({ label }) {
  return (
    <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white">
      <Plus size={16} />
      {label}
    </button>
  );
}

function Table({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {columns.map((column) => <th key={column} className="px-3 py-2 font-medium">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 align-top text-slate-700">{cell}</td>)}
            </tr>
          ))}
          {!rows.length && (
            <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={columns.length}>Aucune donnée.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
