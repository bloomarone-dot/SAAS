import { lazy, Suspense, useEffect, useMemo, useState } from "react";

// Pages lourdes chargees a la demande (code splitting) pour alleger le bundle initial.
const POSPage = lazy(() => import('./modules/menu/pages/POSPage'));
const KitchenPage = lazy(() => import('./modules/menu/pages/KitchenPage'));
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";
import { RoleWorkspacePage, roleWorkspaceSupports } from "@/components/dashboard/RoleWorkspacePage";
import { LoginPanel } from "@/features/auth/components/LoginPanel";
const SuperadminRestaurants = lazy(() =>
  import("@/features/restaurants/components/SuperadminRestaurants").then((m) => ({
    default: m.SuperadminRestaurants,
  })),
);
import LandingPage from "@/LandingPage";
import { BranchesAdmin } from "@/modules/admin/components/BranchesAdmin";
import { AuditLogsAdmin } from "@/modules/admin/components/AuditLogsAdmin";
import { CatalogAdmin } from "@/modules/admin/components/CatalogAdmin";
import { PromotionsAdmin } from "@/modules/admin/components/PromotionsAdmin";
import { RestaurantSettingsAdmin } from "@/modules/admin/components/RestaurantSettingsAdmin";
import { StaffPermissionsAdmin } from "@/modules/admin/components/StaffPermissionsAdmin";
import CategoriesPage from "@/modules/menu/pages/CategoriesPage";
import DishesPage from "@/modules/menu/pages/DishesPage";
import { ServerClients, ServerFreeTables, ServerHistory, ServerInvoices, ServerOpenTables, ServerOrderWorkspace } from "@/modules/menu/components/ServerClientSections";
import { OrdersAdmin } from "@/modules/orders/components/OrdersAdmin";
import { StockDashboard } from "@/components/dashboard/roles/StockDashboard";

// Sections superadmin et operations stock: chunks volumineux charges a la demande.
const loadSuperadminSections = () => import("@/modules/platform/components/SuperadminSections");
const lazyNamed = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const SuperadminActivation = lazyNamed(loadSuperadminSections, "SuperadminActivation");
const SuperadminGlobalStats = lazyNamed(loadSuperadminSections, "SuperadminGlobalStats");
const SuperadminOwners = lazyNamed(loadSuperadminSections, "SuperadminOwners");
const SuperadminPayments = lazyNamed(loadSuperadminSections, "SuperadminPayments");
const SuperadminPlatformActivity = lazyNamed(loadSuperadminSections, "SuperadminPlatformActivity");
const SuperadminSettings = lazyNamed(loadSuperadminSections, "SuperadminSettings");
const SuperadminSubscriptions = lazyNamed(loadSuperadminSections, "SuperadminSubscriptions");
const SuperadminRestaurantDetail = lazyNamed(loadSuperadminSections, "SuperadminRestaurantDetail");
const StockOperations = lazyNamed(
  () => import("@/modules/stock/components/StockOperations"),
  "StockOperations",
);
import { clearOfflineQueue, flushOfflineQueue, formatApiError, friendlyNetworkMessage, readOfflineQueue } from "@/utils/network";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { getApiBaseUrl } from "@/config/api";
import { SESSION_EXPIRED_EVENT } from "@/config/http";

const initialLogin = { login: "", password: "" };
const initialRestaurant = {
  name: "",
  owner_email: "",
  owner_username: "",
  owner_password: "",
  owner_first_name: "",
  owner_last_name: "",
  owner_phone: "",
  owner_alt_phone: "",
};

const optionalRestaurantFields = new Set(["owner_email", "owner_alt_phone"]);

const rolePaths = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  MANAGER: "manager",
  SERVEUR: "serveur",
  CUISINE: "cuisine",
  CAISSE: "caisse",
  STOCK: "stock",
  COMPTABLE: "comptable",
};

const routeAliases = {
  users: "staff",
  personnel: "staff",
  restaurants: "restaurants",
  categories: "menu-categories",
  dishes: "menu-dishes",
};

const viewPathSegments = {
  staff: "users",
  "menu-categories": "categories",
  "menu-dishes": "dishes",
};

function pathForView(role, view) {
  const base = rolePaths[role] ?? "dashboard";
  const segment = viewPathSegments[view] ?? view;
  return view === "dashboard" ? `/${base}` : `/${base}/${segment}`;
}

function viewFromPath(role, path = window.location.pathname) {
  const base = rolePaths[role];
  if (!base) return "dashboard";
  const cleanPath = path.replace(/\/+$/, "") || "/";
  if (cleanPath === `/${base}`) return "dashboard";
  if (!cleanPath.startsWith(`/${base}/`)) return "dashboard";
  const view = cleanPath.slice(base.length + 2).split("/")[0];
  return routeAliases[view] ?? view ?? "dashboard";
}

function pushAppRoute(role, view, replace = false) {
  const path = pathForView(role, view);
  if (window.location.pathname === path) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
}

function shouldShowLoginForPath(path = window.location.pathname) {
  const firstSegment = path.split("/").filter(Boolean)[0];
  if (!firstSegment) return false;
  if (firstSegment === "login") return true;
  return Object.values(rolePaths).includes(firstSegment);
}

export default function App() {
  const apiBaseUrl = useMemo(getApiBaseUrl, []);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [restaurantForm, setRestaurantForm] = useState(initialRestaurant);
  const [session, setSession] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantTheme, setRestaurantTheme] = useState(null);
  const [adminSummary, setAdminSummary] = useState(null);
  const [showRestaurantForm, setShowRestaurantForm] = useState(false);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(() => shouldShowLoginForPath());
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => readOfflineQueue().length);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("invalid-session");
        const user = await response.json();
        const routeView = viewFromPath(user.role);
        setSession(user);
        setActiveView(routeView);
        pushAppRoute(user.role, routeView, true);
        if (user.role === "SUPERADMIN") fetchRestaurants();
        if (user.role === "ADMIN") fetchAdminSummary();
        if (user.restaurant_id) fetchRestaurantTheme();
      })
      .catch(() => {
        localStorage.removeItem("access_token");
        if (shouldShowLoginForPath()) setShowLogin(true);
      });
  }, [apiBaseUrl]);

  useEffect(() => {
    function refreshQueueState() {
      setOfflineQueueCount(readOfflineQueue().length);
    }

    async function handleOnline() {
      setIsOnline(true);
      const result = await flushOfflineQueue(apiBaseUrl);
      refreshQueueState();
      if (result.synced > 0) setMessage(`${result.synced} action(s) synchronisée(s).`);
      if (session?.role === "ADMIN") fetchAdminSummary();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", refreshQueueState);
    refreshQueueState();
    if (navigator.onLine) handleOnline();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-queue-changed", refreshQueueState);
    };
  }, [apiBaseUrl, session?.role]);

  useAutoRefresh(async () => {
    if (session?.role === "SUPERADMIN") await fetchRestaurants({ silent: true });
    if (session?.role === "ADMIN") await fetchAdminSummary({ silent: true });
  }, 15000, [session?.role, apiBaseUrl]);

  useEffect(() => {
    function handlePopState() {
      if (session) {
        setActiveView(viewFromPath(session.role));
        return;
      }
      setShowLogin(shouldShowLoginForPath());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session]);

  useEffect(() => {
    // Declenche par apiFetch sur un 401 (jeton expire ou revoque cote backend).
    function handleSessionExpired() {
      logout({ expired: true });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  async function fetchRestaurants({ silent = false } = {}) {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      setRestaurants(await response.json());
    } catch {
      if (!silent) setMessage("Impossible de charger la liste des restaurants.");
    }
  }

  async function fetchAdminSummary({ silent = false } = {}) {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/dashboard/admin-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!silent) setMessage(formatApiError(data.detail, "Impossible de charger les indicateurs du tableau de bord."));
        return;
      }
      setAdminSummary(data);
    } catch (error) {
      if (!silent) setMessage(error.message || "Impossible de charger les indicateurs du tableau de bord.");
    }
  }

  async function fetchRestaurantTheme() {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const restaurant = await response.json();
      setRestaurantTheme({
        name: restaurant.name,
        primary: restaurant.primary_color || "#078d50",
        secondary: restaurant.secondary_color || "#003f2f",
      });
    } catch {
      // Theme loading should never block dashboard usage.
    }
  }

  function updateLoginField(event) {
    setLoginForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function updateRestaurantField(event) {
    const { name } = event.target;
    let { value } = event.target;
    if (name === "owner_username") {
      value = value.trim().replace(/\s+/g, "").toLowerCase();
    }
    setRestaurantForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submitLogin(event) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(formatApiError(data.detail, "Identifiants invalides."));
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      setSession(data.user);
      setActiveView("dashboard");
      pushAppRoute(data.user.role, "dashboard", true);
      if (data.user.role === "SUPERADMIN") fetchRestaurants();
      if (data.user.role === "ADMIN") fetchAdminSummary();
      if (data.user.restaurant_id) fetchRestaurantTheme();
    } catch {
      setMessage(`API indisponible à ${apiBaseUrl}. Vérifie que le backend est démarré et accessible depuis ton navigateur.`);
    } finally {
      setIsLoading(false);
    }
  }

  async function submitRestaurant(event) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("access_token");
      const payload = Object.fromEntries(
        Object.entries(restaurantForm)
          .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
          .filter(([key, value]) => !(optionalRestaurantFields.has(key) && !value))
      );
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(formatApiError(data.detail, "Création du restaurant impossible."));
        return;
      }

      setRestaurantForm(initialRestaurant);
      setShowRestaurantForm(false);
      await fetchRestaurants();
      setMessage(
        `Restaurant "${data.restaurant.name}" créé. Propriétaire: ${data.owner.username}`
      );
    } catch {
      setMessage(`API indisponible à ${apiBaseUrl}. Vérifie que le backend est démarré et accessible depuis ton navigateur.`);
    } finally {
      setIsLoading(false);
    }
  }

  function logout({ expired = false } = {}) {
    localStorage.removeItem("access_token");
    setSession(null);
    setLoginForm(initialLogin);
    setRestaurants([]);
    setRestaurantTheme(null);
    setAdminSummary(null);
    setActiveView("dashboard");
    setShowRestaurantForm(false);
    if (expired) {
      setShowLogin(true);
      setMessage("Votre session a expiré, veuillez vous reconnecter.");
    } else {
      setMessage("");
      setShowLogin(false);
      window.history.pushState({}, "", "/");
    }
  }

  if (!session && !showLogin) {
    return <LandingPage apiBaseUrl={apiBaseUrl} />;
  }

  if (!session) {
    return (
      <LoginPanel
        value={loginForm}
        onChange={updateLoginField}
        onSubmit={submitLogin}
        isLoading={isLoading}
        message={message}
      />
    );
  }

  const overrides =
    session.role === "SUPERADMIN"
      ? {
          Restaurants: String(restaurants.length),
          Branches: String(restaurants.reduce((total, restaurant) => total + Number(restaurant.branches_count || 1), 0)),
          Actifs: String(restaurants.filter((restaurant) => restaurant.is_active).length),
          Utilisateurs: "Tous",
          __apiBaseUrl: apiBaseUrl,
          __currentUser: session,
          __restaurants: restaurants,
        }
      : session.role === "ADMIN" && adminSummary
        ? {
            "Chiffre d'affaires": `${Number(adminSummary.revenue || 0).toLocaleString("fr-FR")} FCFA`,
            Commandes: Number(adminSummary.orders_count || 0).toLocaleString("fr-FR"),
            Branches: Number(adminSummary.branches_count || 0).toLocaleString("fr-FR"),
            Utilisateurs: Number(adminSummary.users_count || 0).toLocaleString("fr-FR"),
            "Utilisateurs actifs": Number(adminSummary.active_users_count || 0).toLocaleString("fr-FR"),
            __summary: adminSummary,
            __apiBaseUrl: apiBaseUrl,
            __currentUser: session,
          }
      : { __apiBaseUrl: apiBaseUrl, __currentUser: session };

  return (
    <DashboardLayout
      role={session.role}
      user={session}
      activeView={activeView}
      theme={restaurantTheme}
      apiBaseUrl={apiBaseUrl}
      onNavigate={(view) => {
        setActiveView(view);
        setMessage("");
        pushAppRoute(session.role, view);
        if (view === "restaurants") {
          setShowRestaurantForm(false);
          fetchRestaurants();
        }
        if (view === "create-restaurant") {
          setShowRestaurantForm(true);
        }
        if (view === "restaurant-detail") {
          setSelectedRestaurantId(null);
        }
        if (view === "dashboard" && session.role === "ADMIN") {
          fetchAdminSummary();
        }
      }}
      onLogout={logout}
    >
      <SyncStatus
        apiBaseUrl={apiBaseUrl}
        isOnline={isOnline}
        queueCount={offlineQueueCount}
        onMessage={setMessage}
      />
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16 text-sm font-semibold text-slate-400">
            Chargement…
          </div>
        }
      >
        {renderContent()}
      </Suspense>

      {message && (
        <p className="mt-8 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {friendlyNetworkMessage(message, message)}
        </p>
      )}
    </DashboardLayout>
  );

  function renderContent() {
    if (session.role !== "SUPERADMIN") {
      const stockViews = ["stocks", "stock", "create-stock-product", "movements", "stock-in", "stock-out", "transfer", "suppliers", "inventory", "damages", "purchases", "accounting", "expenses", "reports", "sales-report", "profit-report", "server-report", "financial-report"];

      if (["staff", "create-user", "user-detail"].includes(activeView) && session.role === "ADMIN") {
        return (
          <StaffPermissionsAdmin
            apiBaseUrl={apiBaseUrl}
            currentUser={session}
            onMessage={setMessage}
            onThemeChange={setRestaurantTheme}
            showCreateOnMount={activeView === "create-user"}
          />
        );
      }

      if (["branches", "create-branch"].includes(activeView) && session.role === "ADMIN") {
        return <BranchesAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} focusCreate={activeView === "create-branch"} />;
      }

      if (activeView === "open-table" && ["ADMIN", "MANAGER", "SERVEUR"].includes(session.role)) {
        return <ServerOpenTables restaurantId={session.restaurant_id} />;
      }

      if (activeView === "free-table" && ["ADMIN", "MANAGER", "SERVEUR"].includes(session.role)) {
        return <ServerFreeTables restaurantId={session.restaurant_id} />;
      }

      if (["orders", "new-table-order", "add-order-items", "send-kitchen", "ready-notifications", "served-orders", "request-bill"].includes(activeView) && session.role === "SERVEUR") {
        return <ServerOrderWorkspace restaurantId={session.restaurant_id} role={session.role} view={activeView} />;
      }

      if (["tables", "table-assignment"].includes(activeView) && ["ADMIN", "MANAGER", "SERVEUR"].includes(session.role)) {
        return <POSPage restaurantId={session.restaurant_id} role={session.role} currentUser={session} />;
      }

      if (activeView === "clients" && session.role === "SERVEUR") {
        return <ServerClients />;
      }

      if (activeView === "invoices" && session.role === "SERVEUR") {
        return <ServerInvoices />;
      }

      if (activeView === "history" && session.role === "SERVEUR") {
        return <ServerHistory />;
      }

      if (["orders", "preparation", "ready", "kitchen-detail", "notes", "start-preparation", "dish-ready", "order-ready", "urgent", "preparation-history"].includes(activeView) && session.role === "CUISINE") {
        const filter = ["ready", "dish-ready", "order-ready"].includes(activeView)
          ? "ready"
          : ["preparation", "start-preparation", "preparation-history"].includes(activeView)
            ? "preparation"
            : activeView === "urgent"
              ? "urgent"
              : activeView === "notes"
                ? "notes"
            : "orders";
        return <KitchenPage filter={filter} />;
      }

      if (["orders", "order-detail", "edit-order", "service-followup", "kitchen-followup"].includes(activeView) && ["ADMIN", "MANAGER"].includes(session.role)) {
        return <OrdersAdmin apiBaseUrl={apiBaseUrl} currentUser={session} onMessage={setMessage} />;
      }

      if (activeView === "products" && session.role === "ADMIN") {
        return <CatalogAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (["cashier", "payments", "unpaid-orders", "cash-order-detail", "discounts", "payment-method", "cash", "mobile", "card", "payment-validation", "receipts", "print-receipt", "cancel-payment", "closing", "cash-closing", "cash-report", "payment-totals", "payment-history"].includes(activeView) && ["ADMIN", "CAISSE"].includes(session.role)) {
        return <RoleDashboard role="CAISSE" overrides={{ ...overrides, __activeView: activeView, __currentUser: session, __adminReviewOnly: session.role === "ADMIN" }} />;
      }

      if (["discounts", "promotions"].includes(activeView) && session.role === "ADMIN") {
        return <PromotionsAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (activeView === "settings" && session.role === "ADMIN") {
        return (
          <RestaurantSettingsAdmin
            apiBaseUrl={apiBaseUrl}
            currentUser={session}
            onMessage={setMessage}
          />
        );
      }

      if (activeView === "audit-logs" && session.role === "ADMIN") {
        return <AuditLogsAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (["menu-categories", "create-category"].includes(activeView) && ["ADMIN", "CUISINE"].includes(session.role)) {
        return <CategoriesPage restaurantId={session.restaurant_id} role={session.role} showCreateOnMount={activeView === "create-category"} />;
      }

      if (["menu-dishes", "create-dish", "availability", "dish-unavailable"].includes(activeView) && ["ADMIN", "CUISINE"].includes(session.role)) {
        const initialAvailabilityFilter = activeView === "dish-unavailable" ? "UNAVAILABLE" : "ALL";
        return <DishesPage restaurantId={session.restaurant_id} role={session.role} showCreateOnMount={activeView === "create-dish"} initialAvailabilityFilter={initialAvailabilityFilter} />;
      }

      if (["stocks", "stock"].includes(activeView) && ["ADMIN", "MANAGER", "STOCK", "COMPTABLE"].includes(session.role)) {
        return <StockDashboard variant="stock" overrides={overrides} onNavigate={(view) => {
          setActiveView(view);
          pushAppRoute(session.role, view);
        }} />;
      }

      if (activeView === "damages" && session.role === "CUISINE") {
        return <StockOperations apiBaseUrl={apiBaseUrl} role={session.role} mode="inventory" onMessage={setMessage} />;
      }

      if (stockViews.includes(activeView) && ["ADMIN", "MANAGER", "STOCK", "COMPTABLE"].includes(session.role)) {
        const stockModeMap = {
          "stock-in": "movements",
          "stock-out": "movements",
          "create-stock-product": "stock",
          transfer: "movements",
          damages: "inventory",
        };
        return (
          <StockOperations
            apiBaseUrl={apiBaseUrl}
            role={session.role}
            mode={stockModeMap[activeView] || activeView}
            onMessage={setMessage}
            focusCreate={activeView === "create-stock-product"}
          />
        );
      }

      if (roleWorkspaceSupports(activeView)) {
        return <RoleWorkspacePage role={session.role} view={activeView} overrides={overrides} />;
      }

      return <RoleDashboard role={session.role} overrides={overrides} />;
    }

    if (activeView === "restaurants" || activeView === "create-restaurant") {
      return (
        <SuperadminRestaurants
          restaurants={restaurants}
          form={restaurantForm}
          onChange={updateRestaurantField}
          onSubmit={submitRestaurant}
          isLoading={isLoading}
          showForm={activeView === "create-restaurant" || showRestaurantForm}
          onToggleForm={() => {
            if (activeView === "create-restaurant") {
              setActiveView("restaurants");
              pushAppRoute(session.role, "restaurants");
              setShowRestaurantForm(false);
              return;
            }
            setShowRestaurantForm((value) => !value);
          }}
          onViewRestaurant={(restaurant) => {
            setSelectedRestaurantId(restaurant.id);
            setActiveView("restaurant-detail");
            pushAppRoute(session.role, "restaurant-detail");
          }}
        />
      );
    }

    if (activeView === "restaurant-detail") {
      return (
        <SuperadminRestaurantDetail
          apiBaseUrl={apiBaseUrl}
          restaurants={restaurants}
          selectedRestaurantId={selectedRestaurantId}
          onSelectRestaurant={setSelectedRestaurantId}
          onMessage={setMessage}
        />
      );
    }

    if (activeView === "activation") {
      return (
        <SuperadminActivation
          apiBaseUrl={apiBaseUrl}
          restaurants={restaurants}
          onRefreshRestaurants={fetchRestaurants}
          onMessage={setMessage}
        />
      );
    }

    if (activeView === "owners") {
      return (
        <SuperadminOwners
          apiBaseUrl={apiBaseUrl}
          restaurants={restaurants}
          onMessage={setMessage}
        />
      );
    }

    if (activeView === "subscriptions") {
      return (
        <SuperadminSubscriptions
          apiBaseUrl={apiBaseUrl}
          restaurants={restaurants}
          onMessage={setMessage}
        />
      );
    }

    if (activeView === "payments") {
      return <SuperadminPayments apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
    }

    if (activeView === "platform") {
      return <SuperadminSettings apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
    }

    if (activeView === "stats") {
      return (
        <SuperadminGlobalStats
          apiBaseUrl={apiBaseUrl}
          restaurants={restaurants}
          onMessage={setMessage}
        />
      );
    }

    if (activeView === "activity") {
      return <SuperadminPlatformActivity apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
    }

    if (activeView === "settings") {
      return <SuperadminSettings apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
    }

    if (roleWorkspaceSupports(activeView)) {
      return <RoleWorkspacePage role={session.role} view={activeView} overrides={overrides} />;
    }

    return <RoleDashboard role={session.role} overrides={overrides} />;
  }
}

function SyncStatus({ apiBaseUrl, isOnline, queueCount, onMessage }) {
  if (isOnline && queueCount === 0) return null;
  async function syncNow() {
    const result = await flushOfflineQueue(apiBaseUrl);
    onMessage(result.synced > 0 ? `${result.synced} action(s) synchronisée(s).` : "Aucune action synchronisée pour le moment.");
  }

  function clearQueue() {
    if (!window.confirm("Vider les actions en attente de synchronisation ?")) return;
    clearOfflineQueue();
    onMessage("File de synchronisation vidée.");
  }

  return (
    <div className={`mb-4 flex flex-col gap-3 rounded-xl border p-3 text-sm font-bold md:flex-row md:items-center md:justify-between ${
      isOnline ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"
    }`}>
      <span>
        {isOnline
          ? `${queueCount} action(s) en attente de synchronisation.`
          : `Mode hors connexion actif${queueCount ? ` · ${queueCount} action(s) en attente` : ""}.`}
      </span>
      {queueCount > 0 && (
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={syncNow} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm">
            Synchroniser
          </button>
          <button type="button" onClick={clearQueue} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm">
            Vider
          </button>
        </span>
      )}
    </div>
  );
}
