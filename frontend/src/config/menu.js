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
    {
      key: "restaurants",
      label: "Restaurants",
      icon: "Store",
      children: [
        { key: "restaurants", label: "Liste restaurants", icon: "Store" },
        { key: "create-restaurant", label: "Création restaurant", icon: "Plus" },
        { key: "restaurant-detail", label: "Détail restaurant", icon: "Eye" },
        { key: "activation", label: "Activation / suspension", icon: "Power" },
      ],
    },
    { key: "owners", label: "Propriétaires", icon: "Users" },
    {
      key: "subscriptions",
      label: "Abonnements",
      icon: "ReceiptText",
      children: [
        { key: "subscriptions", label: "Forfaits", icon: "ReceiptText" },
        { key: "payments", label: "Paiements SaaS", icon: "Wallet" },
      ],
    },
    {
      key: "platform",
      label: "Plateforme",
      icon: "BarChart3",
      children: [
        { key: "platform", label: "Paramètres SaaS", icon: "Settings" },
        { key: "stats", label: "Statistiques globales", icon: "BarChart3" },
        { key: "activity", label: "Journal plateforme", icon: "History" },
      ],
    },
    { key: "settings", label: "Paramètres", icon: "Settings" },
  ],
  ADMIN: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "staff",
      label: "Utilisateurs",
      icon: "Users",
      children: [
        { key: "staff", label: "Liste utilisateurs", icon: "Users" },
        { key: "create-user", label: "Création utilisateur", icon: "UserPlus" },
        { key: "user-detail", label: "Détail utilisateur", icon: "User" },
        { key: "roles", label: "Rôles & permissions", icon: "ShieldCheck" },
      ],
    },
    {
      key: "menu-categories",
      label: "Catalogue",
      icon: "UtensilsCrossed",
      children: [
        { key: "menu-categories", label: "Catégories", icon: "ClipboardList" },
        { key: "create-category", label: "Création catégorie", icon: "Plus" },
        { key: "menu-dishes", label: "Plats", icon: "UtensilsCrossed" },
        { key: "create-dish", label: "Création plat", icon: "Plus" },
        { key: "availability", label: "Disponibilités", icon: "CheckCircle2" },
      ],
    },
    {
      key: "orders",
      label: "Commandes",
      icon: "ClipboardList",
      children: [
        { key: "orders", label: "Liste commandes", icon: "ClipboardList" },
        { key: "order-detail", label: "Détail commande", icon: "Eye" },
        { key: "edit-order", label: "Modifier / annuler", icon: "Pencil" },
      ],
    },
    {
      key: "cashier",
      label: "Caisse",
      icon: "CreditCard",
      children: [
        { key: "cashier", label: "Encaissements", icon: "CreditCard" },
        { key: "payments", label: "Paiements", icon: "Wallet" },
        { key: "receipts", label: "Reçus / factures", icon: "ReceiptText" },
        { key: "discounts", label: "Codes promo", icon: "BadgePercent" },
        { key: "expenses", label: "Dépenses", icon: "TrendingDown" },
      ],
    },
    {
      key: "stocks",
      label: "Stocks",
      icon: "Box",
      children: [
        { key: "stocks", label: "Produits stock", icon: "Box" },
        { key: "movements", label: "Mouvements", icon: "ClipboardList" },
        { key: "suppliers", label: "Entrées stock", icon: "Truck" },
        { key: "inventory", label: "Inventaires", icon: "FileText" },
        { key: "purchases", label: "Achats stock", icon: "ShoppingCart" },
        { key: "accounting", label: "Comptabilité stock", icon: "FileText" },
        { key: "reports", label: "Rapports stock", icon: "BarChart3" },
      ],
    },
    {
      key: "branches",
      label: "Branches",
      icon: "MapPin",
      children: [
        { key: "branches", label: "Gestion branches", icon: "MapPin" },
        { key: "create-branch", label: "Création branche", icon: "Plus" },
      ],
    },
    {
      key: "reports",
      label: "Rapports",
      icon: "BarChart3",
      children: [
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
    { key: "stocks", label: "Stocks", icon: "Box" },
    {
      key: "reports",
      label: "Rapports",
      icon: "BarChart3",
      children: [
        { key: "daily-report", label: "Rapport journalier", icon: "FileText" },
        { key: "service-performance", label: "Performance service", icon: "TrendingUp" },
        { key: "kitchen-performance", label: "Performance cuisine", icon: "ChefHat" },
      ],
    },
  ],
  SERVEUR: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "orders",
      label: "Commandes",
      icon: "ClipboardList",
      children: [
        { key: "orders", label: "Suivi commandes", icon: "ClipboardList" },
        { key: "new-table-order", label: "Nouvelle commande", icon: "Plus" },
        { key: "add-order-items", label: "Ajouter plats", icon: "UtensilsCrossed" },
        { key: "send-kitchen", label: "Envoyer cuisine", icon: "ChefHat" },
        { key: "ready-notifications", label: "Commandes prêtes", icon: "Bell" },
        { key: "served-orders", label: "Marquer servie", icon: "CheckCircle2" },
        { key: "request-bill", label: "Demander addition", icon: "ReceiptText" },
      ],
    },
    {
      key: "tables",
      label: "Tables",
      icon: "Table2",
      children: [
        { key: "tables", label: "Liste des tables", icon: "Table2" },
        { key: "open-table", label: "Ouverture table", icon: "Plus" },
        { key: "free-table", label: "Libération table", icon: "Power" },
      ],
    },
    { key: "clients", label: "Clients", icon: "Users" },
    { key: "invoices", label: "Factures", icon: "FileText" },
    {
      key: "history",
      label: "Historiques",
      icon: "History",
      children: [
        { key: "history", label: "Commandes serveur", icon: "History" },
        { key: "served-clients", label: "Clients servis", icon: "Users" },
      ],
    },
  ],
  CUISINE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "orders",
      label: "Commandes cuisine",
      icon: "ClipboardList",
      children: [
        { key: "orders", label: "À préparer", icon: "ClipboardList" },
        { key: "kitchen-detail", label: "Détail commande", icon: "Eye" },
        { key: "notes", label: "Notes spéciales", icon: "FileText" },
        { key: "start-preparation", label: "En préparation", icon: "Clock3" },
        { key: "dish-ready", label: "Plat prêt", icon: "CheckCircle2" },
        { key: "order-ready", label: "Commande prête", icon: "Bell" },
        { key: "urgent", label: "Urgentes", icon: "AlertTriangle" },
      ],
    },
    {
      key: "menu-categories",
      label: "Carte",
      icon: "UtensilsCrossed",
      children: [
        { key: "menu-categories", label: "Catégories carte", icon: "ClipboardList" },
        { key: "menu-dishes", label: "Plats", icon: "UtensilsCrossed" },
        { key: "availability", label: "Disponibilités", icon: "CheckCircle2" },
        { key: "dish-unavailable", label: "Plat indisponible", icon: "AlertTriangle" },
      ],
    },
    { key: "preparation", label: "En préparation", icon: "FileText" },
    { key: "ready", label: "Prêtes", icon: "Package" },
    {
      key: "history",
      label: "Historique",
      icon: "History",
      children: [
        { key: "preparation-history", label: "Préparations", icon: "History" },
        { key: "damages", label: "Avaries", icon: "AlertTriangle" },
      ],
    },
  ],
  STOCK: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "stock",
      label: "Produits stock",
      icon: "Box",
      children: [
        { key: "stock", label: "Liste produits", icon: "Box" },
        { key: "create-stock-product", label: "Création produit", icon: "Plus" },
        { key: "thresholds", label: "Seuils d’alerte", icon: "Bell" },
        { key: "low-stock", label: "Alertes stock faible", icon: "AlertTriangle" },
      ],
    },
    {
      key: "movements",
      label: "Mouvements",
      icon: "ClipboardList",
      children: [
        { key: "movements", label: "Mouvements stock", icon: "ClipboardList" },
        { key: "stock-in", label: "Entrée stock", icon: "Truck" },
        { key: "stock-out", label: "Sortie stock", icon: "Package" },
        { key: "transfer", label: "Transfert rayons", icon: "Activity" },
        { key: "inventory", label: "Ajustement inventaire", icon: "FileText" },
        { key: "damages", label: "Avaries", icon: "AlertTriangle" },
      ],
    },
    {
      key: "suppliers",
      label: "Achats & production",
      icon: "Truck",
      children: [
        { key: "suppliers", label: "Fournisseurs", icon: "Truck" },
        { key: "stock-purchases", label: "Achats stock", icon: "ShoppingCart" },
        { key: "production", label: "Fiches production", icon: "FileText" },
        { key: "ingredients", label: "Ingrédients / plats", icon: "UtensilsCrossed" },
      ],
    },
    {
      key: "reports",
      label: "Rapports stock",
      icon: "BarChart3",
      children: [
        { key: "rotation", label: "Rotation stock", icon: "Activity" },
        { key: "stock-report", label: "Rapport stock", icon: "BarChart3" },
        { key: "period-summary", label: "Récapitulatif période", icon: "CalendarDays" },
      ],
    },
  ],
  COMPTABLE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    { key: "revenue", label: "Recettes", icon: "Wallet" },
    { key: "expenses", label: "Dépenses", icon: "TrendingDown" },
    { key: "margins", label: "Marges par plat", icon: "TrendingUp" },
    { key: "profits", label: "Bénéfices", icon: "BarChart3" },
    { key: "received-payments", label: "Paiements reçus", icon: "CreditCard" },
    { key: "cash-collections", label: "Encaissements caisse", icon: "ReceiptText" },
    { key: "counted-damages", label: "Avaries comptabilisées", icon: "AlertTriangle" },
    { key: "stock-valuation", label: "Stock valorisé", icon: "Box" },
    {
      key: "financial-report",
      label: "États financiers",
      icon: "FileText",
      children: [
        { key: "income", label: "Compte de résultat", icon: "FileText" },
        { key: "cashflow", label: "Flux de trésorerie", icon: "Activity" },
        { key: "balance", label: "Bilan", icon: "Calculator" },
        { key: "ledger", label: "Grand livre", icon: "FileText" },
        { key: "financial-report", label: "Rapport financier", icon: "BarChart3" },
      ],
    },
  ],
  CAISSE: [
    { key: "dashboard", label: "Tableau de bord", icon: "LayoutDashboard" },
    {
      key: "payments",
      label: "Paiements",
      icon: "Wallet",
      children: [
        { key: "unpaid-orders", label: "Commandes non payées", icon: "ClipboardList" },
        { key: "cash-order-detail", label: "Commande à encaisser", icon: "Eye" },
        { key: "discounts", label: "Remise autorisée", icon: "TrendingDown" },
        { key: "payment-method", label: "Mode paiement", icon: "CreditCard" },
        { key: "cash", label: "Espèces", icon: "Wallet" },
        { key: "mobile", label: "Mobile Money", icon: "Phone" },
        { key: "card", label: "Carte", icon: "CreditCard" },
        { key: "payment-validation", label: "Validation paiement", icon: "CheckCircle2" },
      ],
    },
    {
      key: "receipts",
      label: "Tickets",
      icon: "ReceiptText",
      children: [
        { key: "print-receipt", label: "Impression reçu", icon: "ReceiptText" },
        { key: "receipts", label: "Derniers reçus", icon: "History" },
        { key: "cancel-payment", label: "Annuler paiement", icon: "Trash2" },
      ],
    },
    {
      key: "closing",
      label: "Clôture",
      icon: "Clock3",
      children: [
        { key: "cash-closing", label: "Clôture caisse", icon: "Clock3" },
        { key: "cash-report", label: "Rapport caisse", icon: "BarChart3" },
        { key: "payment-totals", label: "Totaux paiement", icon: "Wallet" },
        { key: "payment-history", label: "Historique", icon: "History" },
      ],
    },
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
      { title: "Chiffre d'affaires", value: "0 FCFA", icon: "TrendingUp" },
      { title: "Commandes", value: "0", icon: "ShoppingCart" },
      { title: "Utilisateurs", value: "0", icon: "Users" },
      { title: "Bénéfice", value: "0 FCFA", icon: "Wallet" },
    ],
  },
  MANAGER: {
    title: "Dashboard Manager",
    subtitle: "Supervision opérationnelle du service, de la cuisine, du stock et des objectifs.",
    accent: "#7c3aed",
    cards: [
      { title: "Commandes du jour", value: "0", icon: "ShoppingCart" },
      { title: "Tables occupées", value: "0", icon: "UtensilsCrossed" },
      { title: "Équipe active", value: "0", icon: "Users" },
      { title: "Objectif atteint", value: "0%", icon: "TrendingUp" },
    ],
  },
  SERVEUR: {
    title: "Dashboard Serveur",
    subtitle: "Suivi des commandes, tables servies et temps moyen de service.",
    accent: "#ff2c7d",
    cards: [
      { title: "Commandes", value: "0", icon: "ShoppingCart" },
      { title: "Tables servies", value: "0", icon: "UtensilsCrossed" },
      { title: "Temps moyen", value: "0 min", icon: "Clock3" },
    ],
  },
  CUISINE: {
    title: "Dashboard Cuisine",
    subtitle: "Organisation des préparations et priorisation des commandes urgentes.",
    accent: "#10b981",
    cards: [
      { title: "À préparer", value: "0", icon: "ChefHat" },
      { title: "Préparation", value: "0", icon: "Clock3" },
      { title: "Urgentes", value: "0", icon: "AlertTriangle" },
    ],
  },
  STOCK: {
    title: "Dashboard Stock / Comptabilité",
    subtitle: "Contrôle des produits, livraisons, dépenses et alertes de stock.",
    accent: "#2563eb",
    cards: [
      { title: "Produits", value: "0", icon: "Package" },
      { title: "Livraisons", value: "0", icon: "Truck" },
      { title: "Dépenses", value: "0 FCFA", icon: "Wallet" },
      { title: "Alertes", value: "0", icon: "Bell" },
    ],
  },
  COMPTABLE: {
    title: "Dashboard Comptable",
    subtitle: "Synthèse des recettes, dépenses, marges et clôtures financières.",
    accent: "#2563eb",
    cards: [
      { title: "Recettes", value: "0 FCFA", icon: "Wallet" },
      { title: "Dépenses", value: "0 FCFA", icon: "TrendingDown" },
      { title: "Marge", value: "0%", icon: "TrendingUp" },
      { title: "Alertes", value: "0", icon: "Bell" },
    ],
  },
  CAISSE: {
    title: "Dashboard Caisse",
    subtitle: "Encaissements, tickets, paiements en attente et clôture de caisse.",
    accent: "#f59e0b",
    cards: [
      { title: "Encaissements", value: "0 FCFA", icon: "Wallet" },
      { title: "Tickets", value: "0", icon: "ReceiptText" },
      { title: "En attente", value: "0", icon: "Clock3" },
      { title: "Clôture", value: "18:00", icon: "Bell" },
    ],
  },
};
