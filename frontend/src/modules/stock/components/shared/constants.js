import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  PackagePlus,
  PackageX,
  Warehouse,
} from "lucide-react";

import { today } from "./format";

export const tabs = [
  { key: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { key: "products", label: "Produits", icon: Boxes },
  { key: "depots", label: "Dépôts", icon: Warehouse },
  { key: "entries", label: "Entrées", icon: PackagePlus },
  { key: "transfers", label: "Transferts", icon: ArrowLeftRight },
  { key: "outputs", label: "Sorties", icon: PackageX },
  { key: "lots", label: "Lots et péremptions", icon: CalendarClock },
  { key: "reports", label: "Mouvements", icon: ClipboardList },
  { key: "alerts", label: "Alertes", icon: AlertTriangle },
];

export const movementLabels = {
  ENTRY: "Entrée",
  DIRECT_ENTRY: "Entrée directe",
  TRANSFER: "Transfert",
  OUTPUT: "Sortie",
  LOSS: "Perte",
  INVENTORY_PLUS: "Inventaire +",
  INVENTORY_MINUS: "Inventaire -",
  CANCELLATION: "Annulation",
};

export const depotTypeLabels = {
  principal: "Principal",
  cuisine: "Cuisine",
  boisson: "Boisson",
  avarie: "Avarie",
  autre: "Autre",
};

export const emptyProduct = {
  code: "",
  name: "",
  product_type: "INGREDIENT",
  unit_id: "",
  minimum_stock: "",
  purchase_unit_id: "",
  purchase_factor: "",
};

export const emptyDepot = { name: "", code: "", type: "autre", description: "" };

export const emptyEntry = {
  movement_date: today(),
  product_id: "",
  destination_depot_id: "",
  quantity: "",
  unit_price: "",
  in_purchase_unit: false,
  lot_number: "",
  expiry_date: "",
  supplier_id: "",
  reason: "",
  reference: "",
};

export const emptyTransfer = {
  movement_date: today(),
  product_id: "",
  source_depot_id: "",
  destination_depot_id: "",
  quantity: "",
  production_cost: "",
  reason: "",
  reference: "",
};

export const emptyOutput = {
  movement_date: today(),
  product_id: "",
  source_depot_id: "",
  destination_depot_id: "",
  quantity: "",
  reason: "consommation",
  reference: "",
};
