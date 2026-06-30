import { useEffect, useMemo, useState } from "react";

import {
  FilterBar,
  LoadingState,
  PageContainer,
  PageHeader,
  SecondaryAction,
} from "@/modules/admin/components/AdminUi";
import { formatApiError } from "@/utils/network";

import { today, uniqueDepots } from "./shared/format";
import {
  emptyDepot,
  emptyEntry,
  emptyOutput,
  emptyProduct,
  emptyTransfer,
  tabs,
} from "./shared/constants";
import { Dashboard } from "./Dashboard/Dashboard";
import { ProductCreate } from "./Produit/Create";
import { ProductList } from "./Produit/List";
import { DepotCreate } from "./Depot/Create";
import { DepotList } from "./Depot/List";
import { EntryCreate } from "./Entree/Create";
import { EntryList } from "./Entree/List";
import { TransferCreate } from "./Transfert/Create";
import { OutputCreate } from "./Sortie/Create";
import { InventoryForm } from "./Inventaire/Form";
import { LotList } from "./Lot/List";
import { Reports } from "./Rapport/Reports";
import { Alerts } from "./Alerte/Alerts";

export function StockOperations({ apiBaseUrl, mode = "stock", onMessage }) {
  const [activeTab, setActiveTab] = useState(resolveInitialTab(mode));
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [depots, setDepots] = useState([]);
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [lots, setLots] = useState([]);
  const [report, setReport] = useState(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [depotForm, setDepotForm] = useState(emptyDepot);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [entryView, setEntryView] = useState("list");
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

  const uniqueProducts = useMemo(
    () =>
      products.filter(
        (product, index, list) =>
          index === list.findIndex((item) => item.id === product.id),
      ),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return uniqueProducts;
    return uniqueProducts.filter((product) =>
      [product.code, product.name, product.unit_name, product.unit_symbol]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(value)),
    );
  }, [uniqueProducts, query]);

  const lowStock = useMemo(
    () =>
      uniqueProducts.filter(
        (product) =>
          Number(product.current_stock || 0) <=
          Number(product.minimum_stock || 0),
      ),
    [uniqueProducts],
  );

  const visibleDepots = useMemo(() => uniqueDepots(depots), [depots]);
  const entryMovements = useMemo(
    () =>
      movements.filter((movement) =>
        ["ENTRY", "DIRECT_ENTRY"].includes(movement.movement_type),
      ),
    [movements],
  );

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!inventoryDepotId && visibleDepots[0])
      setInventoryDepotId(visibleDepots[0].id);
    if (!entryForm.destination_depot_id && visibleDepots[0])
      setEntryForm((form) => ({
        ...form,
        destination_depot_id: visibleDepots[0].id,
      }));
    if (visibleDepots[0])
      setTransferForm((form) => {
        const sourceId = form.source_depot_id || visibleDepots[0].id;
        const destinationId =
          form.destination_depot_id && form.destination_depot_id !== sourceId
            ? form.destination_depot_id
            : visibleDepots.find((depot) => depot.id !== sourceId)?.id || "";
        if (
          sourceId === form.source_depot_id &&
          destinationId === form.destination_depot_id
        )
          return form;
        return {
          ...form,
          source_depot_id: sourceId,
          destination_depot_id: destinationId,
        };
      });
    if (!outputForm.source_depot_id && visibleDepots[0])
      setOutputForm((form) => ({
        ...form,
        source_depot_id: visibleDepots[0].id,
      }));
  }, [visibleDepots]);

  useEffect(() => {
    if (!productForm.unit_id && units[0])
      setProductForm((form) => ({ ...form, unit_id: units[0].id }));
    if (!entryForm.product_id && products[0]) {
      setEntryForm((form) => ({ ...form, product_id: products[0].id }));
      setTransferForm((form) => ({ ...form, product_id: products[0].id }));
      setOutputForm((form) => ({ ...form, product_id: products[0].id }));
    }
  }, [units, products]);

  useEffect(() => {
    if (!inventoryDepotId) return;
    loadInventoryRows(inventoryDepotId);
  }, [inventoryDepotId]);

  useEffect(() => {
    if (!filters.depot_id) return;
    loadReport();
  }, [filters.depot_id]);

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
      throw new Error(
        formatApiError(
          Array.isArray(data?.detail)
            ? data.detail
                .map((item) => item.msg || item.message || item.type)
                .filter(Boolean)
                .join(" ")
            : (data?.detail ?? data?.message ?? data?.error),
          fallback,
        ),
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function loadAll() {
    setIsLoading(true);
    const resources = [
      [
        "summary",
        () =>
          api("/api/v1/stock/summary", {
            fallback: "Résumé stock indisponible.",
          }),
        setSummary,
        null,
      ],
      [
        "products",
        () =>
          api("/api/v1/stock/products", {
            fallback: "Chargement des produits impossible.",
          }),
        setProducts,
        [],
      ],
      [
        "depots",
        () =>
          api("/api/v1/stock/depots", {
            fallback: "Chargement des dépôts impossible.",
          }),
        setDepots,
        [],
      ],
      [
        "units",
        () =>
          api("/api/v1/stock/units", {
            fallback: "Chargement des unités impossible.",
          }),
        setUnits,
        [],
      ],
      [
        "suppliers",
        () =>
          api("/api/v1/stock/suppliers", {
            fallback: "Chargement des fournisseurs impossible.",
          }),
        setSuppliers,
        [],
      ],
      [
        "movements",
        () =>
          api("/api/v1/stock/movements", {
            fallback: "Chargement des mouvements impossible.",
          }),
        setMovements,
        [],
      ],
      [
        "inventories",
        () =>
          api("/api/v1/stock/inventories", {
            fallback: "Chargement des inventaires impossible.",
          }),
        setInventories,
        [],
      ],
      [
        "lots",
        () =>
          api("/api/v1/stock/lots", {
            fallback: "Chargement des lots impossible.",
          }),
        setLots,
        [],
      ],
      [
        "report",
        () =>
          api("/api/v1/stock/reports", {
            fallback: "Rapport stock indisponible.",
          }),
        setReport,
        null,
      ],
    ];
    const results = await Promise.allSettled(
      resources.map(([, load]) => load()),
    );
    results.forEach((result, index) => {
      const [resourceName, , setter, fallbackValue] = resources[index];
      if (result.status === "fulfilled") {
        setter(result.value);
        return;
      }
      setter(fallbackValue);
      if (["products", "depots", "units"].includes(resourceName)) {
        emit(result.reason?.message || "Chargement partiel du stock impossible.");
      }
    });
    setIsLoading(false);
  }

  async function loadInventoryRows(depotId) {
    try {
      const rows = await api(`/api/v1/stock/depots/${depotId}/stock`, {
        fallback: "Chargement du stock du dépôt impossible.",
      });
      setInventoryRows(
        rows.map((row) => ({
          product_id: row.product_id,
          name: row.product_name,
          theoretical_quantity: Number(row.quantity || 0),
          real_quantity: Number(row.quantity || 0),
          justification: "",
        })),
      );
    } catch (error) {
      setInventoryRows([]);
      emit(error.message || "Stock du dépôt indisponible.");
    }
  }

  function emit(message) {
    if (onMessage) onMessage(message);
  }

  function productName(id) {
    return products.find((product) => product.id === id)?.name || "Produit";
  }

  function depotName(id) {
    return visibleDepots.find((depot) => depot.id === id)?.name || "-";
  }

  function numericPayload(payload, fields) {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [
        key,
        fields.includes(key) ? Number(value || 0) : value || null,
      ]),
    );
  }

  function optionalText(value) {
    const normalized = String(value || "").trim();
    return normalized || undefined;
  }

  function dateToApiDateTime(value) {
    return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
  }

  async function submitProduct(event) {
    event.preventDefault();
    const productPayload = {
      code: productForm.code?.trim() || null,
      name: productForm.name?.trim(),
      unit_id: productForm.unit_id || null,
      minimum_stock: Number(productForm.minimum_stock || 0),
      product_type: productForm.product_type || "INGREDIENT",
    };
    await submit(
      "/api/v1/stock/products",
      productPayload,
      () => {
        setProductForm({ ...emptyProduct, unit_id: units[0]?.id || "" });
        setActiveTab("products");
        emit("Produit stock créé.");
      },
      "Création du produit impossible.",
    );
  }

  async function submitDepot(event) {
    event.preventDefault();
    await submit(
      "/api/v1/stock/depots",
      depotForm,
      () => {
        setDepotForm(emptyDepot);
        emit("Dépôt créé.");
      },
      "Création du dépôt impossible.",
    );
  }

  async function submitEntry(event) {
    event.preventDefault();
    const path = directEntry
      ? "/api/v1/stock/direct-entries"
      : "/api/v1/stock/entries";
    const payload = {
      ...numericPayload(entryForm, ["quantity", "unit_price"]),
      in_purchase_unit: !!entryForm.in_purchase_unit,
      lot_number: entryForm.lot_number || null,
      expiry_date: entryForm.expiry_date || null,
    };
    await submit(
      path,
      payload,
      () => {
        setEntryForm({
          ...emptyEntry,
          product_id: products[0]?.id || "",
          destination_depot_id: visibleDepots[0]?.id || "",
        });
        setActiveTab("entries");
        setEntryView("list");
        emit(directEntry ? "Entrée directe validée." : "Entrée stock validée.");
      },
      directEntry ? "Création de l'entrée directe impossible." : "Création de l'entrée stock impossible.",
    );
  }

  async function submitTransfer(event) {
    event.preventDefault();
    if (!transferForm.product_id) {
      emit("Sélectionnez un produit à transférer.");
      return;
    }
    if (!transferForm.source_depot_id || !transferForm.destination_depot_id) {
      emit("Sélectionnez un dépôt source et un dépôt destination.");
      return;
    }
    if (transferForm.source_depot_id === transferForm.destination_depot_id) {
      emit("Le dépôt source et le dépôt destination doivent être différents.");
      return;
    }
    const payload = {
      movement_date: dateToApiDateTime(transferForm.movement_date),
      product_id: String(transferForm.product_id || ""),
      source_depot_id: String(transferForm.source_depot_id || ""),
      destination_depot_id: String(transferForm.destination_depot_id || ""),
      quantity: Number(transferForm.quantity || 0),
      production_cost:
        transferForm.production_cost === "" || transferForm.production_cost == null
          ? undefined
          : Number(transferForm.production_cost),
      reason: optionalText(transferForm.reason),
      reference: optionalText(transferForm.reference),
    };
    await submit(
      "/api/v1/stock/transfers",
      Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined),
      ),
      () => {
        setTransferForm({
          ...emptyTransfer,
          product_id: products[0]?.id || "",
          source_depot_id: visibleDepots[0]?.id || "",
          destination_depot_id:
            visibleDepots.find((depot) => depot.id !== visibleDepots[0]?.id)
              ?.id || "",
        });
        setActiveTab("transfers");
        emit("Transfert validé.");
      },
      "Création du transfert impossible.",
    );
  }

  async function submitOutput(event) {
    event.preventDefault();
    const path = isLoss ? "/api/v1/stock/losses" : "/api/v1/stock/outputs";
    await submit(path, numericPayload(outputForm, ["quantity"]), () => {
      setOutputForm({
        ...emptyOutput,
        product_id: products[0]?.id || "",
        source_depot_id: visibleDepots[0]?.id || "",
      });
      setActiveTab("outputs");
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
        details: inventoryRows.map((row) => ({
          product_id: row.product_id,
          real_quantity: Number(row.real_quantity || 0),
          justification: row.justification || null,
        })),
      },
      async (inventory) => {
        await api(`/api/v1/stock/inventories/${inventory.id}/validate`, {
          method: "PATCH",
        });
        setActiveTab("inventories");
        emit("Inventaire validé et ajustements générés.");
      },
    );
  }

  async function loadReport(event) {
    event?.preventDefault();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      setIsReportLoading(true);
      setReport(await api(`/api/v1/stock/reports?${params.toString()}`));
    } catch (error) {
      emit(error.message || "Rapport indisponible.");
    } finally {
      setIsReportLoading(false);
    }
  }

  async function submit(
    path,
    payload,
    afterSuccess,
    fallback = "Action stock impossible.",
  ) {
    let result = null;
    try {
      result = await api(path, {
        method: "POST",
        body: JSON.stringify(payload),
        fallback,
      });
    } catch (error) {
      emit(error.message || fallback);
      return;
    }
    if (afterSuccess) await afterSuccess(result);
    try {
      await loadAll();
    } catch (error) {
      emit(error.message || "Action effectuée, mais le rafraîchissement des données a échoué.");
    }
  }

  async function auditExport(reportType, format) {
    try {
      await api("/api/v1/stock/reports/export-audit", {
        method: "POST",
        body: JSON.stringify({ report_type: reportType, format }),
        fallback: "Journalisation de l'export impossible.",
      });
    } catch (error) {
      emit(error.message || "Journalisation de l'export impossible.");
    }
  }

  const activeTabLabel =
    tabs.find((tab) => tab.key === activeTab)?.label || "Stock";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Gestionnaire de stock"
        title="Gestion de stock multi-dépôts"
        subtitle="Pilotez les produits, dépôts, mouvements, inventaires et rapports depuis une interface unifiée."
        primaryAction={
          <SecondaryAction
            icon="Plus"
            onClick={() => {
              setActiveTab("entries");
              setEntryView("create");
            }}
          >
            Nouvelle entrée
          </SecondaryAction>
        }
        secondaryActions={
          <SecondaryAction icon="BarChart3" onClick={() => setActiveTab("reports")}>
            Rapports
          </SecondaryAction>
        }
        meta={[
          <span key="active">Vue active : {activeTabLabel}</span>,
          <span key="products">{uniqueProducts.length.toLocaleString("fr-FR")} produit(s)</span>,
          <span key="depots">{visibleDepots.length.toLocaleString("fr-FR")} dépôt(s)</span>,
          <span key="alerts">{lowStock.length.toLocaleString("fr-FR")} alerte(s)</span>,
        ]}
      />
      <FilterBar className="overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTab(key);
              if (key === "entries") setEntryView("list");
            }}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-black transition ${
              activeTab === key
                ? "bg-slate-950 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </FilterBar>

      {isLoading && <LoadingState label="Chargement des données stock..." />}

      {activeTab === "dashboard" && <Dashboard summary={summary} />}

      {activeTab === "products" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <ProductCreate
            units={units}
            form={productForm}
            setForm={setProductForm}
            onSubmit={submitProduct}
          />
          <ProductList
            products={visibleProducts}
            query={query}
            setQuery={setQuery}
          />
        </section>
      )}

      {activeTab === "depots" && (
        <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <DepotCreate
            form={depotForm}
            setForm={setDepotForm}
            onSubmit={submitDepot}
          />
          <DepotList depots={visibleDepots} />
        </section>
      )}

      {activeTab === "entries" && (
        <>
          {entryView === "create" ? (
            <EntryCreate
              form={entryForm}
              setForm={setEntryForm}
              products={products}
              depots={visibleDepots}
              suppliers={suppliers}
              directEntry={directEntry}
              setDirectEntry={setDirectEntry}
              onSubmit={submitEntry}
            />
          ) : (
            <EntryList
              entries={entryMovements}
              productName={productName}
              depotName={depotName}
              onCreate={() => setEntryView("create")}
            />
          )}
        </>
      )}

      {activeTab === "transfers" && (
        <TransferCreate
          form={transferForm}
          setForm={setTransferForm}
          products={products}
          depots={visibleDepots}
          onSubmit={submitTransfer}
        />
      )}

      {activeTab === "outputs" && (
        <OutputCreate
          form={outputForm}
          setForm={setOutputForm}
          products={products}
          depots={visibleDepots}
          isLoss={isLoss}
          setIsLoss={setIsLoss}
          onSubmit={submitOutput}
        />
      )}

      {activeTab === "inventories" && (
        <InventoryForm
          depots={visibleDepots}
          depotId={inventoryDepotId}
          setDepotId={setInventoryDepotId}
          rows={inventoryRows}
          setRows={setInventoryRows}
          onSubmit={submitInventory}
          onExport={auditExport}
          inventories={inventories}
        />
      )}

      {activeTab === "reports" && (
        <Reports
          filters={filters}
          setFilters={setFilters}
          depots={visibleDepots}
          products={products}
          report={report}
          movements={movements}
          onSubmit={loadReport}
          isLoading={isReportLoading}
          onExport={auditExport}
          productName={productName}
          depotName={depotName}
        />
      )}

      {activeTab === "lots" && (
        <LotList lots={lots} productName={productName} depotName={depotName} />
      )}

      {activeTab === "alerts" && <Alerts products={lowStock} />}
    </PageContainer>
  );
}

function resolveInitialTab(mode) {
  // Clés d'onglet directes (menu nettoyé) : mapping 1:1.
  if (tabs.some((tab) => tab.key === mode)) return mode;
  if (["stock", "stocks", "create-stock-product"].includes(mode))
    return "products";
  if (["movements", "stock-in"].includes(mode)) return "entries";
  if (mode === "transfer") return "transfers";
  if (["stock-out", "damages"].includes(mode)) return "outputs";
  if (mode === "inventory") return "inventories";
  if (["reports", "stock-report", "rotation"].includes(mode)) return "reports";
  if (mode === "low-stock") return "alerts";
  return "dashboard";
}
