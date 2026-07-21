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
    path: "/app/dashboard",
    icon: "LayoutDashboard",
    roles: [ROLES.SUPERADMIN],
  },
  {
    key: "superadmin.restaurants",
    label: "Restaurants",
    path: "/app/restaurants",
    icon: "Building2",
    roles: [ROLES.SUPERADMIN],
  },
  {
    key: "admin.dashboard",
    label: "Tableau de bord",
    path: "/app/dashboard",
    icon: "LayoutDashboard",
    roles: [ROLES.ADMIN, ROLES.MANAGER],
  },
  {
    key: "restaurant.settings",
    label: "Configuration",
    path: "/app/settings",
    icon: "Settings",
    roles: [ROLES.ADMIN],
    ownerOnly: true,
    permissions: [PERMISSIONS.RESTAURANT_SETTINGS_READ],
  },
  {
    key: "restaurant.branches",
    label: "Branches",
    path: "/app/branches",
    icon: "MapPin",
    roles: [ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.BRANCH_READ],
  },
  {
    key: "restaurant.users",
    label: "Personnel",
    path: "/app/users",
    icon: "Users",
    roles: [ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.USER_READ],
  },
  {
    key: "service.floor",
    label: "Service en salle",
    path: "/app/dashboard",
    icon: "Utensils",
    roles: [ROLES.SERVEUR, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.SERVICE_READ],
  },
  {
    key: "service.kitchen",
    label: "Cuisine",
    path: "/app/dashboard",
    icon: "ChefHat",
    roles: [ROLES.CUISINE, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.KITCHEN_READ],
  },
  {
    key: "service.cashier",
    label: "Caisse",
    path: "/app/cashier",
    icon: "CreditCard",
    roles: [ROLES.CAISSE, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.CASHIER_READ],
  },
  {
    key: "operations.stock",
    label: "Stocks",
    path: "/app/stock",
    icon: "Package",
    roles: [ROLES.STOCK, ROLES.ADMIN, ROLES.MANAGER],
    permissions: [PERMISSIONS.STOCK_READ],
  },
  {
    key: "finance.accounting",
    label: "Comptabilite",
    path: "/app/finance",
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
    if (
      item.permissions?.length &&
      !item.permissions.some((permission) => userPermissions.has(permission))
    ) {
      return false;
    }
    return true;
  });
}

export const APP_MENUS = {
  SUPERADMIN: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "restaurants",
      label: "Restaurants",
      icon: "Store",
      defaultView: "restaurants",
      children: [
        { key: "restaurants", label: "Liste restaurants", icon: "Store" },
        {
          key: "create-restaurant",
          label: "Création restaurant",
          icon: "Plus",
        },
        { key: "restaurant-detail", label: "Détail restaurant", icon: "Eye" },
        { key: "activation", label: "Activation / suspension", icon: "Power" },
      ],
    },
    {
      key: "instance-requests",
      label: "Demandes d'instance",
      icon: "ClipboardList",
    },
    { key: "owners", label: "Propriétaires", icon: "Users" },
    {
      key: "subscriptions",
      label: "Abonnements",
      icon: "ReceiptText",
      defaultView: "subscriptions",
      children: [
        { key: "subscriptions", label: "Forfaits", icon: "ReceiptText" },
        { key: "payments", label: "Paiements SaaS", icon: "Wallet" },
      ],
    },
    {
      key: "platform",
      label: "Plateforme",
      icon: "BarChart3",
      defaultView: "platform",
      children: [
        { key: "platform", label: "Supervision plateforme", icon: "Activity" },
        { key: "stats", label: "Statistiques globales", icon: "BarChart3" },
        { key: "activity", label: "Journal plateforme", icon: "History" },
      ],
    },
    { key: "settings", label: "Paramètres", icon: "Settings" },
  ],
  ADMIN: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "staff", label: "Utilisateurs", icon: "Users" },
    {
      key: "branches",
      label: "Branches",
      icon: "MapPin",
    },
    { key: "menu-catalog", label: "Catalogue", icon: "UtensilsCrossed" },
    {
      key: "orders",
      label: "Commandes",
      icon: "ClipboardList",
      children: [
        { key: "orders", label: "Liste commandes", icon: "ClipboardList" },
        { key: "online-dispatch", label: "Livraisons", icon: "Truck" },
      ],
    },
    {
      key: "performance",
      label: "Performances",
      icon: "BarChart3",
    },
    {
      key: "cashier",
      label: "Caisse",
      icon: "CreditCard",
      defaultView: "cashier",
      children: [
        { key: "cashier", label: "Encaissements", icon: "CreditCard" },
        // Ne pas utiliser la clé "payments" : elle ouvre la compta (paiements fournisseurs).
        { key: "completed-payments", label: "Paiements", icon: "Wallet" },
      ],
    },
    {
      key: "stocks",
      label: "Stocks",
      icon: "Box",
      children: [
        { key: "stocks", label: "Produits stock", icon: "Box" },
        { key: "movements", label: "Mouvements", icon: "ClipboardList" },
        { key: "purchases", label: "Achats stock", icon: "ShoppingCart" },
        { key: "accounting", label: "Comptabilité stock", icon: "FileText" },
        { key: "stock-report", label: "Rapports stock", icon: "BarChart3" },
      ],
    },
    {
      key: "comptabilite",
      label: "Comptabilité",
      icon: "Calculator",
      defaultView: "comptabilite",
    },
    {
      key: "reports",
      label: "Rapports",
      icon: "BarChart3",
      children: [
        { key: "daily-report", label: "Rapport du jour", icon: "FileText" },
        { key: "reports", label: "Vue rapports", icon: "BarChart3" },
        { key: "sales-report", label: "Rapports ventes", icon: "TrendingUp" },
        { key: "profit-report", label: "Rapports bénéfices", icon: "Wallet" },
        { key: "server-report", label: "Rapports serveurs", icon: "Users" },
      ],
    },
    { key: "audit-logs", label: "Activités", icon: "History" },
    { key: "settings", label: "Paramètres", icon: "Settings" },
  ],
  MANAGER: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "orders",
      label: "Commandes",
      icon: "ClipboardList",
      children: [
        { key: "orders", label: "Suivi commandes", icon: "ClipboardList" },
        { key: "online-dispatch", label: "Livraisons", icon: "Truck" },
        { key: "order-detail", label: "Détail commande", icon: "Eye" },
        { key: "kitchen-followup", label: "Suivi cuisine", icon: "ChefHat" },
        { key: "service-followup", label: "Suivi service", icon: "Utensils" },
      ],
    },
    {
      key: "tables",
      label: "Tables",
      icon: "Table2",
      children: [
        { key: "tables", label: "Plan de salle", icon: "Table2" },
        { key: "table-assignment", label: "Affectations", icon: "Users" },
      ],
    },
    {
      key: "staff",
      label: "Équipe",
      icon: "Users",
      children: [
        { key: "team", label: "Équipe active", icon: "Users" },
        { key: "alerts", label: "Alertes", icon: "Bell" },
      ],
    },
    { key: "stocks", label: "Stocks", icon: "Box", children: [
      { key: "stocks", label: "Vue stock", icon: "Box" },
      { key: "movements", label: "Mouvements", icon: "ClipboardList" },
      { key: "low-stock", label: "Alertes stock", icon: "AlertTriangle" },
    ] },
    {
      key: "reports",
      label: "Rapports",
      icon: "BarChart3",
      children: [
        { key: "daily-report", label: "Rapport journalier", icon: "FileText" },
        {
          key: "service-performance",
          label: "Performance service",
          icon: "TrendingUp",
        },
        {
          key: "kitchen-performance",
          label: "Performance cuisine",
          icon: "ChefHat",
        },
      ],
    },
  ],
  SERVEUR: [{ key: "dashboard", label: "Service en salle", icon: "Utensils" }],
  CUISINE: [{ key: "dashboard", label: "Production cuisine", icon: "ChefHat" }],
  STOCK: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "menu-catalog", label: "Catalogue", icon: "UtensilsCrossed" },
    { key: "tables", label: "Tables", icon: "Table2" },
    { key: "depots", label: "Dépôts", icon: "Building2" },
    { key: "products", label: "Produits", icon: "Box" },
    { key: "entries", label: "Entrées", icon: "Truck" },
    { key: "transfers", label: "Transferts", icon: "Activity" },
    { key: "outputs", label: "Sorties", icon: "Package" },
    { key: "reports", label: "Mouvements", icon: "BarChart3" },
    { key: "alerts", label: "Alertes stock faible", icon: "AlertTriangle" },
    { key: "comptabilite", label: "Comptabilité", icon: "Calculator", defaultView: "comptabilite" },
  ],
  COMPTABLE: [
    { key: "comptabilite", label: "Comptabilité", icon: "Calculator", defaultView: "comptabilite" },
  ],
  CAISSE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "deliveries", label: "Livraisons", icon: "Truck" },
    { key: "cashier", label: "Encaissements", icon: "CreditCard" },
    { key: "completed-payments", label: "Paiements", icon: "Wallet" },
  ],
};

export const ROLE_DASHBOARDS = {
  SUPERADMIN: {
    title: "Tableau de bord Superadmin",
    subtitle:
      "Création des restaurants, suivi de la plateforme et activation des comptes.",
    accent: "#0F8AB1",
    cards: [
      { title: "Restaurants", value: "0", icon: "Building2" },
      { title: "Actifs", value: "0", icon: "Activity" },
      { title: "Utilisateurs", value: "0", icon: "Users" },
      { title: "Croissance", value: "+18%", icon: "TrendingUp" },
    ],
  },
  ADMIN: {
    title: "Tableau de bord Administrateur",
    subtitle:
      "Pilotage global du restaurant, des équipes, des ventes et des performances.",
    accent: "#0F8AB1",
    cards: [
      { title: "Chiffre d'affaires", value: "0 FCFA", icon: "TrendingUp" },
      { title: "Commandes", value: "0", icon: "ShoppingCart" },
      { title: "Utilisateurs", value: "0", icon: "Users" },
      { title: "Bénéfice", value: "0 FCFA", icon: "Wallet" },
    ],
  },
  MANAGER: {
    title: "Tableau de bord Manager",
    subtitle:
      "Supervision opérationnelle du service, de la cuisine, du stock et des objectifs.",
    accent: "#7c3aed",
    cards: [
      { title: "Commandes du jour", value: "0", icon: "ShoppingCart" },
      { title: "Tables occupées", value: "0", icon: "UtensilsCrossed" },
      { title: "Équipe active", value: "0", icon: "Users" },
      { title: "Objectif atteint", value: "0%", icon: "TrendingUp" },
    ],
  },
  SERVEUR: {
    title: "Service en salle",
    subtitle:
      "Prenez la commande, servez et demandez le paiement en une seule interface.",
    accent: "#ff2c7d",
    cards: [],
  },
  CUISINE: {
    title: "Tableau de bord Cuisine",
    subtitle:
      "Organisation des préparations et priorisation des commandes urgentes.",
    accent: "#10b981",
    cards: [
      { title: "À préparer", value: "0", icon: "ChefHat" },
      { title: "Préparation", value: "0", icon: "Clock3" },
      { title: "Urgentes", value: "0", icon: "AlertTriangle" },
    ],
  },
  STOCK: {
    title: "Tableau de bord Stock / Comptabilité",
    subtitle:
      "Contrôle des produits, livraisons, dépenses et alertes de stock.",
    accent: "#2563eb",
    cards: [
      { title: "Produits", value: "0", icon: "Package" },
      { title: "Livraisons", value: "0", icon: "Truck" },
      { title: "Dépenses", value: "0 FCFA", icon: "Wallet" },
      { title: "Alertes", value: "0", icon: "Bell" },
    ],
  },
  COMPTABLE: {
    title: "Tableau de bord Comptable",
    subtitle:
      "Synthèse des recettes, dépenses, marges et clôtures financières.",
    accent: "#2563eb",
    cards: [
      { title: "Recettes", value: "0 FCFA", icon: "Wallet" },
      { title: "Dépenses", value: "0 FCFA", icon: "TrendingDown" },
      { title: "Marge", value: "0%", icon: "TrendingUp" },
      { title: "Alertes", value: "0", icon: "Bell" },
    ],
  },
  CAISSE: {
    title: "Tableau de bord Caisse",
    subtitle:
      "Encaissements, tickets, paiements en attente et clôture de caisse.",
    accent: "#f59e0b",
    cards: [
      { title: "Encaissements", value: "0 FCFA", icon: "Wallet" },
      { title: "Tickets", value: "0", icon: "ReceiptText" },
      { title: "En attente", value: "0", icon: "Clock3" },
      { title: "Clôture", value: "18:00", icon: "Bell" },
    ],
  },
};
