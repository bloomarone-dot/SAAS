// Configuration centrale du menu React. Les pages consomment ce fichier pour
// afficher les entrees autorisees selon le role, le statut owner et les droits.
export const ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SERVEUR: "SERVEUR",
  CUISINE: "CUISINE",
  CAISSE: "CAISSE",
  STOCK: "STOCK",
  COMPTABLE: "COMPTABLE",
};

export const PERMISSIONS = {
  RESTAURANT_SETTINGS_READ: "restaurant.settings.read",
  RESTAURANT_SETTINGS_UPDATE: "restaurant.settings.update",
  BRANCH_READ: "branch.read",
  BRANCH_CREATE: "branch.create",
  USER_READ: "user.read",
  USER_CREATE: "user.create",
  USER_PERMISSIONS_UPDATE: "user.permissions.update",
  SERVICE_READ: "service.read",
  KITCHEN_READ: "kitchen.read",
  CASHIER_READ: "cashier.read",
  STOCK_READ: "stock.read",
  ACCOUNTING_READ: "accounting.read",
};

// Chaque entree definit sa route, son icone Lucide et les droits necessaires.
export const MENU_ITEMS = [
  {
    key: "superadmin.dashboard",
    label: "Vue d'ensemble",
    path: "/superadmin",
    icon: "LayoutDashboard",
    roles: [ROLES.SUPERADMIN],
  },
  {
    key: "superadmin.restaurants",
    label: "Restaurants",
    path: "/superadmin/restaurants",
    icon: "Building2",
    roles: [ROLES.SUPERADMIN],
  },
  {
    key: "admin.dashboard",
    label: "Tableau de bord",
    path: "/admin",
    icon: "LayoutDashboard",
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
  {
    key: "restaurant.settings",
    label: "Configuration",
    path: "/admin/settings",
    icon: "Settings",
    roles: [ROLES.ADMIN],
    ownerOnly: true,
    permissions: [PERMISSIONS.RESTAURANT_SETTINGS_READ],
  },
  {
    key: "restaurant.branches",
    label: "Branches",
    path: "/admin/branches",
    icon: "MapPin",
    roles: [ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.BRANCH_READ],
  },
  {
    key: "restaurant.users",
    label: "Personnel",
    path: "/admin/users",
    icon: "Users",
    roles: [ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.USER_READ],
  },
  {
    key: "service.floor",
    label: "Service en salle",
    path: "/serveur",
    icon: "Utensils",
    roles: [ROLES.SERVEUR, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.SERVICE_READ],
  },
  {
    key: "service.kitchen",
    label: "Cuisine",
    path: "/cuisine",
    icon: "ChefHat",
    roles: [ROLES.CUISINE, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.KITCHEN_READ],
  },
  {
    key: "service.cashier",
    label: "Caisse",
    path: "/caisse",
    icon: "CreditCard",
    roles: [ROLES.CAISSE, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.CASHIER_READ],
  },
  {
    key: "operations.stock",
    label: "Stocks",
    path: "/stock",
    icon: "Package",
    roles: [ROLES.STOCK, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.STOCK_READ],
  },
  {
    key: "finance.accounting",
    label: "Comptabilite",
    path: "/comptable",
    icon: "Calculator",
    roles: [ROLES.COMPTABLE, ROLES.ADMIN],
    permissions: [PERMISSIONS.ACCOUNTING_READ],
  },
];

export function getMenuForUser(user) {
  // Le proprietaire du restaurant voit toutes les entrees de son role.
  // Les autres utilisateurs doivent avoir au moins une permission requise.
  if (!user?.role) return [];
  const userPermissions = new Set(user.permissions ?? []);

  return MENU_ITEMS.filter((item) => {
    if (!item.roles.includes(user.role)) return false;
    if (item.ownerOnly && !user.is_owner) return false;
    if (user.is_owner) return true;
    if (item.permissions?.length && !item.permissions.some((permission) => userPermissions.has(permission))) {
      return false;
    }
    return true;
  });
}

export const APP_MENUS = {
  SUPERADMIN: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "restaurants", label: "Restaurants", icon: "Store" },
    { key: "owners", label: "Propriétaires", icon: "Users" },
    { key: "subscriptions", label: "Abonnements", icon: "ReceiptText" },
    { key: "platform", label: "Plateforme", icon: "BarChart3" },
    { key: "settings", label: "Paramètres", icon: "Settings" },
  ],
  ADMIN: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "branches", label: "Branches", icon: "MapPin" },
    { key: "staff", label: "Utilisateurs", icon: "Users" },
    { key: "sales", label: "Ventes", icon: "TrendingUp" },
    { key: "orders", label: "Commandes", icon: "ClipboardList" },
    { key: "stocks", label: "Stocks", icon: "Box" },
    { key: "products", label: "Produits", icon: "Package" },
    { key: "accounting", label: "Comptabilité", icon: "FileText" },
    { key: "reports", label: "Rapports", icon: "BarChart3" },
    { key: "settings", label: "Paramètres", icon: "Settings" },
  ],
  MANAGER: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "orders", label: "Commandes", icon: "ClipboardList" },
    { key: "tables", label: "Tables", icon: "Table2" },
    { key: "staff", label: "Équipe", icon: "Users" },
    { key: "stocks", label: "Stocks", icon: "Box" },
    { key: "reports", label: "Rapports", icon: "BarChart3" },
  ],
  SERVEUR: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "orders", label: "Commandes", icon: "ClipboardList" },
    { key: "tables", label: "Tables", icon: "Table2" },
    { key: "clients", label: "Clients", icon: "Users" },
    { key: "invoices", label: "Factures", icon: "FileText" },
    { key: "history", label: "Historiques", icon: "History" },
  ],
  CUISINE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "orders", label: "Commandes cuisine", icon: "ClipboardList" },
    { key: "preparation", label: "En préparation", icon: "FileText" },
    { key: "ready", label: "Prêtes", icon: "Package" },
    { key: "history", label: "Historique", icon: "History" },
  ],
  STOCK: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "stock", label: "Stock", icon: "Box" },
    { key: "movements", label: "Mouvements", icon: "ClipboardList" },
    { key: "suppliers", label: "Fournisseurs", icon: "Truck" },
    { key: "inventory", label: "Inventaires", icon: "FileText" },
    { key: "purchases", label: "Achats", icon: "ShoppingCart" },
    { key: "accounting", label: "Comptabilité", icon: "FileText" },
    { key: "reports", label: "Rapports", icon: "BarChart3" },
  ],
  COMPTABLE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "stock", label: "Stock", icon: "Box" },
    { key: "movements", label: "Mouvements", icon: "ClipboardList" },
    { key: "suppliers", label: "Fournisseurs", icon: "Truck" },
    { key: "inventory", label: "Inventaires", icon: "FileText" },
    { key: "purchases", label: "Achats", icon: "ShoppingCart" },
    { key: "accounting", label: "Comptabilité", icon: "FileText" },
    { key: "reports", label: "Rapports", icon: "BarChart3" },
  ],
  CAISSE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "payments", label: "Paiements", icon: "Wallet" },
    { key: "receipts", label: "Tickets", icon: "ReceiptText" },
    { key: "closing", label: "Clôture", icon: "Clock3" },
  ],
};

export const ROLE_DASHBOARDS = {
  SUPERADMIN: {
    title: "Dashboard Superadmin",
    subtitle: "Création des restaurants, suivi de la plateforme et activation des comptes.",
    accent: "#0F8AB1",
    cards: [
      { title: "Restaurants", value: "0", icon: "Building2" },
      { title: "Actifs", value: "0", icon: "Activity" },
      { title: "Utilisateurs", value: "0", icon: "Users" },
      { title: "Croissance", value: "+18%", icon: "TrendingUp" },
    ],
  },
  ADMIN: {
    title: "Dashboard Administrateur",
    subtitle: "Pilotage global du restaurant, des équipes, des ventes et des performances.",
    accent: "#0F8AB1",
    cards: [
      { title: "Chiffre d'affaires", value: "12 450 000 FCFA", icon: "TrendingUp" },
      { title: "Commandes", value: "1 248", icon: "ShoppingCart" },
      { title: "Utilisateurs", value: "28", icon: "Users" },
      { title: "Bénéfice", value: "4 500 000 FCFA", icon: "Wallet" },
    ],
  },
  MANAGER: {
    title: "Dashboard Manager",
    subtitle: "Supervision opérationnelle du service, de la cuisine, du stock et des objectifs.",
    accent: "#7c3aed",
    cards: [
      { title: "Commandes du jour", value: "186", icon: "ShoppingCart" },
      { title: "Tables occupées", value: "21", icon: "UtensilsCrossed" },
      { title: "Équipe active", value: "16", icon: "Users" },
      { title: "Objectif atteint", value: "78%", icon: "TrendingUp" },
    ],
  },
  SERVEUR: {
    title: "Dashboard Serveur",
    subtitle: "Suivi des commandes, tables servies et temps moyen de service.",
    accent: "#ff2c7d",
    cards: [
      { title: "Commandes", value: "24", icon: "ShoppingCart" },
      { title: "Tables servies", value: "12", icon: "UtensilsCrossed" },
      { title: "Temps moyen", value: "15 min", icon: "Clock3" },
    ],
  },
  CUISINE: {
    title: "Dashboard Cuisine",
    subtitle: "Organisation des préparations et priorisation des commandes urgentes.",
    accent: "#10b981",
    cards: [
      { title: "À préparer", value: "18", icon: "ChefHat" },
      { title: "Préparation", value: "12", icon: "Clock3" },
      { title: "Urgentes", value: "4", icon: "AlertTriangle" },
    ],
  },
  STOCK: {
    title: "Dashboard Stock / Comptabilité",
    subtitle: "Contrôle des produits, livraisons, dépenses et alertes de stock.",
    accent: "#2563eb",
    cards: [
      { title: "Produits", value: "1 240", icon: "Package" },
      { title: "Livraisons", value: "14", icon: "Truck" },
      { title: "Dépenses", value: "850 000 FCFA", icon: "Wallet" },
      { title: "Alertes", value: "9", icon: "Bell" },
    ],
  },
  COMPTABLE: {
    title: "Dashboard Comptable",
    subtitle: "Synthèse des recettes, dépenses, marges et clôtures financières.",
    accent: "#2563eb",
    cards: [
      { title: "Recettes", value: "9 870 000 FCFA", icon: "Wallet" },
      { title: "Dépenses", value: "3 120 000 FCFA", icon: "TrendingDown" },
      { title: "Marge", value: "42%", icon: "TrendingUp" },
      { title: "Alertes", value: "6", icon: "Bell" },
    ],
  },
  CAISSE: {
    title: "Dashboard Caisse",
    subtitle: "Encaissements, tickets, paiements en attente et clôture de caisse.",
    accent: "#f59e0b",
    cards: [
      { title: "Encaissements", value: "2 450 000 FCFA", icon: "Wallet" },
      { title: "Tickets", value: "312", icon: "ReceiptText" },
      { title: "En attente", value: "7", icon: "Clock3" },
      { title: "Clôture", value: "18:00", icon: "Bell" },
    ],
  },
};
