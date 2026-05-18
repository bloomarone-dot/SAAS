import { useEffect, useMemo, useState } from "react";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";
import { LoginPanel } from "@/features/auth/components/LoginPanel";
import { SuperadminRestaurants } from "@/features/restaurants/components/SuperadminRestaurants";
import {
  SuperadminOwners,
  SuperadminPlatform,
  SuperadminSettings,
  SuperadminSubscriptions,
} from "@/modules/platform/components/SuperadminSections";

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

export default function App() {
  const apiBaseUrl = useMemo(getApiBaseUrl, []);
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [restaurantForm, setRestaurantForm] = useState(initialRestaurant);
  const [session, setSession] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [restaurants, setRestaurants] = useState([]);
  const [showRestaurantForm, setShowRestaurantForm] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("invalid-session");
        const user = await response.json();
        setSession(user);
        if (user.role === "SUPERADMIN") fetchRestaurants();
      })
      .catch(() => localStorage.removeItem("access_token"));
  }, [apiBaseUrl]);

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
      if (data.user.role === "SUPERADMIN") fetchRestaurants();
    } catch {
      setMessage("API indisponible. Vérifie que le backend est démarré.");
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
    setActiveView("dashboard");
    setShowRestaurantForm(false);
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
          Actifs: String(restaurants.filter((restaurant) => restaurant.is_active).length),
          Utilisateurs: "Tous",
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
        if (view === "restaurants") {
          setShowRestaurantForm(false);
          fetchRestaurants();
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
