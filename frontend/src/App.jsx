import { lazy, Suspense, useEffect, useMemo, useState } from "react";

// Pages lourdes chargees a la demande (code splitting) pour alleger le bundle initial.
const POSPage = lazy(() => import('./modules/menu/pages/POSPage'));
const KitchenPage = lazy(() => import('./modules/menu/pages/KitchenPage'));
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hasModuleAccess } from "@/utils/access";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";
import { RoleWorkspacePage, roleWorkspaceSupports } from "@/components/dashboard/RoleWorkspacePage";
import { ViewErrorBoundary } from "@/components/ViewErrorBoundary";
import { PasswordRecovery, SuperAdminLoginPage } from "@/core/auth";
import { MarketingRoutes, isMarketingPath } from "@/apps/marketing/routes";
import {
  RestaurantPublicRoutes,
  matchRestaurantPublicPath,
} from "@/apps/restaurant-public/routes";
import {
  pushAppRoute,
  viewFromPath,
  isAuthenticatedAppPath,
} from "@/apps/dashboard/routing";
import { applyLegacyRedirect } from "@/core/routing/legacyRedirects";
const SuperadminRestaurants = lazy(() =>
  import("@/features/restaurants/components/SuperadminRestaurants").then((m) => ({
    default: m.SuperadminRestaurants,
  })),
);
import { BranchesAdmin } from "@/modules/admin/components/BranchesAdmin";
import { AuditLogsAdmin } from "@/modules/admin/components/AuditLogsAdmin";
import { AdminReports } from "@/modules/admin/components/AdminReports";
import { CatalogAdmin } from "@/modules/admin/components/CatalogAdmin";
import { DeliveryDispatchAdmin } from "@/modules/admin/components/DeliveryDispatchAdmin";
import { PerformanceAdmin } from "@/modules/admin/components/PerformanceAdmin";
import { DailyReportPage } from "@/modules/admin/components/DailyReportModal";
import { PromotionsAdmin } from "@/modules/admin/components/PromotionsAdmin";
import { RestaurantSettingsAdmin } from "@/modules/admin/components/RestaurantSettingsAdmin";
import { StaffPermissionsAdmin } from "@/modules/admin/components/StaffPermissionsAdmin";
import MenuCatalogAdmin from "@/modules/menu/pages/MenuCatalogAdmin";
import { ServerClients, ServerFreeTables, ServerHistory, ServerInvoices, ServerOpenTables, ServerOrderWorkspace } from "@/modules/menu/components/ServerClientSections";
import { OrdersAdmin } from "@/modules/orders/components/OrdersAdmin";
import { StockDashboard } from "@/components/dashboard/roles/StockDashboard";
import { validateLogoFile, useLogoPreview } from "@/features/restaurants/components/RestaurantProvisionForm";

// Sections superadmin et operations stock: chunks volumineux charges a la demande.
const loadSuperadminSections = () => import("@/modules/platform/components/SuperadminSections");
const lazyNamed = (loader, name) =>
  lazy(() =>
    loader().then((module) => {
      if (!module?.[name]) {
        throw new Error(`Impossible de charger l'écran « ${name} ».`);
      }
      return { default: module[name] };
    }),
  );
const SuperadminActivation = lazyNamed(loadSuperadminSections, "SuperadminActivation");
const SuperadminGlobalStats = lazyNamed(loadSuperadminSections, "SuperadminGlobalStats");
const SuperadminOwners = lazyNamed(loadSuperadminSections, "SuperadminOwners");
const SuperadminPayments = lazyNamed(loadSuperadminSections, "SuperadminPayments");
const SuperadminPlatform = lazyNamed(loadSuperadminSections, "SuperadminPlatform");
const SuperadminPlatformActivity = lazyNamed(loadSuperadminSections, "SuperadminPlatformActivity");
const SuperadminSettings = lazyNamed(loadSuperadminSections, "SuperadminSettings");
const SuperadminSubscriptions = lazyNamed(loadSuperadminSections, "SuperadminSubscriptions");
const SuperadminRestaurantDetail = lazyNamed(loadSuperadminSections, "SuperadminRestaurantDetail");
const SuperadminInstanceRequests = lazyNamed(loadSuperadminSections, "SuperadminInstanceRequests");
const StockOperations = lazyNamed(
  () => import("@/modules/stock/components/StockOperations"),
  "StockOperations",
);
const AccountingOperations = lazyNamed(
  () => import("@/modules/finance/components/AccountingOperations"),
  "AccountingOperations",
);
import { useAutoClearMessage } from "@/utils/useAutoClearMessage";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import {
  clearEffectiveOffline,
  clearOfflineQueue,
  flushOfflineQueue,
  friendlyNetworkMessage,
  getOfflineQueueStats,
  discardFailedOfflineActions,
  retryFailedOfflineActions,
  isNetworkError,
  markEffectiveOffline,
} from "@/utils/network";
import {
  clearCachedBranding,
  clearCachedSession,
  initOfflineFoundation,
  isAccessTokenUsable,
  loadCachedBranding,
  loadCachedSession,
  saveCachedBranding,
  saveCachedSession,
  warmupOfflineCache,
  connectRestaurantRealtime,
} from "@/offline";
import { getApiBaseUrl, resolveApiBaseUrl, isApiReachable, apiFetch, clearToken, SESSION_EXPIRED_EVENT, setToken } from "@/core/api";
import { getPublicHostKind, shouldResolveTenantFromHost, buildRestaurantTheme } from "@/core/tenant";

const initialRestaurant = {
  name: "",
  subdomain: "",
  logo_url: "",
  cover_image_url: "",
  primary_color: "#E4572E",
  secondary_color: "#1F2937",
  accent_color: "#F59E0B",
  background_color: "#FFFFFF",
  text_color: "#0F172A",
  button_color: "#078D50",
  owner_email: "",
  owner_username: "",
  owner_password: "",
  owner_first_name: "",
  owner_last_name: "",
  owner_phone: "",
  owner_alt_phone: "",
};

const optionalRestaurantFields = new Set([
  "subdomain",
  "logo_url",
  "cover_image_url",
  "owner_first_name",
  "owner_email",
  "owner_alt_phone",
]);

// Sans session : /login affiche le portail SaaS. Les espaces /superadmin*,
// /restaurant/:slug* et /app/* sont routés par les apps dédiées.
function shouldShowLoginForPath(path = window.location.pathname) {
  return path.split("/").filter(Boolean)[0] === "login";
}

export default function App() {
  const apiBaseUrl = useMemo(getApiBaseUrl, []);
  const publicHostKind = useMemo(() => getPublicHostKind(), []);
  const [restaurantForm, setRestaurantForm] = useState(initialRestaurant);
  const [session, setSession] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantTheme, setRestaurantTheme] = useState(null);
  const [adminSummary, setAdminSummary] = useState(null);
  const [showRestaurantForm, setShowRestaurantForm] = useState(false);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoError, setLogoError] = useState("");
  const logoPreviewUrl = useLogoPreview(logoFile);
  const [message, setMessage] = useState("");
  useAutoClearMessage(message, setMessage);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [showLogin, setShowLogin] = useState(() => shouldShowLoginForPath());
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => getOfflineQueueStats().total);
  const [offlineFailedCount, setOfflineFailedCount] = useState(() => getOfflineQueueStats().failed);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [viewHistory, setViewHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;
    initOfflineFoundation().then((result) => {
      if (cancelled) return;
      setOfflineReady(Boolean(result?.ready));
      const stats = getOfflineQueueStats();
      setOfflineQueueCount(stats.total);
      setOfflineFailedCount(stats.failed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    function openWithUser(user, { offline = false } = {}) {
      if (!isSessionAllowedOnCurrentHost(user)) {
        rejectWrongHostSession();
        return;
      }
      saveCachedSession(user);
      const routeView = viewFromPath(user);
      setSession(user);
      setActiveView(routeView);
      const nextPath = pushAppRoute(user, routeView, true);
      setCurrentPath(nextPath);
      if (offline) {
        markEffectiveOffline("auth_me");
        setMessage("Mode hors ligne : session locale restaurée.");
        const branding = loadCachedBranding(user.restaurant_id);
        if (branding) setRestaurantTheme(buildRestaurantTheme(branding));
        return;
      }
      if (user.role === "SUPERADMIN") fetchRestaurants();
      if (user.role === "ADMIN") fetchAdminSummary();
      if (user.restaurant_id) {
        fetchRestaurantTheme(user.restaurant_id);
        warmupOfflineCache(user.restaurant_id).catch(() => {});
      }
    }

    apiFetch("/api/v1/auth/me", {
      fallback: "Impossible de vérifier la session.",
      timeout: 4_000,
    })
      .then((user) => openWithUser(user, { offline: false }))
      .catch((error) => {
        // P0.1 : erreur réseau ≠ logout. 401 réel uniquement via SESSION_EXPIRED_EVENT.
        if (isNetworkError(error) && isAccessTokenUsable(token)) {
          const cached = loadCachedSession();
          if (cached) {
            openWithUser(cached, { offline: true });
            return;
          }
          setMessage("Hors ligne : reconnectez-vous une fois en ligne pour mémoriser la session.");
          return;
        }
        if (!isNetworkError(error)) {
          clearToken();
          clearCachedSession();
          if (shouldShowLoginForPath()) setShowLogin(true);
        }
      });
  }, [apiBaseUrl]);

  useEffect(() => {
    async function handleOnline() {
      setIsOnline(true);
      await resolveApiBaseUrl({ force: true });
      clearEffectiveOffline();
      const result = await flushOfflineQueue(getApiBaseUrl());
      refreshQueueState();
      if (result.synced > 0) {
        const conflictNote = result.conflicts ? ` (${result.conflicts} déjà à jour)` : "";
        setMessage(`${result.synced} action(s) synchronisée(s)${conflictNote}.`);
      } else if (result.failed > 0) {
        setMessage(`${result.failed} action(s) en échec — réessayez ou ignorez-les.`);
      }
      if (session?.role === "ADMIN") fetchAdminSummary();
      if (session?.restaurant_id) {
        warmupOfflineCache(session.restaurant_id).catch(() => {});
      }
    }

    async function handleOffline() {
      setIsOnline(false);
      await resolveApiBaseUrl({ force: true }).catch(() => {});
      if (isApiReachable()) {
        clearEffectiveOffline();
        return;
      }
      markEffectiveOffline("browser");
    }

    function refreshQueueState() {
      const stats = getOfflineQueueStats();
      setOfflineQueueCount(stats.total);
      setOfflineFailedCount(stats.failed);
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

  useEffect(() => {
    if (!session?.restaurant_id || !localStorage.getItem("access_token")) return undefined;
    resolveApiBaseUrl({ force: true }).catch(() => {});
    return connectRestaurantRealtime();
  }, [session?.restaurant_id, session?.id]);

  useAutoRefresh(async () => {
    if (session?.role === "SUPERADMIN") await fetchRestaurants({ silent: true });
    if (session?.role === "ADMIN") await fetchAdminSummary({ silent: true });
  }, 15000, [session?.role, apiBaseUrl]);

  useEffect(() => {
    // Migration progressive : anciennes URLs → schéma /restaurant /app /marketing
    if (applyLegacyRedirect(window.location.pathname)) {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  useEffect(() => {
    function handlePopState() {
      if (!session && applyLegacyRedirect(window.location.pathname)) {
        setCurrentPath(window.location.pathname);
        return;
      }
      const nextPath = window.location.pathname;
      setCurrentPath(nextPath);
      if (session) {
        if (!isAuthenticatedAppPath(nextPath)) {
          const dashPath = pushAppRoute(session, "dashboard", true);
          setCurrentPath(dashPath);
          setActiveView("dashboard");
          return;
        }
        setActiveView(viewFromPath(session));
        return;
      }
      setShowLogin(shouldShowLoginForPath(nextPath));
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
    try {
      setRestaurants(await apiFetch("/api/v1/restaurants", { fallback: "Impossible de charger la liste des restaurants." }));
    } catch {
      if (!silent) setMessage("Impossible de charger la liste des restaurants.");
    }
  }

  async function fetchAdminSummary({ silent = false } = {}) {
    try {
      setAdminSummary(await apiFetch("/api/v1/dashboard/admin-summary", {
        fallback: "Impossible de charger les indicateurs du tableau de bord.",
      }));
    } catch (error) {
      if (!silent) setMessage(error.message || "Impossible de charger les indicateurs du tableau de bord.");
    }
  }

  function navigateToView(view, { trackHistory = true } = {}) {
    if (!session || !view) return;
    setActiveView((current) => {
      if (trackHistory && current && current !== view) {
        setViewHistory((history) => [...history.filter((entry) => entry !== view).slice(-19), current]);
      }
      return view;
    });
    setMessage("");
    const nextPath = pushAppRoute(session, view);
    setCurrentPath(nextPath);
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
  }

  function goBackView() {
    if (!session) return;
    setViewHistory((history) => {
      const nextHistory = [...history];
      const previous = nextHistory.pop() || "dashboard";
      setActiveView(previous);
      setCurrentPath(pushAppRoute(session, previous));
      setMessage("");
      return nextHistory;
    });
  }

  async function fetchRestaurantTheme(restaurantId = session?.restaurant_id) {
    try {
      const restaurant = await apiFetch("/api/v1/restaurants/me/branding", {
        fallback: "Impossible de charger le thème du restaurant.",
        timeout: 5_000,
      });
      setRestaurantTheme(buildRestaurantTheme(restaurant));
      const id = restaurant?.id || restaurantId;
      if (id) saveCachedBranding(id, restaurant);
    } catch {
      const cached = loadCachedBranding(restaurantId);
      if (cached) setRestaurantTheme(buildRestaurantTheme(cached));
    }
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

  function handleLogoFileChange(event) {
    const file = event.target.files?.[0] || null;
    const error = validateLogoFile(file);
    setLogoError(error);
    setLogoFile(error ? null : file);
    if (error) {
      event.target.value = "";
    }
  }

  function handleAuthenticated(data) {
    // Post-connexion commun aux pages publiques (superadmin / restaurant par slug).
    if (!isSessionAllowedOnCurrentHost(data.user)) {
      rejectWrongHostSession();
      return;
    }
    clearEffectiveOffline();
    setToken(data.access_token);
    saveCachedSession(data.user);
    setSession(data.user);
    setActiveView("dashboard");
    setViewHistory([]);
    setShowLogin(false);
    setRecoveryMode(false);
    const nextPath = pushAppRoute(data.user, "dashboard", true);
    setCurrentPath(nextPath);
    if (data.user.role === "SUPERADMIN") fetchRestaurants();
    if (data.user.role === "ADMIN") fetchAdminSummary();
    if (data.restaurant_branding) {
      setRestaurantTheme(buildRestaurantTheme(data.restaurant_branding));
      if (data.user.restaurant_id) {
        saveCachedBranding(data.user.restaurant_id, data.restaurant_branding);
      }
    } else if (data.user.restaurant_id) {
      fetchRestaurantTheme(data.user.restaurant_id);
    }
    if (data.user.restaurant_id) {
      warmupOfflineCache(data.user.restaurant_id).catch(() => {});
    }
  }

  function isSessionAllowedOnCurrentHost(user) {
    if (publicHostKind === "platform") return user.role === "SUPERADMIN";
    if (publicHostKind === "restaurant") return user.role !== "SUPERADMIN";
    return true;
  }

  function rejectWrongHostSession() {
    clearToken();
    clearCachedSession();
    clearCachedBranding();
    setSession(null);
    setShowLogin(true);
    setMessage(
      publicHostKind === "platform"
        ? "Utilisez un compte superadmin pour accéder à la plateforme."
        : "Utilisez l'espace de connexion dédié à ce restaurant.",
    );
  }

  async function submitRestaurant(event) {
    event.preventDefault();
    if (logoError) {
      setMessage(logoError);
      return;
    }
    setIsLoading(true);
    setMessage("");

    try {
      const payload = Object.fromEntries(
        Object.entries(restaurantForm)
          .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
          .filter(([key, value]) => !(optionalRestaurantFields.has(key) && !value))
      );
      // logo_url n'est plus saisi manuellement : upload après création si fichier présent.
      delete payload.logo_url;

      const data = await apiFetch("/api/v1/restaurants", {
        method: "POST",
        body: payload,
        fallback: "Création du restaurant impossible.",
      });

      if (logoFile && data?.restaurant?.id) {
        const body = new FormData();
        body.append("file", logoFile);
        await apiFetch(`/api/v1/restaurants/${data.restaurant.id}/logo`, {
          method: "POST",
          body,
          fallback: "Restaurant créé, mais l'import du logo a échoué.",
        });
      }

      setRestaurantForm(initialRestaurant);
      setLogoFile(null);
      setLogoError("");
      setShowRestaurantForm(false);
      await fetchRestaurants();
      setMessage(
        `Restaurant "${data.restaurant.name}" créé (slug: ${data.restaurant.slug}). Propriétaire: ${data.owner.username}`
      );
    } catch (error) {
      setMessage(error.message || "Création du restaurant impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  function logout({ expired = false } = {}) {
    clearToken();
    clearCachedSession();
    clearCachedBranding();
    clearEffectiveOffline();
    setSession(null);
    setRestaurants([]);
    setRestaurantTheme(null);
    setAdminSummary(null);
    setActiveView("dashboard");
    setViewHistory([]);
    setShowRestaurantForm(false);
    if (expired) {
      setShowLogin(true);
      setMessage("Votre session a expiré, veuillez vous reconnecter.");
      window.history.pushState({}, "", "/login");
      setCurrentPath("/login");
    } else {
      setMessage("");
      setShowLogin(false);
      window.history.pushState({}, "", "/");
      setCurrentPath("/");
    }
  }

  if (!session && currentPath.startsWith("/reset-password")) {
    return (
      <PasswordRecovery
        apiBaseUrl={apiBaseUrl}
        mode="reset"
        token={new URLSearchParams(window.location.search).get("token") || ""}
        onBackToLogin={() => {
          window.history.pushState({}, "", "/login");
          setCurrentPath("/login");
          setRecoveryMode(false);
          setShowLogin(true);
        }}
      />
    );
  }

  // Surfaces publiques (marketing / restaurant) : uniquement hors session.
  // Les clients publics n'accèdent jamais au dashboard (/app).

  if (!session) {
    const publicPath = currentPath.replace(/\/+$/, "") || "/";

    if (publicHostKind === "platform") {
      return <SuperAdminLoginPage apiBaseUrl={apiBaseUrl} onAuthenticated={handleAuthenticated} />;
    }

    // Sous-domaine restaurant : vitrine tenant (host resolve).
    if (shouldResolveTenantFromHost()) {
      return (
        <RestaurantPublicRoutes
          path={publicPath}
          apiBaseUrl={apiBaseUrl}
          onAuthenticated={handleAuthenticated}
          hostMode
        />
      );
    }

    if (publicPath === "/superadmin" || publicPath.startsWith("/superadmin/")) {
      return <SuperAdminLoginPage apiBaseUrl={apiBaseUrl} onAuthenticated={handleAuthenticated} />;
    }

    // Accès /app sans session → login plateforme (jamais de dashboard public).
    if (isAuthenticatedAppPath(publicPath)) {
      return (
        <MarketingRoutes
          path="/login"
          apiBaseUrl={apiBaseUrl}
          message={message || "Connectez-vous pour accéder à l'application."}
          recoveryMode={recoveryMode}
          onAuthenticated={handleAuthenticated}
          onForgotPassword={() => setRecoveryMode(true)}
          onBackFromRecovery={() => setRecoveryMode(false)}
        />
      );
    }

    // /restaurant/:slug[/menu|/order|/contact|/login]
    if (matchRestaurantPublicPath(publicPath)) {
      return (
        <RestaurantPublicRoutes
          path={publicPath}
          apiBaseUrl={apiBaseUrl}
          onAuthenticated={handleAuthenticated}
        />
      );
    }

    // Site SaaS global : / · /features · /pricing · /contact · /login
    // /login = connexion plateforme (SUPERADMIN). Les comptes restaurant
    // passent par leur sous-domaine ou /restaurant/:slug/login.
    if (publicHostKind === "saas" || isMarketingPath(publicPath) || showLogin) {
      return (
        <MarketingRoutes
          path={showLogin && !isMarketingPath(publicPath) ? "/login" : publicPath}
          apiBaseUrl={apiBaseUrl}
          message={message}
          recoveryMode={recoveryMode}
          onAuthenticated={handleAuthenticated}
          onForgotPassword={() => setRecoveryMode(true)}
          onBackFromRecovery={() => setRecoveryMode(false)}
        />
      );
    }

    return (
      <MarketingRoutes
        path="/"
        apiBaseUrl={apiBaseUrl}
        message={message}
        recoveryMode={recoveryMode}
        onAuthenticated={handleAuthenticated}
        onForgotPassword={() => setRecoveryMode(true)}
        onBackFromRecovery={() => setRecoveryMode(false)}
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
            theme: restaurantTheme,
          }
      : { __apiBaseUrl: apiBaseUrl, __currentUser: session, theme: restaurantTheme };

  return (
    <DashboardLayout
      role={session.role}
      user={session}
      activeView={activeView}
      theme={restaurantTheme}
      apiBaseUrl={apiBaseUrl}
      canGoBack={viewHistory.length > 0 || activeView !== "dashboard"}
      onBack={goBackView}
      onNavigate={navigateToView}
      onLogout={logout}
    >
      <SyncStatus
        apiBaseUrl={apiBaseUrl}
        isOnline={isOnline}
        queueCount={offlineQueueCount}
        failedCount={offlineFailedCount}
        offlineReady={offlineReady}
        onMessage={setMessage}
        onQueueChange={() => {
          const stats = getOfflineQueueStats();
          setOfflineQueueCount(stats.total);
          setOfflineFailedCount(stats.failed);
        }}
      />
      <ViewErrorBoundary
        key={activeView}
        onBack={goBackView}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-slate-400">
              Chargement…
            </div>
          }
        >
          {renderContent() ?? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
              <p className="text-sm font-black uppercase tracking-wide text-amber-700">Page indisponible</p>
              <h2 className="mt-2 text-xl font-black">Cet écran n’a pas pu être chargé</h2>
              <p className="mt-2 text-sm font-semibold">
                Revenez au tableau de bord ou choisissez une autre rubrique dans le menu.
              </p>
              <button
                type="button"
                onClick={() => navigateToView("dashboard", { trackHistory: false })}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-800 px-4 py-2 text-sm font-bold text-white"
              >
                Retour tableau de bord
              </button>
            </div>
          )}
        </Suspense>
      </ViewErrorBoundary>

      {message && (
        <div className="mt-8 flex max-w-3xl items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <p>{friendlyNetworkMessage(message, message)}</p>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="shrink-0 text-emerald-800 hover:text-emerald-950"
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}
    </DashboardLayout>
  );

  function renderContent() {
    const navigateFromDashboard = (view) => navigateToView(view);

    if (session.role !== "SUPERADMIN") {
      if (session.role === "SERVEUR" && activeView === "dashboard") {
        return <RoleDashboard role="SERVEUR" overrides={{ ...overrides, __currentUser: session }} onNavigate={navigateFromDashboard} />;
      }

      if (activeView === "service-dashboard" && hasModuleAccess(session, "SERVEUR") && session.role !== "SERVEUR") {
        return <RoleDashboard role="SERVEUR" overrides={{ ...overrides, __currentUser: session }} onNavigate={navigateFromDashboard} />;
      }

      if (session.role === "CUISINE" && activeView === "dashboard") {
        return <RoleDashboard role="CUISINE" overrides={{ ...overrides, __currentUser: session }} onNavigate={navigateFromDashboard} />;
      }

      if (activeView === "kitchen-dashboard" && hasModuleAccess(session, "CUISINE") && session.role !== "CUISINE") {
        return <RoleDashboard role="CUISINE" overrides={{ ...overrides, __currentUser: session }} onNavigate={navigateFromDashboard} />;
      }

      if (activeView === "cashier-dashboard" && hasModuleAccess(session, "CAISSE") && session.role !== "CAISSE") {
        return (
          <RoleDashboard
            role="CAISSE"
            overrides={{ ...overrides, __activeView: "dashboard", __currentUser: session }}
          />
        );
      }

      // Comptabilité (partie double) : le rôle COMPTABLE utilise le nouveau module dédié.
      if (session.role === "COMPTABLE") {
        return (
          <AccountingOperations
            apiBaseUrl={apiBaseUrl}
            mode={activeView}
            role={session.role}
            onMessage={setMessage}
            onNavigate={navigateFromDashboard}
          />
        );
      }

      // Codes promo admin : avant la caisse (view "discounts" partagée).
      if (["discounts", "promotions"].includes(activeView) && session.role === "ADMIN") {
        return <PromotionsAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      // Caisse AVANT compta : évite que "payments"/"cash" du menu Caisse ouvrent la compta.
      const caisseOperatorViews = [
        "cashier",
        "deliveries",
        "delivery-create",
        "delivery-orders",
        "payments",
        "completed-payments",
        "unpaid-orders",
        "cash-order-detail",
        "discounts",
        "payment-method",
        "cash",
        "mobile",
        "card",
        "payment-validation",
        "receipts",
        "print-receipt",
        "cancel-payment",
        "closing",
        "cash-closing",
        "cash-report",
        "payment-totals",
        "payment-history",
      ];
      // Clés réservées à la compta admin (ne pas les router vers CaisseDashboard).
      const accountingOwnedViews = new Set(["payments", "cash"]);
      const caisseAdminReviewViews = caisseOperatorViews.filter(
        (view) => view !== "discounts" && !accountingOwnedViews.has(view),
      );

      if (caisseOperatorViews.includes(activeView) && hasModuleAccess(session, "CAISSE")) {
        return (
          <RoleDashboard
            role="CAISSE"
            overrides={{ ...overrides, __activeView: activeView, __currentUser: session }}
          />
        );
      }

      if (caisseAdminReviewViews.includes(activeView) && session.role === "ADMIN") {
        return (
          <RoleDashboard
            role="CAISSE"
            overrides={{
              ...overrides,
              __activeView: activeView,
              __currentUser: session,
              __adminReviewOnly: true,
            }}
          />
        );
      }

      // Accès comptabilité (vues dédiées sans collision avec le stock).
      const accountingViews = ["comptabilite", "accounts", "journals", "entries", "expenses", "expense-analytics", "encaissements", "revenues", "payments", "cash", "statements", "food-cost", "echeancier", "rapprochement"];
      if (accountingViews.includes(activeView) && session.role === "ADMIN") {
        return (
          <AccountingOperations
            apiBaseUrl={apiBaseUrl}
            mode={activeView}
            role={session.role}
            onMessage={setMessage}
            onNavigate={navigateFromDashboard}
          />
        );
      }
      if (activeView === "comptabilite" && hasModuleAccess(session, "COMPTABLE")) {
        return (
          <AccountingOperations
            apiBaseUrl={apiBaseUrl}
            mode="dashboard"
            role={session.role}
            onMessage={setMessage}
            onNavigate={navigateFromDashboard}
          />
        );
      }
      const stockAccountingViews = ["accounts", "journals", "accounting-entries", "accounting-expenses", "expense-analytics", "accounting-revenues", "accounting-payments", "cash", "statements", "encaissements", "food-cost", "echeancier", "rapprochement"];
      if (stockAccountingViews.includes(activeView) && hasModuleAccess(session, "COMPTABLE")) {
        return (
          <AccountingOperations
            apiBaseUrl={apiBaseUrl}
            mode={activeView}
            role={session.role}
            onMessage={setMessage}
            onNavigate={navigateFromDashboard}
          />
        );
      }

      if (activeView === "alerts" && session.role === "MANAGER") {
        return <RoleWorkspacePage role={session.role} view={activeView} overrides={overrides} />;
      }

      const stockViews = ["stocks", "stock", "products", "depots", "entries", "transfers", "outputs", "inventories", "alerts", "low-stock", "create-stock-product", "movements", "stock-in", "stock-out", "transfer", "suppliers", "inventory", "damages", "purchases", "accounting", "stock-report"];

      if (["staff", "user-detail"].includes(activeView) && session.role === "ADMIN") {
        return (
          <StaffPermissionsAdmin
            apiBaseUrl={apiBaseUrl}
            currentUser={session}
            onMessage={setMessage}
            onThemeChange={setRestaurantTheme}
          />
        );
      }

      if (activeView === "branches" && session.role === "ADMIN") {
        return <BranchesAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} showCreateOnMount={false} />;
      }

      if (activeView === "open-table" && hasModuleAccess(session, "SERVEUR")) {
        return <ServerOpenTables restaurantId={session.restaurant_id} />;
      }

      if (activeView === "free-table" && hasModuleAccess(session, "SERVEUR")) {
        return <ServerFreeTables restaurantId={session.restaurant_id} />;
      }

      if (["orders", "new-table-order", "add-order-items", "send-kitchen", "ready-notifications", "served-orders", "request-bill", "request-payment"].includes(activeView) && hasModuleAccess(session, "SERVEUR")) {
        return <ServerOrderWorkspace restaurantId={session.restaurant_id} role={session.role} view={activeView} />;
      }

      if (["tables", "table-assignment"].includes(activeView) && ["ADMIN", "MANAGER", "STOCK"].includes(session.role)) {
        return <POSPage restaurantId={session.restaurant_id} role={session.role} currentUser={session} />;
      }

      if (activeView === "clients" && hasModuleAccess(session, "SERVEUR")) {
        return <ServerClients />;
      }

      if (activeView === "invoices" && hasModuleAccess(session, "SERVEUR")) {
        return <ServerInvoices />;
      }

      if (activeView === "history" && hasModuleAccess(session, "SERVEUR")) {
        return <ServerHistory />;
      }

      if (["orders", "preparation", "ready", "kitchen-detail", "notes", "start-preparation", "dish-ready", "order-ready", "urgent", "preparation-history"].includes(activeView) && hasModuleAccess(session, "CUISINE")) {
        const filter = ["ready", "dish-ready", "order-ready"].includes(activeView)
          ? "ready"
          : ["preparation", "start-preparation", "preparation-history"].includes(activeView)
            ? "preparation"
            : activeView === "urgent"
              ? "urgent"
              : activeView === "notes"
                ? "notes"
            : "orders";
        return <KitchenPage filter={filter} restaurantId={session.restaurant_id} />;
      }

      if (["orders", "order-detail", "edit-order", "service-followup", "kitchen-followup"].includes(activeView) && ["ADMIN", "MANAGER"].includes(session.role)) {
        return <OrdersAdmin apiBaseUrl={apiBaseUrl} currentUser={session} onMessage={setMessage} />;
      }

      if (["performance", "server-performance", "cashier-performance"].includes(activeView) && ["ADMIN", "MANAGER"].includes(session.role)) {
        const tab = activeView === "cashier-performance" ? "cashier" : "server";
        return <PerformanceAdmin initialTab={tab} onMessage={setMessage} />;
      }

      if (activeView === "daily-report" && ["ADMIN", "MANAGER"].includes(session.role)) {
        return (
          <DailyReportPage
            onClose={() => navigateToView("dashboard", { trackHistory: false })}
          />
        );
      }

      if (["online-dispatch", "deliveries", "delivery-create", "delivery-orders"].includes(activeView) && ["ADMIN", "MANAGER"].includes(session.role)) {
        return <DeliveryDispatchAdmin currentUser={session} onMessage={setMessage} />;
      }

      if (activeView === "products" && session.role === "ADMIN") {
        return <CatalogAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (activeView === "settings" && session.role === "ADMIN") {
        return (
          <RestaurantSettingsAdmin
            apiBaseUrl={apiBaseUrl}
            currentUser={session}
            onMessage={setMessage}
            onThemeChange={setRestaurantTheme}
          />
        );
      }

      if (activeView === "audit-logs" && session.role === "ADMIN") {
        return <AuditLogsAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (["reports", "sales-report", "profit-report", "server-report"].includes(activeView) && session.role === "ADMIN") {
        return (
          <AdminReports
            initialView={activeView}
            onMessage={setMessage}
            onNavigate={navigateFromDashboard}
          />
        );
      }

      if (
        ["menu-catalog", "menu-categories", "menu-dishes", "availability", "create-category", "create-dish", "dish-unavailable"].includes(activeView) &&
        ["ADMIN", "CUISINE", "STOCK"].includes(session.role)
      ) {
        return <MenuCatalogAdmin restaurantId={session.restaurant_id} role={session.role} onMessage={setMessage} />;
      }

      if (["stocks", "stock"].includes(activeView) && hasModuleAccess(session, "STOCK")) {
        return <StockDashboard variant="stock" overrides={overrides} onNavigate={navigateFromDashboard} />;
      }

      if (activeView === "damages" && hasModuleAccess(session, "CUISINE")) {
        return <StockOperations apiBaseUrl={apiBaseUrl} role={session.role} mode="inventory" onMessage={setMessage} />;
      }

      if (stockViews.includes(activeView) && hasModuleAccess(session, "STOCK")) {
        const stockModeMap = {
          "stock-in": "movements",
          "stock-out": "movements",
          "create-stock-product": "stock",
          transfer: "movements",
          damages: "outputs",
          inventory: "reports",
          purchases: "entries",
          accounting: "reports",
          "stock-report": "reports",
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

      if (activeView === "reports" && session.role === "STOCK") {
        return (
          <StockOperations
            apiBaseUrl={apiBaseUrl}
            role={session.role}
            mode="reports"
            onMessage={setMessage}
          />
        );
      }

      if (roleWorkspaceSupports(activeView)) {
        return <RoleWorkspacePage role={session.role} view={activeView} overrides={overrides} />;
      }

      return <RoleDashboard role={session.role} overrides={overrides} onNavigate={navigateFromDashboard} />;
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
          logoFile={logoFile}
          logoPreviewUrl={logoPreviewUrl}
          onLogoFileChange={handleLogoFileChange}
          logoError={logoError}
          onToggleForm={() => {
            if (activeView === "create-restaurant") {
              navigateToView("restaurants");
              setShowRestaurantForm(false);
              return;
            }
            setShowRestaurantForm((value) => !value);
          }}
          onViewRestaurant={(restaurant) => {
            setSelectedRestaurantId(restaurant.id);
            navigateToView("restaurant-detail");
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
          onRefreshRestaurants={fetchRestaurants}
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

    if (activeView === "instance-requests") {
      return (
        <SuperadminInstanceRequests
          apiBaseUrl={apiBaseUrl}
          onMessage={setMessage}
          onRefreshRestaurants={fetchRestaurants}
        />
      );
    }

    if (activeView === "platform") {
      return (
        <SuperadminPlatform
          apiBaseUrl={apiBaseUrl}
          restaurants={restaurants}
          onMessage={setMessage}
          onRefreshRestaurants={fetchRestaurants}
        />
      );
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

    return <RoleDashboard role={session.role} overrides={overrides} onNavigate={navigateFromDashboard} />;
  }
}

function SyncStatus({
  apiBaseUrl,
  isOnline,
  queueCount,
  failedCount = 0,
  offlineReady = false,
  onMessage,
  onQueueChange,
}) {
  const [syncing, setSyncing] = useState(false);
  const pendingCount = Math.max(0, queueCount - failedCount);

  // En ligne sans file : pas de bandeau permanent (évite le bruit UI).
  if (isOnline && queueCount === 0) return null;

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await flushOfflineQueue(apiBaseUrl);
      onQueueChange?.();
      if (result.synced > 0) {
        const conflictNote = result.conflicts ? ` (${result.conflicts} déjà à jour)` : "";
        onMessage(`${result.synced} action(s) synchronisée(s)${conflictNote}.`);
      } else if (result.failed > 0) {
        onMessage(`${result.failed} action(s) en échec après plusieurs tentatives.`);
      } else {
        onMessage("Aucune action synchronisée pour le moment.");
      }
    } finally {
      setSyncing(false);
    }
  }

  function clearQueue() {
    if (!window.confirm("Vider les actions en attente de synchronisation ?")) return;
    clearOfflineQueue();
    onQueueChange?.();
    onMessage("File de synchronisation vidée.");
  }

  function retryFailed() {
    retryFailedOfflineActions();
    onQueueChange?.();
    onMessage("Actions en échec remises en file. Lancez une synchronisation.");
  }

  function discardFailed() {
    if (!window.confirm("Ignorer définitivement les actions en échec ?")) return;
    discardFailedOfflineActions();
    onQueueChange?.();
    onMessage("Actions en échec ignorées.");
  }

  return (
    <div className={`mb-4 flex flex-col gap-3 rounded-lg border p-3 text-sm font-bold md:flex-row md:items-center md:justify-between ${
      !isOnline
        ? "border-red-200 bg-red-50 text-red-700"
        : failedCount > 0
          ? "border-orange-200 bg-orange-50 text-orange-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
    }`}>
      <span>
        {!isOnline
          ? `Mode hors connexion actif${queueCount ? ` · ${queueCount} action(s) en attente` : ""}${offlineReady ? " · stockage local OK" : ""}.`
          : failedCount > 0
            ? `${pendingCount} en attente · ${failedCount} en échec.`
            : `${queueCount} action(s) en attente de synchronisation.`}
      </span>
      {queueCount > 0 && (
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={syncing || !isOnline}
            onClick={syncNow}
            className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm disabled:opacity-50"
          >
            {syncing ? "Sync…" : "Synchroniser"}
          </button>
          {failedCount > 0 && (
            <>
              <button type="button" onClick={retryFailed} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                Réessayer échecs
              </button>
              <button type="button" onClick={discardFailed} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm">
                Ignorer échecs
              </button>
            </>
          )}
          <button type="button" onClick={clearQueue} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm">
            Vider
          </button>
        </span>
      )}
    </div>
  );
}
