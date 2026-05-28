import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { enqueueOfflineAction, friendlyNetworkMessage, isNetworkError } from "@/utils/network";

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

const emptyRecipe = {
  menu_item_id: "",
  stock_item_id: "",
  quantity_per_dish: "",
  location: "CUISINE",
};

const emptyProduction = {
  menu_item_id: "",
  quantity: "",
  note: "",
};

const emptyExpense = {
  label: "",
  category: "Charges",
  amount: "",
  payment_method: "",
  reference: "",
  expense_date: new Date().toISOString().slice(0, 10),
  note: "",
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
  const [recipes, setRecipes] = useState([]);
  const [productionSheets, setProductionSheets] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [report, setReport] = useState(null);
  const [finance, setFinance] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [margins, setMargins] = useState([]);
  const [rotation, setRotation] = useState([]);
  const [summary, setSummary] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItemId, setEditingItemId] = useState(null);
  const [movementForm, setMovementForm] = useState(emptyMovement);
  const [damageForm, setDamageForm] = useState(emptyDamage);
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [productionForm, setProductionForm] = useState(emptyProduction);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [reportRange, setReportRange] = useState({
    start_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [movementFilter, setMovementFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(false);

  const token = localStorage.getItem("access_token");
  const canAccountDamage = role === "ADMIN" || role === "COMPTABLE";
  const canEditAccounting = role === "ADMIN" || role === "COMPTABLE";
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
    try {
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
    } catch (error) {
      throw new Error(friendlyNetworkMessage(error, "Opération impossible."));
    }
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
      const [menuData, recipeData, productionData] = await Promise.all([
        api("/api/v1/stock/menu-items").catch(() => []),
        api("/api/v1/stock/recipes").catch(() => []),
        api("/api/v1/stock/production-sheets").catch(() => []),
      ]);
      setMenuItems(menuData);
      setRecipes(recipeData);
      setProductionSheets(productionData);
      setMovementForm((current) => ({ ...current, item_id: current.item_id || itemData[0]?.id || "" }));
      setDamageForm((current) => ({ ...current, item_id: current.item_id || itemData[0]?.id || "" }));
      setRecipeForm((current) => ({
        ...current,
        menu_item_id: current.menu_item_id || menuData[0]?.id || "",
        stock_item_id: current.stock_item_id || itemData[0]?.id || "",
      }));
      setProductionForm((current) => ({ ...current, menu_item_id: current.menu_item_id || menuData[0]?.id || "" }));
      await loadReport(reportRange);
      await loadFinance(reportRange);
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
      const payload = numberPayload(itemForm, [
        "quantity",
        "kitchen_quantity",
        "drink_quantity",
        "alert_threshold",
        "purchase_price",
        "sale_margin_rate",
      ]);
      const created = await api(editingItemId ? `/api/v1/stock/items/${editingItemId}` : "/api/v1/stock/items", {
        method: editingItemId ? "PATCH" : "POST",
        body: JSON.stringify(
          editingItemId
            ? payload
            : payload
        ),
      });
      setItems((current) => editingItemId ? current.map((item) => item.id === created.id ? created : item) : [created, ...current]);
      setItemForm(emptyItem);
      setEditingItemId(null);
      await loadStock();
      onMessage(`Produit stock "${created.name}" ${editingItemId ? "modifié" : "créé"}.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function editItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      product_type: item.product_type,
      unit: item.unit,
      quantity: String(item.quantity),
      kitchen_quantity: String(item.kitchen_quantity),
      drink_quantity: String(item.drink_quantity),
      alert_threshold: String(item.alert_threshold),
      purchase_price: String(item.purchase_price),
      sale_margin_rate: String(item.sale_margin_rate),
    });
  }

  async function createMovement(event) {
    event.preventDefault();
    setIsLoading(true);
    const movementType = isSupplyView ? "IN" : movementForm.movement_type;
    const movementPayload = isSupplyView
      ? {
          item_id: movementForm.item_id,
          movement_type: "IN",
          quantity: Number(movementForm.quantity || 0),
          unit_price: Number(movementForm.unit_price || 0),
          note: movementForm.note || null,
        }
      : {
          ...numberPayload(movementForm, ["quantity", "unit_price"]),
          movement_type: movementType,
          unit_price: Number(movementForm.unit_price || 0),
          destination: movementForm.destination || null,
          note: movementForm.note || null,
        };
    try {
      await api("/api/v1/stock/movements", {
        method: "POST",
        body: JSON.stringify(movementPayload),
      });
      setMovementForm({ ...emptyMovement, movement_type: movementType, item_id: movementForm.item_id });
      await loadStock();
      onMessage(isSupplyView ? "Approvisionnement enregistré en stock magasin." : "Mouvement de stock enregistré.");
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueOfflineAction({
          label: isSupplyView ? "Approvisionnement stock" : "Mouvement stock",
          requests: [
            {
              path: "/api/v1/stock/movements",
              method: "POST",
              requiresAuth: true,
              body: movementPayload,
            },
          ],
        });
        setMovementForm({ ...emptyMovement, movement_type: movementType, item_id: movementForm.item_id });
        onMessage("Connexion indisponible. Le mouvement est mis en attente et sera synchronisé automatiquement.");
      } else {
        onMessage(error.message);
      }
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

  async function createRecipe(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await api("/api/v1/stock/recipes", {
        method: "POST",
        body: JSON.stringify(numberPayload(recipeForm, ["quantity_per_dish"])),
      });
      setRecipeForm((current) => ({ ...emptyRecipe, menu_item_id: current.menu_item_id, stock_item_id: current.stock_item_id }));
      await loadStock();
      onMessage("Ingrédient lié au plat.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteRecipe(link) {
    setIsLoading(true);
    try {
      await api(`/api/v1/stock/recipes/${link.id}`, { method: "DELETE" });
      await loadStock();
      onMessage("Liaison supprimée.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createProductionSheet(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await api("/api/v1/stock/production-sheets", {
        method: "POST",
        body: JSON.stringify(numberPayload(productionForm, ["quantity"])),
      });
      setProductionForm((current) => ({ ...emptyProduction, menu_item_id: current.menu_item_id }));
      await loadStock();
      onMessage("Fiche de production créée et stock cuisine déduit.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadReport(range = reportRange) {
    const query = new URLSearchParams({
      start_date: `${range.start_date}T00:00:00`,
      end_date: `${range.end_date}T23:59:59`,
    });
    const data = await api(`/api/v1/stock/reports?${query.toString()}`);
    setReport(data);
  }

  async function loadFinance(range = reportRange) {
    const query = new URLSearchParams({
      start_date: `${range.start_date}T00:00:00`,
      end_date: `${range.end_date}T23:59:59`,
    });
    const [summaryData, expenseData, paymentData, marginData, rotationData] = await Promise.all([
      api(`/api/v1/finance/summary?${query.toString()}`).catch(() => null),
      api(`/api/v1/finance/expenses?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/payments?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/dish-margins?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/stock-rotation?${query.toString()}`).catch(() => []),
    ]);
    setFinance(summaryData);
    setExpenses(expenseData);
    setPayments(paymentData);
    setMargins(marginData);
    setRotation(rotationData);
  }

  async function submitReport(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await loadReport(reportRange);
      await loadFinance(reportRange);
      onMessage("Rapport stock généré.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createExpense(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await api("/api/v1/finance/expenses", {
        method: "POST",
        body: JSON.stringify({
          ...expenseForm,
          amount: Number(expenseForm.amount || 0),
          payment_method: expenseForm.payment_method || null,
          reference: expenseForm.reference || null,
          note: expenseForm.note || null,
          expense_date: `${expenseForm.expense_date}T12:00:00`,
        }),
      });
      setExpenseForm(emptyExpense);
      await loadFinance(reportRange);
      onMessage("Dépense enregistrée.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteExpense(expense) {
    setIsLoading(true);
    try {
      await api(`/api/v1/finance/expenses/${expense.id}`, { method: "DELETE" });
      await loadFinance(reportRange);
      onMessage("Dépense supprimée.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function exportExcel() {
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
      [],
      ["Finances"],
      ["CA", finance?.revenue ?? 0],
      ["Dépenses", finance?.expenses ?? 0],
      ["Pertes", finance?.damage_loss ?? 0],
      ["Bénéfice net", finance?.net_profit ?? 0],
      [],
      ["Dépense", "Catégorie", "Montant", "Date", "Référence"],
      ...expenses.map((expense) => [
        expense.label,
        expense.category,
        expense.amount,
        new Date(expense.expense_date).toLocaleDateString("fr-FR"),
        expense.reference ?? "",
      ]),
    ];
    const tableRows = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
    const html = `<html><head><meta charset="utf-8" /></head><body><table border="1">${tableRows}</table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    printHtmlDocument(
      buildPdfReport({
        title: pageCopy.title,
        range: reportRange,
        summary,
        report,
        finance,
        items,
        movements,
        expenses,
        payments,
        margins,
        rotation,
      }),
      () => {
      onMessage("Export PDF bloqué par le navigateur. Autorisez les fenêtres pop-up puis réessayez.");
      }
    );
  }

  const isStockHome = ["stocks", "stock"].includes(mode);
  const isMovementView = mode === "movements";
  const isSupplyView = ["suppliers", "purchases"].includes(mode);
  const isInventoryView = mode === "inventory";
  const isAccountingView = mode === "accounting";
  const isReportView = mode === "reports";
  const effectiveMovementType = isSupplyView ? "IN" : movementForm.movement_type;
  const showReferenceForm = isStockHome || isSupplyView;
  const showMovementForm = isMovementView || isSupplyView;
  const showDamageForm = isInventoryView || isAccountingView;
  const showProductionForms = isStockHome;
  const showStockTable = isStockHome || isInventoryView || isSupplyView;
  const showHistory = isMovementView || isSupplyView || isInventoryView;
  const showFinance = isAccountingView;
  const showReports = isReportView;
  const showLeftColumn = showReferenceForm || showMovementForm || showDamageForm;
  const showRightColumn = showProductionForms || showReports || showFinance || showStockTable || showHistory || isAccountingView;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase text-[#f04438]">Gestionnaire stock / Comptable</p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">{pageCopy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">{pageCopy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={exportExcel} className="inline-flex h-12 items-center gap-2 border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]">
            <DashboardIcon name="FileText" size={17} />
            Exporter en Excel
          </button>
          <button type="button" onClick={exportPdf} className="inline-flex h-12 items-center gap-2 border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]">
            <DashboardIcon name="ReceiptText" size={17} />
            Exporter en PDF
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

      {isSupplyView && <SupplyGuide />}

      <div className={showLeftColumn && showRightColumn ? "grid gap-6 xl:grid-cols-[0.9fr_1.1fr]" : "space-y-6"}>
        {showLeftColumn && (
        <div className="space-y-6">
          {showReferenceForm && (
          <form onSubmit={createItem} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title={isSupplyView ? "Créer un produit stock" : "Référence stock"}
              subtitle={isSupplyView ? "Créez ici le produit à approvisionner s’il n’existe pas encore." : "Définissez les produits suivis dans le magasin, la cuisine ou le stock boisson."}
              icon="Package"
            />
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
            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={isLoading} icon={editingItemId ? "Pencil" : "Plus"}>{editingItemId ? "Modifier le produit" : "Créer le produit"}</PrimaryButton>
              {editingItemId && (
                <button type="button" onClick={() => { setEditingItemId(null); setItemForm(emptyItem); }} className="mt-6 h-12 border border-slate-200 px-5 text-sm font-black text-slate-700">
                  Annuler
                </button>
              )}
            </div>
          </form>
          )}

          {showMovementForm && (
          <form onSubmit={createMovement} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title={isSupplyView ? "Approvisionnement magasin" : "Mouvement stock"}
              subtitle={isSupplyView ? "Sélectionnez un produit stock existant, puis saisissez la quantité reçue et le prix d’achat. Aucun fournisseur n’est requis." : "Enregistrez une entrée, une sortie, un transfert ou un ajustement."}
              icon="Truck"
            />
            {!items.length && (
              <div className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Aucun produit stock n’existe encore. Créez d’abord une référence stock dans le formulaire au-dessus.
              </div>
            )}
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <SelectField name="item_id" label="Produit" value={movementForm.item_id} onChange={updateMovementField} options={items.map((item) => [item.id, item.name])} required />
              {isSupplyView ? (
                <div className="block">
                  <span className="text-xs font-black text-[#070528]">Type</span>
                  <div className="mt-2 flex h-11 items-center border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-700">
                    Entrée vers magasin
                  </div>
                </div>
              ) : (
                <SelectField name="movement_type" label="Type" value={movementForm.movement_type} onChange={updateMovementField} options={Object.entries(movementLabels)} required />
              )}
              {effectiveMovementType !== "IN" && (
                <SelectField
                  name="source_location"
                  label={effectiveMovementType === "TRANSFER" ? "Source" : "Stock concerné"}
                  value={movementForm.source_location}
                  onChange={updateMovementField}
                  options={getLocationOptions(effectiveMovementType, selectedMovementItem(items, movementForm.item_id), "source")}
                  required
                />
              )}
              {effectiveMovementType === "TRANSFER" && (
                <SelectField
                  name="destination_location"
                  label="Destination"
                  value={movementForm.destination_location}
                  onChange={updateMovementField}
                  options={getLocationOptions(effectiveMovementType, selectedMovementItem(items, movementForm.item_id), "destination")}
                  required
                />
              )}
              <Field name="quantity" label="Quantité" type="number" min="0" value={movementForm.quantity} onChange={updateMovementField} required />
              <Field name="unit_price" label="Prix unitaire achat" type="number" min="0" value={movementForm.unit_price} onChange={updateMovementField} />
              {!isSupplyView && (
                <Field name="destination" label="Service ou motif" value={movementForm.destination} onChange={updateMovementField} />
              )}
              <Field name="note" label="Note" value={movementForm.note} onChange={updateMovementField} />
            </div>
            <PrimaryButton disabled={isLoading || !items.length} icon="Truck">
              {isSupplyView ? "Enregistrer l’approvisionnement" : "Enregistrer le mouvement"}
            </PrimaryButton>
          </form>
          )}

          {showDamageForm && (
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
          )}
        </div>
        )}

        {showRightColumn && (
        <div className="space-y-6">
          {showProductionForms && (
          <div className="grid gap-6 2xl:grid-cols-2">
            <form onSubmit={createRecipe} className="border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle title="Ingrédients liés aux plats" icon="UtensilsCrossed" />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <SelectField name="menu_item_id" label="Plat" value={recipeForm.menu_item_id} onChange={(event) => setRecipeForm((current) => ({ ...current, menu_item_id: event.target.value }))} options={menuItems.map((item) => [item.id, item.name])} required />
                <SelectField name="stock_item_id" label="Ingrédient stock" value={recipeForm.stock_item_id} onChange={(event) => setRecipeForm((current) => ({ ...current, stock_item_id: event.target.value }))} options={items.map((item) => [item.id, item.name])} required />
                <Field name="quantity_per_dish" label="Quantité par plat" type="number" min="0" step="0.001" value={recipeForm.quantity_per_dish} onChange={(event) => setRecipeForm((current) => ({ ...current, quantity_per_dish: event.target.value }))} required />
                <SelectField name="location" label="Stock à déduire" value={recipeForm.location} onChange={(event) => setRecipeForm((current) => ({ ...current, location: event.target.value }))} options={Object.entries(locationLabels)} required />
              </div>
              <PrimaryButton disabled={isLoading || !menuItems.length || !items.length} icon="Plus">Lier au plat</PrimaryButton>
              <RecipeRows recipes={recipes} items={items} menuItems={menuItems} onDelete={deleteRecipe} />
            </form>

            <form onSubmit={createProductionSheet} className="border border-slate-200 bg-white p-6 shadow-sm">
              <SectionTitle title="Fiche de production" icon="ClipboardList" />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <SelectField name="menu_item_id" label="Plat produit" value={productionForm.menu_item_id} onChange={(event) => setProductionForm((current) => ({ ...current, menu_item_id: event.target.value }))} options={menuItems.map((item) => [item.id, item.name])} required />
                <Field name="quantity" label="Quantité produite" type="number" min="0" value={productionForm.quantity} onChange={(event) => setProductionForm((current) => ({ ...current, quantity: event.target.value }))} required />
                <Field name="note" label="Note production" value={productionForm.note} onChange={(event) => setProductionForm((current) => ({ ...current, note: event.target.value }))} />
              </div>
              <PrimaryButton disabled={isLoading || !menuItems.length} icon="ClipboardList">Établir la fiche</PrimaryButton>
              <ProductionRows rows={productionSheets} menuItems={menuItems} />
            </form>
          </div>
          )}

          {showReports && (
          <ReportPanel report={report} range={reportRange} setRange={setReportRange} onSubmit={submitReport} />
          )}
          {showFinance && (
          <FinancePanel
            finance={finance}
            expenses={expenses}
            payments={payments}
            margins={margins}
            rotation={rotation}
            form={expenseForm}
            setForm={setExpenseForm}
            canEdit={canEditAccounting}
            isLoading={isLoading}
            onSubmit={createExpense}
            onDelete={deleteExpense}
          />
          )}

          {showStockTable && (
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
            <StockTable items={filteredItems} onEdit={editItem} />
          </div>
          )}

          {showHistory && (
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
          )}
          {isAccountingView && (
            <DamagePanel rows={damages} items={items} canAccount={canAccountDamage} onAccount={accountDamage} />
          )}
        </div>
        )}
      </div>
    </section>
  );
}

function getPageCopy(mode) {
  const copy = {
    movements: ["Mouvements de stock", "Enregistrez entrées, sorties, transferts et ajustements d’inventaire."],
    suppliers: ["Entrées stock", "Enregistrez une entrée simple de stock sans gestion fournisseur."],
    inventory: ["Inventaires", "Surveillez les écarts, les seuils d’alerte et la rotation des produits."],
    purchases: ["Achats stock", "Saisissez les achats, les entrées et les prix d’achat pour suivre les marges."],
    accounting: ["Comptabilité stock", "Suivez la valeur du stock, les pertes et les éléments à comptabiliser."],
    reports: ["Rapports stock & finances", "Exportez les synthèses hebdomadaires et mensuelles pour le pilotage."],
  };
  const [title, subtitle] = copy[mode] ?? ["Stock & comptabilité", "Pilotez les produits, les mouvements, les alertes et les pertes du restaurant."];
  return { title, subtitle };
}

function buildPdfReport({ title, range, summary, report, finance, items, movements, expenses, payments, margins, rotation }) {
  const generatedAt = new Date().toLocaleString("fr-FR");
  const period = `${formatDateInput(range.start_date)} - ${formatDateInput(range.end_date)}`;
  const movementRows = movements.map((movement) => [
    new Date(movement.created_at).toLocaleString("fr-FR"),
    items.find((item) => item.id === movement.item_id)?.name ?? "-",
    movementLabels[movement.movement_type] ?? movement.movement_type,
    movement.quantity,
    `${movement.source_location ? locationLabels[movement.source_location] : "-"} vers ${movement.destination_location ? locationLabels[movement.destination_location] : "-"}`,
    movement.note ?? "",
  ]);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} - PDF</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    header { border-bottom: 2px solid #f04438; padding-bottom: 14px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 22px; color: #070528; }
    h2 { margin: 22px 0 8px; font-size: 14px; color: #070528; }
    p { margin: 4px 0; }
    .muted { color: #667085; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
    .card { border: 1px solid #e5e7eb; padding: 10px; background: #f9fafb; }
    .label { color: #667085; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .value { margin-top: 5px; font-size: 14px; font-weight: 900; color: #070528; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th { background: #fff4ed; color: #9a3412; text-align: left; font-size: 9px; text-transform: uppercase; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
    td.num, th.num { text-align: right; }
    footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #667085; font-size: 10px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">Période: ${escapeHtml(period)} · Généré le ${escapeHtml(generatedAt)}</p>
  </header>

  <section class="grid">
    ${pdfCard("Valeur stock", money(summary?.stock_value ?? report?.stock_value))}
    ${pdfCard("Stock faible", summary?.low_stock_count ?? report?.low_stock_count ?? 0)}
    ${pdfCard("Chiffre d'affaires", money(finance?.revenue))}
    ${pdfCard("Bénéfice net", money(finance?.net_profit))}
  </section>

  ${pdfTable("Produits en stock", ["Produit", "Unité", "Magasin", "Cuisine", "Boisson", "Seuil", "Prix achat", "Marge"], items.map((item) => [
    item.name,
    item.unit,
    item.quantity,
    item.kitchen_quantity,
    item.drink_quantity,
    item.alert_threshold,
    money(item.purchase_price),
    `${item.sale_margin_rate}%`,
  ]))}

  ${pdfTable("Mouvements", ["Date", "Produit", "Type", "Quantité", "Trajet", "Note"], movementRows)}

  ${pdfTable("Dépenses", ["Date", "Libellé", "Catégorie", "Montant", "Paiement", "Référence"], expenses.map((expense) => [
    new Date(expense.expense_date).toLocaleDateString("fr-FR"),
    expense.label,
    expense.category,
    money(expense.amount),
    expense.payment_method ?? "-",
    expense.reference ?? "-",
  ]))}

  ${pdfTable("Paiements", ["Date", "Commande", "Client", "Mode", "Statut", "Montant"], payments.map((payment) => [
    new Date(payment.created_at).toLocaleDateString("fr-FR"),
    payment.order_number,
    payment.customer_name,
    payment.payment_method,
    payment.status,
    money(payment.amount),
  ]))}

  ${pdfTable("Marges par plat", ["Plat", "Qté", "CA", "Coût estimé", "Marge", "Taux"], margins.map((row) => [
    row.name,
    row.quantity_sold,
    money(row.revenue),
    money(row.estimated_cost),
    money(row.estimated_margin),
    `${Number(row.margin_rate || 0).toFixed(1)}%`,
  ]))}

  ${pdfTable("Rotation stock / plats", ["Plat", "Qté sortie", "CA", "Dernière sortie"], rotation.map((row) => [
    row.name,
    row.quantity_sold,
    money(row.revenue),
    row.last_order_at ? new Date(row.last_order_at).toLocaleDateString("fr-FR") : "-",
  ]))}

  <footer>Rapport généré depuis Restaurant SaaS.</footer>
</body>
</html>`;
}

function pdfCard(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function pdfTable(title, headers, rows) {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Aucune donnée.</td></tr>`;
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function printHtmlDocument(html, onBlocked) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    onBlocked?.();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const print = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(print, 250);
    return;
  }

  printWindow.onload = () => setTimeout(print, 250);
}

function formatDateInput(value) {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function SectionTitle({ title, subtitle = "Donnée utilisée dans le suivi opérationnel et comptable.", icon }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-[#070528]">{title}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
      </div>
      <div className="flex h-11 w-11 items-center justify-center bg-[#f04438] text-white">
        <DashboardIcon name={icon} size={19} />
      </div>
    </div>
  );
}

function SupplyGuide() {
  const steps = [
    ["1", "Créer le produit", "À faire une seule fois si le produit n’existe pas encore."],
    ["2", "Entrer la quantité", "L’entrée ajoute la quantité au stock magasin."],
    ["3", "Contrôler la liste", "Le tableau des produits se met à jour après enregistrement."],
  ];
  return (
    <div className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 md:grid-cols-3">
      {steps.map(([number, title, text]) => (
        <div key={number} className="flex gap-3 rounded-lg bg-white p-3 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-sm font-black text-white">
            {number}
          </span>
          <span>
            <p className="text-sm font-black text-slate-900">{title}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{text}</p>
          </span>
        </div>
      ))}
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

function StockTable({ items, onEdit }) {
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
            <th className="px-5 py-4 text-right">Action</th>
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
                <td className="px-5 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit?.(item)}
                    className="inline-flex h-9 items-center justify-center gap-2 border border-slate-200 px-3 text-xs font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]"
                  >
                    <DashboardIcon name="Pencil" size={14} />
                    Modifier
                  </button>
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

function RecipeRows({ recipes, items, menuItems, onDelete }) {
  return (
    <div className="mt-5 divide-y divide-slate-100 border border-slate-100 bg-slate-50/50">
      {recipes.slice(0, 6).map((recipe) => {
        const dish = menuItems.find((item) => item.id === recipe.menu_item_id);
        const stockItem = items.find((item) => item.id === recipe.stock_item_id);
        return (
          <div key={recipe.id} className="flex items-start justify-between gap-4 bg-white px-4 py-3">
            <div>
              <p className="font-black text-[#070528]">{dish?.name ?? "Plat introuvable"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {recipe.quantity_per_dish} {stockItem?.unit ?? ""} de {stockItem?.name ?? "produit stock"} depuis {locationLabels[recipe.location] ?? recipe.location}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(recipe)}
              className="shrink-0 border border-red-100 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
            >
              Supprimer
            </button>
          </div>
        );
      })}
      {!recipes.length && (
        <p className="bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
          Aucun ingrédient lié aux plats.
        </p>
      )}
    </div>
  );
}

function ProductionRows({ rows, menuItems }) {
  return (
    <div className="mt-5 divide-y divide-slate-100 border border-slate-100 bg-slate-50/50">
      {rows.slice(0, 6).map((row) => {
        const dish = menuItems.find((item) => item.id === row.menu_item_id);
        return (
          <div key={row.id} className="bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <p className="font-black text-[#070528]">{dish?.name ?? "Plat introuvable"}</p>
              <span className="text-sm font-black text-[#f04438]">{row.quantity}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {new Date(row.created_at).toLocaleString("fr-FR")} {row.note ? `- ${row.note}` : ""}
            </p>
          </div>
        );
      })}
      {!rows.length && (
        <p className="bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
          Aucune fiche de production.
        </p>
      )}
    </div>
  );
}

function ReportPanel({ report, range, setRange, onSubmit }) {
  const cards = [
    ["Valeur stock", report?.stock_value],
    ["Entrées", report?.entries_value],
    ["Sorties", report?.outputs_value],
    ["Pertes", report?.damage_loss],
    ["Marge estimée", report?.estimated_profit],
    ["Mouvements", report?.movement_count, "number"],
  ];

  return (
    <form onSubmit={onSubmit} className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SectionTitle title="Rapport stock" icon="BarChart3" />
        <div className="grid gap-3 sm:grid-cols-[160px_160px_auto]">
          <Field
            name="start_date"
            label="Début"
            type="date"
            value={range.start_date}
            onChange={(event) => setRange((current) => ({ ...current, start_date: event.target.value }))}
            required
          />
          <Field
            name="end_date"
            label="Fin"
            type="date"
            value={range.end_date}
            onChange={(event) => setRange((current) => ({ ...current, end_date: event.target.value }))}
            required
          />
          <PrimaryButton icon="Activity">Générer</PrimaryButton>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, type]) => (
          <div key={label} className="border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-[#070528]">
              {type === "number" ? Number(value || 0).toLocaleString("fr-FR") : money(value)}
            </p>
          </div>
        ))}
      </div>
    </form>
  );
}

function FinancePanel({ finance, expenses, payments, margins, rotation, form, setForm, canEdit, isLoading, onSubmit, onDelete }) {
  const financeCards = [
    ["Chiffre d'affaires", finance?.revenue],
    ["Dépenses", finance?.expenses],
    ["Pertes avaries", finance?.damage_loss],
    ["Bénéfice net", finance?.net_profit],
    ["Commandes", finance?.orders_count, "number"],
    ["Ticket moyen", finance?.average_order_value],
  ];

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 bg-white p-6 shadow-sm">
        <SectionTitle title="États financiers" icon="Wallet" />
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {financeCards.map(([label, value, type]) => (
            <div key={label} className="border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-black uppercase text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-black text-[#070528]">
                {type === "number" ? Number(value || 0).toLocaleString("fr-FR") : money(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <form onSubmit={onSubmit} className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Dépenses & charges" icon="TrendingDown" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field name="label" label="Libellé" value={form.label} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="category" label="Catégorie" value={form.category} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="amount" label="Montant" type="number" min="0" value={form.amount} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="payment_method" label="Mode paiement" value={form.payment_method} onChange={updateField} disabled={!canEdit || isLoading} />
            <Field name="reference" label="Référence" value={form.reference} onChange={updateField} disabled={!canEdit || isLoading} />
            <Field name="expense_date" label="Date" type="date" value={form.expense_date} onChange={updateField} required disabled={!canEdit || isLoading} />
            <Field name="note" label="Note" value={form.note} onChange={updateField} disabled={!canEdit || isLoading} />
          </div>
          <PrimaryButton disabled={!canEdit || isLoading} icon="Plus">Enregistrer la dépense</PrimaryButton>
          <SimpleRows
            rows={expenses}
            empty="Aucune dépense sur la période."
            render={(expense) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{expense.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {expense.category} · {new Date(expense.expense_date).toLocaleDateString("fr-FR")} · {expense.reference || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#f04438]">{money(expense.amount)}</p>
                  {canEdit && (
                    <button type="button" onClick={() => onDelete(expense)} className="mt-2 text-xs font-black text-red-600">
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            )}
          />
        </form>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Paiements & encaissements" icon="ReceiptText" />
          <SimpleRows
            rows={payments}
            empty="Aucun encaissement sur la période."
            render={(payment) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{payment.order_number}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {payment.customer_name} · {payment.payment_method} · {payment.status}
                  </p>
                </div>
                <p className="font-black text-[#070528]">{money(payment.amount)}</p>
              </div>
            )}
          />
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Marges par plat" icon="TrendingUp" />
          <SimpleRows
            rows={margins}
            empty="Aucune marge calculée sur la période."
            render={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{row.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {row.quantity_sold} vendu(s) · coût estimé {money(row.estimated_cost)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-emerald-700">{money(row.estimated_margin)}</p>
                  <p className="text-xs font-semibold text-slate-500">{Number(row.margin_rate || 0).toFixed(1)}%</p>
                </div>
              </div>
            )}
          />
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle title="Rotation stock / plats" icon="Activity" />
          <SimpleRows
            rows={rotation}
            empty="Aucune sortie liée aux plats sur la période."
            render={(row) => (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#070528]">{row.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Dernière sortie: {row.last_order_at ? new Date(row.last_order_at).toLocaleDateString("fr-FR") : "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#070528]">{row.quantity_sold}</p>
                  <p className="text-xs font-semibold text-slate-500">{money(row.revenue)}</p>
                </div>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

function SimpleRows({ rows, empty, render }) {
  return (
    <div className="mt-5 divide-y divide-slate-100 border border-slate-100">
      {rows.slice(0, 8).map((row) => (
        <div key={row.id ?? row.menu_item_id ?? row.name} className="bg-white px-4 py-3">
          {render(row)}
        </div>
      ))}
      {!rows.length && <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">{empty}</p>}
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
