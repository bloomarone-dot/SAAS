import { useEffect, useState } from "react";
import { Eye, EyeOff, LogIn, ShieldCheck, Store } from "lucide-react";

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function postLogin(url, login, password) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data?.detail) ? data.detail.map((d) => d.msg).join(" · ") : data?.detail;
    throw new Error(detail || "Connexion impossible.");
  }
  return data;
}

const inputClass =
  "h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50";

function LoginCard({ icon, title, subtitle, accent, buttonLabel, onSubmit, footer }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSubmit(login.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: accent }}>
            {icon}
          </div>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">Email ou identifiant</span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus className={inputClass} placeholder="Email, nom utilisateur ou téléphone" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">Mot de passe</span>
            <div className="relative">
              <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className={`${inputClass} pr-12`} placeholder="Mot de passe" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-black text-white shadow-sm transition hover:brightness-95 disabled:opacity-60" style={{ background: accent }}>
            <LogIn size={16} /> {busy ? "Connexion…" : buttonLabel}
          </button>
        </form>
        {footer}
        <p className="mt-6 text-center text-xs text-slate-400">© 2026 Bloomar One</p>
      </div>
    </main>
  );
}

export function SuperAdminLoginPage({ apiBaseUrl, onAuthenticated }) {
  return (
    <LoginCard
      icon={<ShieldCheck size={28} />}
      title="Administration plateforme"
      subtitle="Espace réservé au super administrateur"
      accent="#7c3aed"
      buttonLabel="Accéder à la plateforme"
      onSubmit={async (login, password) => {
        const data = await postLogin(`${apiBaseUrl}/api/v1/auth/superadmin/login`, login, password);
        onAuthenticated(data);
      }}
    />
  );
}

export function RestaurantLoginPage({ apiBaseUrl, slug, onAuthenticated }) {
  const [restaurant, setRestaurant] = useState(null);
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/v1/restaurants/public/${slug}`).then((r) => (r.ok ? r.json() : null)).then(setRestaurant).catch(() => {});
  }, [apiBaseUrl, slug]);

  const accent = restaurant?.primary_color || "#078d50";
  return (
    <LoginCard
      icon={restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <Store size={28} />}
      title={restaurant?.name || "Connexion restaurant"}
      subtitle="Connectez-vous à votre espace"
      accent={accent}
      buttonLabel="Se connecter"
      onSubmit={async (login, password) => {
        const data = await postLogin(`${apiBaseUrl}/api/v1/auth/restaurants/${slug}/login`, login, password);
        onAuthenticated(data);
      }}
      footer={
        <button type="button" onClick={() => navigate(`/r/${slug}`)} className="mt-4 block w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800">
          ← Retour à la page du restaurant
        </button>
      }
    />
  );
}

export function RestaurantLandingPage({ apiBaseUrl, slug }) {
  const [restaurant, setRestaurant] = useState(undefined); // undefined=loading, null=not found

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/v1/restaurants/public/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRestaurant)
      .catch(() => setRestaurant(null));
  }, [apiBaseUrl, slug]);

  if (restaurant === undefined) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">Chargement…</main>;
  }
  if (restaurant === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <h1 className="text-5xl font-black text-slate-300">404</h1>
        <p className="text-sm font-semibold text-slate-500">Ce restaurant n'existe pas.</p>
        <a href="/" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Accueil</a>
      </main>
    );
  }

  const accent = restaurant.primary_color || "#078d50";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        {restaurant.logo_url ? (
          <img src={restaurant.logo_url} alt="" className="mx-auto mb-5 h-20 w-20 rounded-2xl object-cover" />
        ) : (
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl text-white" style={{ background: accent }}><Store size={34} /></div>
        )}
        <h1 className="text-3xl font-black text-slate-900">{restaurant.name}</h1>
        {restaurant.description && <p className="mt-2 text-sm font-medium text-slate-500">{restaurant.description}</p>}
        {(restaurant.address || restaurant.city) && (
          <p className="mt-3 text-sm font-semibold text-slate-600">{[restaurant.address, restaurant.city].filter(Boolean).join(" · ")}</p>
        )}
        {restaurant.is_active === false ? (
          <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
            Espace temporairement indisponible.
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            <button type="button" onClick={() => navigate(`/r/${slug}/login`)} className="h-12 rounded-lg text-sm font-black text-white shadow-sm transition hover:brightness-95" style={{ background: accent }}>
              Se connecter
            </button>
          </div>
        )}
      </div>
      <p className="mt-6 text-xs text-slate-400">Propulsé par Bloomar One</p>
    </main>
  );
}
