import { useEffect, useMemo, useState } from "react";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";
import { LoginPanel } from "@/features/auth/components/LoginPanel";
import { SuperadminRestaurants } from "@/features/restaurants/components/SuperadminRestaurants";
import LandingPage from "@/LandingPage";
import { BranchesAdmin } from "@/modules/admin/components/BranchesAdmin";
import { CatalogAdmin } from "@/modules/admin/components/CatalogAdmin";
import { StaffPermissionsAdmin } from "@/modules/admin/components/StaffPermissionsAdmin";
import {
  SuperadminOwners,
  SuperadminPlatform,
  SuperadminSettings,
  SuperadminSubscriptions,
} from "@/modules/platform/components/SuperadminSections";
import { StockOperations } from "@/modules/stock/components/StockOperations";

const initialLogin = { login: "", password: "" };
const initialRestaurant = {
  name: "",
  slug: "",
  owner_email: "",
  owner_username: "",
  owner_password: "",
  owner_first_name: "",
  owner_last_name: "",
};

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

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
};

const viewPathSegments = {
  staff: "users",
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

export default function App() {
  const apiBaseUrl = useMemo(getApiBaseUrl, []);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [restaurantForm, setRestaurantForm] = useState(initialRestaurant);
  const [session, setSession] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [restaurants, setRestaurants] = useState([]);
  const [adminSummary, setAdminSummary] = useState(null);
  const [showRestaurantForm, setShowRestaurantForm] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(() => window.location.pathname !== "/");

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
      })
      .catch(() => {
        localStorage.removeItem("access_token");
        if (window.location.pathname !== "/") setShowLogin(true);
      });
  }, [apiBaseUrl]);

  useEffect(() => {
    function handlePopState() {
      if (session) {
        setActiveView(viewFromPath(session.role));
        return;
      }
      setShowLogin(window.location.pathname === "/login");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session]);

  async function fetchRestaurants() {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      setRestaurants(await response.json());
    } catch {
      setMessage("Impossible de charger la liste des restaurants.");
    }
  }

  async function fetchAdminSummary() {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/dashboard/admin-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      setAdminSummary(await response.json());
    } catch {
      setMessage("Impossible de charger les indicateurs du tableau de bord.");
    }
  }

  function updateLoginField(event) {
    setLoginForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function updateRestaurantField(event) {
    setRestaurantForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
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
        setMessage(data.detail ?? "Identifiants invalides.");
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      setSession(data.user);
      setActiveView("dashboard");
      pushAppRoute(data.user.role, "dashboard", true);
      if (data.user.role === "SUPERADMIN") fetchRestaurants();
      if (data.user.role === "ADMIN") fetchAdminSummary();
    } catch {
      setMessage("API indisponible. Vérifie que le backend est démarré.");
    } finally {
      setIsLoading(false);
    }
  }

  async function requestPasswordReset(login) {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail ?? "Demande de réinitialisation impossible.");
        return null;
      }

      setMessage(data.message);
      return data.reset_token ?? null;
    } catch {
      setMessage("API indisponible. Vérifie que le backend est démarré.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  async function resetPassword(payload) {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail ?? "Réinitialisation impossible.");
        return false;
      }

      setMessage(data.message ?? "Mot de passe réinitialisé.");
      return true;
    } catch {
      setMessage("API indisponible. Vérifie que le backend est démarré.");
      return false;
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
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(restaurantForm),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail ?? "Création du restaurant impossible.");
        return;
      }

      setRestaurantForm(initialRestaurant);
      setShowRestaurantForm(false);
      await fetchRestaurants();
      setMessage(
        `Restaurant "${data.restaurant.name}" créé. Propriétaire: ${data.owner.username}`
      );
    } catch {
      setMessage("API indisponible. Vérifie que le backend est démarré.");
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    setSession(null);
    setMessage("");
    setLoginForm(initialLogin);
    setRestaurants([]);
    setAdminSummary(null);
    setActiveView("dashboard");
    setShowRestaurantForm(false);
    setShowLogin(false);
    window.history.pushState({}, "", "/");
  }

  if (!session && !showLogin) {
    return <LandingPage onLoginClick={() => {
      setShowLogin(true);
      window.history.pushState({}, "", "/login");
    }} />;
  }

  if (!session) {
    return (
      <LoginPanel
        value={loginForm}
        onChange={updateLoginField}
        onSubmit={submitLogin}
        onForgotPassword={requestPasswordReset}
        onResetPassword={resetPassword}
        isLoading={isLoading}
        message={message}
      />
    );
  }

  const overrides =
    session.role === "SUPERADMIN"
      ? {
          Restaurants: String(restaurants.length),
          Actifs: String(restaurants.filter((restaurant) => restaurant.is_active).length),
          Utilisateurs: "Tous",
        }
      : session.role === "ADMIN" && adminSummary
        ? {
            "Chiffre d'affaires": `${Number(adminSummary.revenue || 0).toLocaleString("fr-FR")} FCFA`,
            Commandes: Number(adminSummary.orders_count || 0).toLocaleString("fr-FR"),
            Restaurants: Number(adminSummary.restaurants_count || 0).toLocaleString("fr-FR"),
            Utilisateurs: Number(adminSummary.users_count || 0).toLocaleString("fr-FR"),
            "Utilisateurs actifs": Number(adminSummary.active_users_count || 0).toLocaleString("fr-FR"),
          }
      : {};

  return (
    <DashboardLayout
      role={session.role}
      user={session}
      activeView={activeView}
      onNavigate={(view) => {
        setActiveView(view);
        setMessage("");
        pushAppRoute(session.role, view);
        if (view === "restaurants") {
          setShowRestaurantForm(false);
          fetchRestaurants();
        }
        if (view === "dashboard" && session.role === "ADMIN") {
          fetchAdminSummary();
        }
      }}
      onLogout={logout}
    >
      {renderContent()}

      {message && (
        <p className="mt-8 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
    </DashboardLayout>
  );

  function renderContent() {
    if (session.role !== "SUPERADMIN") {
      const stockViews = ["stocks", "stock", "movements", "suppliers", "inventory", "purchases", "accounting", "reports"];

      if (activeView === "staff" && session.role === "ADMIN") {
        return (
          <StaffPermissionsAdmin
            apiBaseUrl={apiBaseUrl}
            currentUser={session}
            onMessage={setMessage}
          />
        );
      }

      if (activeView === "branches" && session.role === "ADMIN") {
        return <BranchesAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (activeView === "products" && session.role === "ADMIN") {
        return <CatalogAdmin apiBaseUrl={apiBaseUrl} onMessage={setMessage} />;
      }

      if (stockViews.includes(activeView) && ["ADMIN", "MANAGER", "STOCK", "COMPTABLE"].includes(session.role)) {
        return (
          <StockOperations
            apiBaseUrl={apiBaseUrl}
            role={session.role}
            mode={activeView}
            onMessage={setMessage}
          />
        );
      }

      return <RoleDashboard role={session.role} overrides={overrides} />;
    }

    if (activeView === "restaurants") {
      return (
        <SuperadminRestaurants
          restaurants={restaurants}
          form={restaurantForm}
          onChange={updateRestaurantField}
          onSubmit={submitRestaurant}
          isLoading={isLoading}
          showForm={showRestaurantForm}
          onToggleForm={() => setShowRestaurantForm((value) => !value)}
        />
      );
    }

    if (activeView === "owners") {
      return <SuperadminOwners restaurants={restaurants} />;
    }

    if (activeView === "subscriptions") {
      return <SuperadminSubscriptions restaurants={restaurants} />;
    }

    if (activeView === "platform") {
      return <SuperadminPlatform restaurants={restaurants} />;
    }

    if (activeView === "settings") {
      return <SuperadminSettings />;
    }

    return <RoleDashboard role={session.role} overrides={overrides} />;
  }
}
