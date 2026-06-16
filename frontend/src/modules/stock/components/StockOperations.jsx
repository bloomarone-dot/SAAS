import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { enqueueOfflineAction, formatApiError, friendlyNetworkMessage, isNetworkError } from "@/utils/network";
import { validationFor } from "@/utils/validation";
import { money, movementLabels, productTypeLabels, damageReasonLabels, locationLabels } from "./stockShared";
import {
  getPageCopy,
  buildPdfReport,
  getRestaurantExportHeader,
  safeJsonParse,
  pdfCard,
  pdfTable,
  printHtmlDocument,
  formatDateInput,
  escapeHtml,
  selectedMovementItem,
  getTotalQuantity,
  getLocationOptions,
  formatMovementLocations,
  numberPayload,
  SectionTitle,
  SupplyGuide,
  StockSummaryStrip,
  AnalyticStockPanel,
  LossReasonPanel,
  ExpiringLotsPanel,
  InventoryStatusPanel,
  InventoryManager,
  CompactPanel,
  DamageForm,
  CompactInfo,
  getLocationQuantityFromItem,
  Field,
  ReadonlyField,
  SelectField,
  PrimaryButton,
  StockTable,
  RecipeRows,
  PackagingRows,
  ProductionRows,
  ReportPanel,
  ReportRows,
  sumObject,
  FinancePanel,
  SimpleRows,
  HistoryPanel,
  DamagePanel,
} from "./stockPanels";

const emptyItem = {
  name: "",
  product_type: "INGREDIENT",
  unit: "Kilogramme",
  quantity: "",
  kitchen_quantity: "",
  drink_quantity: "",
  alert_threshold: "",
  purchase_price: "",
  cmup_current: "",
  packaging_sale_price: "",
  sale_margin_rate: "",
  is_active: true,
};

const emptyMovement = {
  item_id: "",
  movement_type: "IN",
  source_location: "MAGASIN",
  destination_location: "CUISINE",
  quantity: "",
  unit_price: "",
  expiration_date: "",
  destination: "",
  note: "",
};

const emptyDamage = {
  item_id: "",
  location: "MAGASIN",
  quantity: "",
  estimated_loss: "",
  reason: "PERIME",
};

const emptyRecipe = {
  menu_item_id: "",
  stock_item_id: "",
  quantity_per_dish: "",
  location: "CUISINE",
};

const emptyPackagingLink = {
  menu_item_id: "",
  packaging_item_id: "",
  required_quantity: "1",
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





const unitsByType = {
  INGREDIENT: ["Kilogramme"],
  BOISSON: ["Bouteille", "Carton", "Casier"],
  EMBALLAGE: ["Unité", "Paquet", "Carton"],
};


export function StockOperations({ apiBaseUrl, role, mode = "stock", onMessage, focusCreate = false }) {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [lots, setLots] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [packagingLinks, setPackagingLinks] = useState([]);
  const [inventories, setInventories] = useState([]);
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
  const [serverRevenue, setServerRevenue] = useState([]);
  const [statements, setStatements] = useState(null);
  const [summary, setSummary] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItemId, setEditingItemId] = useState(null);
  const [movementForm, setMovementForm] = useState(emptyMovement);
  const [damageForm, setDamageForm] = useState(emptyDamage);
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [packagingForm, setPackagingForm] = useState(emptyPackagingLink);
  const [productionForm, setProductionForm] = useState(emptyProduction);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [inventoryPeriod, setInventoryPeriod] = useState(`Semaine ${new Date().toISOString().slice(0, 10)}`);
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
  const selectedDamageItem = useMemo(
    () => selectedMovementItem(items, damageForm.item_id),
    [damageForm.item_id, items]
  );

  const analyticSummary = useMemo(() => {
    const movementCost = (types) => movements
      .filter((movement) => types.includes(movement.movement_type))
      .reduce((total, movement) => total + Number(movement.value || (Number(movement.quantity || 0) * Number(movement.unit_price || 0))), 0);
    return [
      { label: "Centre magasin", value: money(summary?.main_stock_value), detail: "Valorisation grand magasin", icon: "Package" },
      { label: "Centre cuisine", value: money(summary?.kitchen_stock_value), detail: "Stock disponible pour production", icon: "ChefHat" },
      { label: "Centre boisson", value: money(summary?.drink_stock_value), detail: "Boissons et vins disponibles", icon: "Wallet" },
      { label: "Coût sorties", value: money(movementCost(["OUT"])), detail: "Consommations enregistrées", icon: "TrendingDown" },
      { label: "Transferts internes", value: money(movementCost(["TRANSFER"])), detail: "Magasin vers cuisine/boisson", icon: "Truck" },
      { label: "Pertes / avaries", value: money(summary?.total_damage_loss), detail: "Charges analytiques stock", icon: "AlertTriangle" },
      { label: "Emballages consommés", value: money(summary?.packaging_consumed_value), detail: "Valeur FIFO sortie", icon: "ReceiptText" },
    ];
  }, [movements, summary]);

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
      if (!response.ok) throw new Error(formatApiError(data.detail, "Opération impossible."));
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
      const [menuData, recipeData, productionData, lotData, centerData, packagingData, inventoryData] = await Promise.all([
        api("/api/v1/stock/menu-items").catch(() => []),
        api("/api/v1/stock/recipes").catch(() => []),
        api("/api/v1/stock/production-sheets").catch(() => []),
        api("/api/v1/stock/lots").catch(() => []),
        api("/api/v1/stock/cost-centers").catch(() => []),
        api("/api/v1/stock/packaging-links").catch(() => []),
        api("/api/v1/stock/inventories").catch(() => []),
      ]);
      setMenuItems(menuData);
      setRecipes(recipeData);
      setProductionSheets(productionData);
      setLots(lotData);
      setCostCenters(centerData);
      setPackagingLinks(packagingData);
      setInventories(inventoryData);
      setMovementForm((current) => ({ ...current, item_id: current.item_id || itemData[0]?.id || "" }));
      setDamageForm((current) => {
        const selectedItem = itemData.find((item) => item.id === current.item_id) || itemData[0];
        return {
          ...current,
          item_id: selectedItem?.id || "",
          location: selectedItem?.product_type === "BOISSON" ? "BOISSON" : "CUISINE",
        };
      });
      setRecipeForm((current) => ({
        ...current,
        menu_item_id: current.menu_item_id || menuData[0]?.id || "",
        stock_item_id: current.stock_item_id || itemData[0]?.id || "",
      }));
      setPackagingForm((current) => ({
        ...current,
        menu_item_id: current.menu_item_id || menuData[0]?.id || "",
        packaging_item_id: current.packaging_item_id || itemData.find((item) => item.product_type === "EMBALLAGE")?.id || "",
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
      if (name === "item_id" || name === "quantity") {
        const nextItem = selectedMovementItem(items, name === "item_id" ? value : next.item_id);
        next.location = nextItem?.product_type === "BOISSON" ? "BOISSON" : "CUISINE";
        if (nextItem && name === "quantity") {
          next.estimated_loss = String(Number(value || 0) * Number(nextItem.purchase_price || 0));
        }
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
        "cmup_current",
        "packaging_sale_price",
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
      cmup_current: String(item.cmup_current || item.purchase_price || 0),
      packaging_sale_price: String(item.packaging_sale_price || 0),
      sale_margin_rate: String(item.sale_margin_rate),
      is_active: item.is_active !== false,
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
          expiration_date: movementForm.expiration_date || null,
          note: movementForm.note || null,
        }
      : {
          ...numberPayload(movementForm, ["quantity", "unit_price"]),
          movement_type: movementType,
          unit_price: Number(movementForm.unit_price || 0),
          expiration_date: movementForm.expiration_date || null,
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

  async function openInventory() {
    setIsLoading(true);
    try {
      await api("/api/v1/stock/inventories", {
        method: "POST",
        body: JSON.stringify({ period: inventoryPeriod, tolerance_rate: 2 }),
      });
      await loadStock();
      onMessage("Inventaire ouvert.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateInventoryLine(inventoryId, lineId, realStock) {
    try {
      await api(`/api/v1/stock/inventories/${inventoryId}/lines/${lineId}`, {
        method: "PATCH",
        body: JSON.stringify({ real_stock: Number(realStock || 0) }),
      });
      await loadStock();
    } catch (error) {
      onMessage(error.message);
    }
  }

  async function closeInventory(inventoryId) {
    if (!window.confirm("Clôturer cet inventaire ? Les stocks réels deviendront les nouvelles valeurs de stock.")) return;
    setIsLoading(true);
    try {
      await api(`/api/v1/stock/inventories/${inventoryId}/close`, { method: "PATCH" });
      await loadStock();
      onMessage("Inventaire clôturé.");
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

  async function createPackagingLink(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      await api("/api/v1/stock/packaging-links", {
        method: "POST",
        body: JSON.stringify(numberPayload(packagingForm, ["required_quantity"])),
      });
      setPackagingForm((current) => ({ ...emptyPackagingLink, menu_item_id: current.menu_item_id, packaging_item_id: current.packaging_item_id }));
      await loadStock();
      onMessage("Emballage lié au plat.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deletePackagingLink(link) {
    setIsLoading(true);
    try {
      await api(`/api/v1/stock/packaging-links/${link.id}`, { method: "DELETE" });
      await loadStock();
      onMessage("Liaison emballage supprimée.");
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
    const [summaryData, expenseData, paymentData, marginData, rotationData, serverRevenueData, statementData] = await Promise.all([
      api(`/api/v1/finance/summary?${query.toString()}`).catch(() => null),
      api(`/api/v1/finance/expenses?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/payments?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/dish-margins?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/stock-rotation?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/server-revenue?${query.toString()}`).catch(() => []),
      api(`/api/v1/finance/statements?${query.toString()}`).catch(() => null),
    ]);
    setFinance(summaryData);
    setExpenses(expenseData);
    setPayments(paymentData);
    setMargins(marginData);
    setRotation(rotationData);
    setServerRevenue(serverRevenueData);
    setStatements(statementData);
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
    if (!window.confirm(`Archiver cette dépense ?\n\nElle restera en base de données pour l'historique.`)) return;
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
    const exportHeader = getRestaurantExportHeader();
    const rows = [
      [exportHeader.name],
      [exportHeader.subtitle],
      [],
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
        header: getRestaurantExportHeader(),
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
  const isAccountingView = ["accounting", "expenses"].includes(mode);
  const isReportView = ["reports", "sales-report", "profit-report", "server-report", "financial-report"].includes(mode);
  const isCreateStockProduct = focusCreate && isStockHome;
  const showExecutivePanels = !isCreateStockProduct && (isAccountingView || isReportView);
  const showOperationalSummary = !isCreateStockProduct && (isStockHome || isMovementView || isSupplyView || isInventoryView);
  const effectiveMovementType = isSupplyView ? "IN" : movementForm.movement_type;
  const showReferenceForm = isStockHome;
  const showMovementForm = isMovementView || isSupplyView;
  const showDamageForm = isInventoryView || isAccountingView;
  const showProductionForms = isStockHome && !isCreateStockProduct;
  const showStockTable = (isStockHome || isInventoryView) && !isCreateStockProduct;
  const showHistory = (isMovementView || isInventoryView) && !isCreateStockProduct;
  const showFinance = isAccountingView;
  const showReports = isReportView;
  const showLeftColumn = showReferenceForm || showMovementForm || showDamageForm;
  const showRightColumn = showProductionForms || showReports || showFinance || showStockTable || showHistory || isAccountingView;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase text-[#f04438]">Gestionnaire stock / Comptable</p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">{isCreateStockProduct ? "Créer un produit stock" : pageCopy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            {isCreateStockProduct ? "Renseignez les informations du produit à suivre dans le stock." : pageCopy.subtitle}
          </p>
        </div>
        {!isCreateStockProduct && <div className="flex flex-wrap gap-3">
          {(isAccountingView || isReportView) && (
            <>
              <button type="button" onClick={exportExcel} className="lte-btn lte-btn-default">
                <DashboardIcon name="FileText" size={17} />
                Exporter en Excel
              </button>
              <button type="button" onClick={exportPdf} className="lte-btn lte-btn-default">
                <DashboardIcon name="ReceiptText" size={17} />
                Exporter en PDF
              </button>
            </>
          )}
          <button type="button" onClick={loadStock} className="lte-btn lte-btn-primary">
            <DashboardIcon name="Activity" size={17} />
            Actualiser
          </button>
        </div>}
      </div>

      {showOperationalSummary && (
        <StockSummaryStrip
          summary={summary}
          items={items}
          movements={movements}
          damages={damages}
          mode={mode}
        />
      )}

      {showExecutivePanels && <AnalyticStockPanel rows={analyticSummary} />}
      {showExecutivePanels && (
        <div className="grid gap-4 xl:grid-cols-3">
          <LossReasonPanel rows={summary?.loss_by_reason || {}} />
          <ExpiringLotsPanel lots={lots} items={items} costCenters={costCenters} />
          <InventoryStatusPanel inventories={inventories} />
        </div>
      )}

      {isInventoryView && (
        <InventoryManager
          inventories={inventories}
          items={items}
          costCenters={costCenters}
          period={inventoryPeriod}
          onPeriodChange={setInventoryPeriod}
          onOpen={openInventory}
          onLineChange={updateInventoryLine}
          onClose={closeInventory}
          isLoading={isLoading}
        />
      )}

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
	                    packaging_sale_price: nextType === "EMBALLAGE" ? current.packaging_sale_price : "",
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
	              <Field name="cmup_current" label="CMUP actuel" type="number" min="0" value={itemForm.cmup_current} onChange={updateItemField} />
	              {itemForm.product_type === "EMBALLAGE" && (
	                <Field name="packaging_sale_price" label="Prix vente emballage" type="number" min="0" value={itemForm.packaging_sale_price} onChange={updateItemField} required />
	              )}
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
              {effectiveMovementType === "IN" && (
                <Field name="expiration_date" label="Date de péremption" type="date" value={movementForm.expiration_date} onChange={updateMovementField} />
              )}
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
          <DamageForm
            form={damageForm}
            items={items}
            selectedItem={selectedDamageItem}
            isLoading={isLoading}
            onChange={updateDamageField}
            onSubmit={createDamage}
          />
          )}
        </div>
        )}

        {showRightColumn && (
        <div className="space-y-6">
          {showProductionForms && (
          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase text-[#f04438]">Configuration avancée</p>
                <h2 className="text-base font-black text-[#070528]">Production, recettes et emballages</h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition group-open:rotate-180">
                <DashboardIcon name="ChevronDown" size={18} />
              </span>
            </summary>
          <div className="grid gap-6 border-t border-slate-100 p-5 2xl:grid-cols-2">
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

	            <form onSubmit={createPackagingLink} className="border border-slate-200 bg-white p-6 shadow-sm">
	              <SectionTitle title="Emballages facturables" icon="ReceiptText" />
	              <div className="mt-5 grid gap-4 md:grid-cols-2">
	                <SelectField name="menu_item_id" label="Plat" value={packagingForm.menu_item_id} onChange={(event) => setPackagingForm((current) => ({ ...current, menu_item_id: event.target.value }))} options={menuItems.map((item) => [item.id, item.name])} required />
	                <SelectField name="packaging_item_id" label="Emballage" value={packagingForm.packaging_item_id} onChange={(event) => setPackagingForm((current) => ({ ...current, packaging_item_id: event.target.value }))} options={items.filter((item) => item.product_type === "EMBALLAGE").map((item) => [item.id, item.name])} required />
	                <Field name="required_quantity" label="Quantité requise" type="number" min="1" value={packagingForm.required_quantity} onChange={(event) => setPackagingForm((current) => ({ ...current, required_quantity: event.target.value }))} required />
	              </div>
	              <PrimaryButton disabled={isLoading || !menuItems.length || !items.some((item) => item.product_type === "EMBALLAGE")} icon="Plus">Lier l’emballage</PrimaryButton>
	              <PackagingRows links={packagingLinks} items={items} menuItems={menuItems} onDelete={deletePackagingLink} />
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
          </details>
          )}

          {showReports && (
          <ReportPanel
            report={report}
            finance={finance}
            serverRevenue={serverRevenue}
            statements={statements}
            margins={margins}
            rotation={rotation}
            range={reportRange}
            setRange={setReportRange}
            onSubmit={submitReport}
          />
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
                <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="form-control">
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

