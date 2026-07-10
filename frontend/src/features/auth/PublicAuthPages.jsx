import { useEffect, useMemo, useState } from "react";
import { ChefHat, Clock, CreditCard, Eye, EyeOff, LogIn, MapPin, MessageCircle, Minus, Phone, Plus, Search, ShieldCheck, ShoppingCart, Sparkles, Star, Store, Trash2, Truck, Utensils } from "lucide-react";
import { TenantThemeProvider } from "@/tenancy/TenantProvider";
import { initAos } from "@/utils/aos";

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

function money(value, currency = "FCFA") {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency}`;
}

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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg text-white shadow-sm" style={{ background: accent }}>
            {icon}
          </div>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">Email ou identifiant <span className="text-red-500">*</span></span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus className={inputClass} placeholder="Email, nom utilisateur ou téléphone" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">Mot de passe <span className="text-red-500">*</span></span>
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

export function AccessPortalPage({ apiBaseUrl, message, onForgotPassword }) {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function openRestaurant(event) {
    event.preventDefault();
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!normalized) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/restaurants/public/${encodeURIComponent(normalized)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.detail
            || "Restaurant introuvable. Utilisez le slug exact (ex. leboncoin, le-bon-coin ou main), pas le nom d'utilisateur.",
        );
      }
      navigate(`/r/${normalized}/login`);
    } catch (err) {
      setError(err.message || "Restaurant introuvable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <div className="rounded-lg bg-slate-950 p-6 text-white">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-violet-600">
              <ShieldCheck size={24} />
            </div>
            <h1 className="text-2xl font-black">Accès plateforme</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Réservé au super administrateur pour gérer les restaurants,
              abonnements et paramètres SaaS.
            </p>
            <button
              type="button"
              onClick={() => navigate("/superadmin")}
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-sm font-black text-white transition hover:bg-violet-700"
            >
              <LogIn size={16} /> Connexion superadmin
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Store size={24} />
            </div>
            <h2 className="text-2xl font-black text-slate-950">Accès restaurant</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Saisissez le <strong>slug</strong> du restaurant (visible dans superadmin après création),
              pas le nom du restaurant ni l&apos;identifiant de connexion.
            </p>
            <form onSubmit={openRestaurant} className="mt-6 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">
                  Slug restaurant
                </span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  className={inputClass}
                  placeholder="ex: leboncoin ou le-bon-coin"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <LogIn size={16} /> {busy ? "Vérification…" : "Ouvrir l’espace restaurant"}
              </button>
            </form>
          </div>
        </div>
        {message && (
          <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {message}
          </p>
        )}
        {onForgotPassword && (
          <button
            type="button"
            onClick={onForgotPassword}
            className="mt-5 block w-full text-center text-xs font-bold text-slate-500 transition hover:text-emerald-700"
          >
            Mot de passe oublié ?
          </button>
        )}
        <p className="mt-6 text-center text-xs font-semibold text-slate-400">
          Utilisez toujours l’URL dédiée du restaurant pour connecter le personnel.
        </p>
      </section>
    </main>
  );
}

export function RestaurantLoginPage({ apiBaseUrl, slug, onAuthenticated }) {
  const [restaurant, setRestaurant] = useState(undefined);
  useEffect(() => {
    setRestaurant(undefined);
    fetch(`${apiBaseUrl}/api/v1/restaurants/public/${encodeURIComponent(slug)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setRestaurant(data))
      .catch(() => setRestaurant(null));
  }, [apiBaseUrl, slug]);

  if (restaurant === undefined) {
    return <PublicState title="Chargement" text="Vérification du restaurant…" />;
  }

  if (!restaurant) {
    return (
      <PublicState
        title="Restaurant introuvable"
        text={`Le slug « ${slug} » n'existe pas. Retournez au portail et utilisez le slug exact (ex. leboncoin, le-bon-coin, main).`}
        actionLabel="Retour au portail"
        onAction={() => navigate("/login")}
      />
    );
  }

  const backPath = window.location.pathname.startsWith("/r/") ? `/r/${slug}` : "/";
  return (
    <TenantThemeProvider restaurant={restaurant}>
    <LoginCard
      icon={restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <Store size={28} />}
      title={restaurant?.name || "Connexion restaurant"}
      subtitle="Connectez-vous à votre espace"
      accent="var(--tenant-primary)"
      buttonLabel="Se connecter"
      onSubmit={async (login, password) => {
        const data = await postLogin(`${apiBaseUrl}/api/v1/auth/restaurants/${slug}/login`, login, password);
        onAuthenticated(data);
      }}
      footer={
        <button type="button" onClick={() => navigate(backPath)} className="mt-4 block w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800">
          ← Retour à la page du restaurant
        </button>
      }
    />
    </TenantThemeProvider>
  );
}

export function TenantPublicRouter({ apiBaseUrl, currentPath, onAuthenticated }) {
  const [tenant, setTenant] = useState(undefined);

  useEffect(() => {
    const host = window.location.hostname;
    fetch(`${apiBaseUrl}/api/v1/public/tenant/resolve?host=${encodeURIComponent(host)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.detail || "Restaurant introuvable");
        return data;
      })
      .then(setTenant)
      .catch(() => setTenant(null));
  }, [apiBaseUrl]);

  if (tenant === undefined) {
    return <PublicState title="Chargement du restaurant" text="Préparation de la vitrine..." />;
  }
  if (tenant === null) {
    return <RestaurantNotFoundPage />;
  }
  if (tenant.status === "suspended") {
    return <RestaurantSuspendedPage restaurant={tenant.restaurant} />;
  }

  const slug = tenant.restaurant?.slug || tenant.subdomain;
  const cleanPath = currentPath.replace(/\/+$/, "") || "/";
  if (cleanPath === "/login" || cleanPath === "/admin") {
    return <RestaurantLoginPage apiBaseUrl={apiBaseUrl} slug={slug} onAuthenticated={onAuthenticated} />;
  }
  const initialSection =
    cleanPath === "/commande"
      ? "commande"
      : cleanPath === "/contact"
        ? "infos"
        : cleanPath === "/menu"
          ? "menu"
          : null;
  return (
    <RestaurantLandingPage
      apiBaseUrl={apiBaseUrl}
      slug={slug}
      initialData={tenant}
      loginPath="/login"
      initialSection={initialSection}
    />
  );
}

export function RestaurantLandingPage({ apiBaseUrl, slug, initialData = null, loginPath, initialSection = null }) {
  const [restaurant, setRestaurant] = useState(initialData?.restaurant ?? undefined); // undefined=loading, null=not found
  const [categories, setCategories] = useState(initialData?.categories || []);
  const [dishes, setDishes] = useState(initialData?.dishes || []);
  const [activeCategory, setActiveCategory] = useState("all");
  const [menuSearch, setMenuSearch] = useState("");
  const [cart, setCart] = useState({});
  const [orderForm, setOrderForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    fulfillment_type: "Livraison",
    payment_method: "Paiement à la livraison",
    notes: "",
  });
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);

  useEffect(() => initAos(), []);
  const availableDishes = useMemo(() => {
    const query = menuSearch.trim().toLowerCase();
    return dishes.filter((dish) => {
      const matchesCategory = activeCategory === "all" || dish.category_id === activeCategory;
      const matchesSearch =
        !query ||
        [dish.name, dish.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, dishes, menuSearch]);

  useEffect(() => {
    if (initialData?.restaurant) {
      setRestaurant(initialData.restaurant);
      setCategories(initialData.categories || []);
      setDishes(initialData.dishes || []);
      return;
    }
    fetch(`${apiBaseUrl}/api/v1/menu/public/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          setRestaurant(null);
          return;
        }
        setRestaurant(data.restaurant);
        setCategories(data.categories || []);
        setDishes(data.dishes || []);
      })
      .catch(() => setRestaurant(null));
  }, [apiBaseUrl, slug, initialData]);

  useEffect(() => {
    if (!initialSection || restaurant === undefined) return;
    window.requestAnimationFrame(() => {
      document.getElementById(initialSection)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [initialSection, restaurant]);

  useEffect(() => {
    if (restaurant) {
      const timer = window.setTimeout(() => initAos(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [restaurant, categories.length, dishes.length, activeCategory, menuSearch]);

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

  const accent = "var(--tenant-primary)";
  const buttonColor = "var(--tenant-button)";
  const accentSoft = "var(--tenant-primary-soft)";
  const resolvedLoginPath = loginPath || `/r/${slug}/login`;
  const location = [restaurant.address, restaurant.city].filter(Boolean).join(" · ");
  const currency = restaurant.currency || "FCFA";
  const cartLines = Object.values(cart);
  const subtotal = cartLines.reduce((total, line) => total + Number(line.price || 0) * Number(line.quantity || 0), 0);
  const deliveryFee = orderForm.fulfillment_type === "Livraison" ? Number(restaurant.delivery_fee || 0) : 0;
  const total = subtotal + deliveryFee;
  const heroDishes = dishes.filter((dish) => dish.image_url).slice(0, 3);
  const coverImage = restaurant.cover_image_url || heroDishes[0]?.image_url;
  const featuredDishes = dishes.slice(0, 4);
  const categoryCount = categories.length || new Set(dishes.map((dish) => dish.category_id).filter(Boolean)).size;
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const categoryPreview = categories.slice(0, 5);
  const isOpen = restaurant.is_open !== false && restaurant.is_active !== false;
  const phoneHref = restaurant.phone ? `tel:${restaurant.phone.replace(/\s+/g, "")}` : null;
  const whatsappPhone = (restaurant.whatsapp_phone || restaurant.phone || "").replace(/\D/g, "");
  const whatsappHref = whatsappPhone ? `https://wa.me/${whatsappPhone}` : null;

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addToCart(dish) {
    setCart((current) => {
      const existing = current[dish.id];
      return {
        ...current,
        [dish.id]: {
          ...dish,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
    setOrderMessage("");
    setOrderError("");
  }

  function updateCartQuantity(dishId, quantity) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) {
        delete next[dishId];
      } else if (next[dishId]) {
        next[dishId] = { ...next[dishId], quantity };
      }
      return next;
    });
  }

  function updateOrderField(field, value) {
    setOrderForm((current) => ({ ...current, [field]: value }));
  }

  async function submitOrder(event) {
    event.preventDefault();
    setOrderMessage("");
    setOrderError("");
    if (!cartLines.length) {
      setOrderError("Ajoutez au moins un plat au panier.");
      return;
    }
    setSubmittingOrder(true);
    try {
      const payload = {
        ...orderForm,
        customer_name: orderForm.customer_name.trim(),
        customer_phone: orderForm.customer_phone.trim(),
        customer_address: orderForm.customer_address.trim() || undefined,
        notes: orderForm.notes.trim() || undefined,
        items: cartLines.map((line) => ({
          menu_item_id: line.id,
          quantity: line.quantity,
        })),
      };
      const response = await fetch(`${apiBaseUrl}/api/v1/orders/public/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data?.detail) ? data.detail.map((item) => item.msg || item.message).filter(Boolean).join(" ") : data?.detail;
        throw new Error(detail || "Commande impossible pour le moment.");
      }
      setCart({});
      setOrderForm({
        customer_name: "",
        customer_phone: "",
        customer_address: "",
        fulfillment_type: "Livraison",
        payment_method: "Paiement à la livraison",
        notes: "",
      });
      setOrderMessage(`Commande ${data.order_number || ""} enregistrée. Le restaurant va la traiter.`);
    } catch (error) {
      setOrderError(error.message || "Commande impossible pour le moment.");
    } finally {
      setSubmittingOrder(false);
    }
  }

  return (
    <TenantThemeProvider restaurant={restaurant}>
    <main className="min-h-screen bg-[var(--tenant-bg)] pb-24 text-[var(--tenant-text)] lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: accent }}>
                <Store size={22} />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-black">{restaurant.name}</p>
              {location && <p className="truncate text-xs font-bold text-slate-500">{location}</p>}
            </div>
          </div>
          <div className="hidden items-center gap-6 text-sm font-bold text-slate-600 lg:flex">
            <button type="button" onClick={() => scrollTo("menu")} className="transition hover:text-slate-950">Menu</button>
            <button type="button" onClick={() => scrollTo("commande")} className="transition hover:text-slate-950">Commander</button>
            <button type="button" onClick={() => scrollTo("infos")} className="transition hover:text-slate-950">Infos</button>
          </div>
          <div className="flex items-center gap-2">
            {phoneHref && (
              <a
                href={phoneHref}
                className="hidden h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
              >
                <Phone size={16} />
              </a>
            )}
            <button
              type="button"
              onClick={() => scrollTo("commande")}
              className="h-10 rounded-lg px-4 text-sm font-black text-white shadow-sm transition hover:brightness-95"
              style={{ background: buttonColor }}
            >
              Commander
            </button>
            <button
              type="button"
              onClick={() => navigate(resolvedLoginPath)}
              className="hidden h-10 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 sm:inline-flex sm:items-center"
            >
              Se connecter
            </button>
          </div>
        </div>
      </header>

      <section className="relative min-h-[calc(100vh-76px)] overflow-hidden">
        {coverImage ? (
          <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/76 to-slate-950/24" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />

        <div className="relative mx-auto flex min-h-[calc(100vh-76px)] max-w-6xl items-center px-5 py-16">
          <div className="max-w-3xl text-white" data-aos="fade-right">
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 text-xs font-black uppercase backdrop-blur">
                <Utensils size={14} /> Site officiel
              </span>
              <span className={`inline-flex rounded-lg px-3 py-2 text-xs font-black uppercase ${isOpen ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>
                {isOpen ? "Ouvert aux commandes" : "Commandes fermées"}
              </span>
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-none tracking-tight md:text-7xl">
              {restaurant.name}
            </h1>
            <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-white/82 md:text-lg">
              {restaurant.description || "Commandez vos plats préférés en ligne et profitez d’une expérience rapide, simple et soignée."}
            </p>

            {categoryPreview.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2" data-aos="fade-up" data-aos-delay="150">
                {categoryPreview.map((category) => (
                  <span key={category.id} className="rounded-lg bg-white/12 px-3 py-2 text-xs font-black uppercase text-white/90 backdrop-blur">
                    {category.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3" data-aos="fade-up" data-aos-delay="200">
              <HeroMeta dark icon={<ShoppingCart size={17} />} label={`${dishes.length} plat(s)`} />
              <HeroMeta dark icon={<ChefHat size={17} />} label={`${categoryCount || 0} catégorie(s)`} />
              <HeroMeta dark icon={<Clock size={17} />} label={restaurant.opening_hours || "Horaires à confirmer"} />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row" data-aos="fade-up" data-aos-delay="300">
              <button
                type="button"
                onClick={() => scrollTo("menu")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-sm font-black text-white shadow-xl transition hover:brightness-95"
                style={{ background: accent }}
              >
                <Sparkles size={16} /> Voir le menu
              </button>
              <button
                type="button"
                onClick={() => scrollTo("commande")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-black text-slate-950 shadow-xl transition hover:bg-slate-100"
              >
                <ShoppingCart size={16} /> Commander
              </button>
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white/12 px-6 text-sm font-black text-white backdrop-blur transition hover:bg-white/18"
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-xs font-black text-white/86" data-aos="fade-up" data-aos-delay="400">
              {location && <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 backdrop-blur"><MapPin size={14} /> {location}</span>}
              {restaurant.delivery_fee > 0 && <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 backdrop-blur"><Truck size={14} /> Livraison {money(restaurant.delivery_fee, currency)}</span>}
              {restaurant.payment_methods && <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-2 backdrop-blur"><CreditCard size={14} /> {restaurant.payment_methods}</span>}
            </div>
          </div>

          {heroDishes[0] && (
            <div className="absolute bottom-8 right-5 hidden w-80 rounded-lg border border-white/20 bg-white/14 p-4 text-white shadow-2xl backdrop-blur-xl lg:block" data-aos="fade-left" data-aos-delay="250">
              <p className="flex items-center gap-2 text-xs font-black uppercase text-white/70"><Star size={14} fill="currentColor" /> Suggestion du moment</p>
              <h2 className="mt-2 text-2xl font-black">{heroDishes[0].name}</h2>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/78">{heroDishes[0].description || "Plat disponible à la commande."}</p>
              <button
                type="button"
                onClick={() => addToCart(heroDishes[0])}
                className="mt-4 h-11 w-full rounded-lg bg-white text-sm font-black text-slate-950 transition hover:bg-slate-100"
              >
                Ajouter au panier
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="relative z-10 -mt-10 px-5">
        <div className="mx-auto grid max-w-6xl gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/10 sm:grid-cols-3" data-aos="fade-up">
          <TrustItem icon={<Clock size={18} />} title="Commande rapide" text="Votre panier se prépare en quelques clics." />
          <TrustItem icon={<Truck size={18} />} title={restaurant.delivery_fee > 0 ? "Livraison disponible" : "Retrait simplifié"} text={restaurant.delivery_fee > 0 ? `Frais: ${money(restaurant.delivery_fee, currency)}` : "Passez récupérer votre commande."} />
          <TrustItem icon={<CreditCard size={18} />} title="Paiement flexible" text={restaurant.payment_methods || "Espèces ou paiement mobile selon le restaurant."} />
        </div>
      </section>

      {categoryPreview.length > 0 && (
        <section className="px-5 py-14">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl" data-aos="fade-up">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Nos univers</p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">Une carte pensée pour toutes les envies</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                Parcourez les catégories du restaurant et trouvez rapidement ce qui vous fait plaisir.
              </p>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {categoryPreview.map((category, index) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.id);
                    scrollTo("menu");
                  }}
                  className="group rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  data-aos="zoom-in"
                  data-aos-delay={String(Math.min(index * 100, 300))}
                >
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg text-white transition group-hover:scale-105" style={{ background: accent }}>
                    <Utensils size={18} />
                  </span>
                  <h3 className="line-clamp-2 text-base font-black text-slate-950">{category.name}</h3>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    {category.description || "Voir les plats disponibles"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-y border-slate-100 bg-white px-5 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div data-aos="fade-right">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Commander en ligne</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 md:text-4xl">
              Votre repas, sans attente inutile.
            </h2>
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
              Sélectionnez vos plats, laissez vos coordonnées et le restaurant reçoit directement votre commande.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StepCard index="01" icon={<Search size={18} />} title="Choisissez" text="Parcourez le menu et ajoutez vos plats préférés." delay="0" />
            <StepCard index="02" icon={<ShoppingCart size={18} />} title="Validez" text="Confirmez votre panier et vos informations." delay="100" />
            <StepCard index="03" icon={<ChefHat size={18} />} title="Dégustez" text="Le restaurant prépare votre commande." delay="200" />
          </div>
        </div>
      </section>

      {featuredDishes.length > 0 && (
        <section className="border-t border-slate-100 px-5 py-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-end justify-between gap-4" data-aos="fade-up">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">À la une</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950">Les incontournables</h2>
              </div>
              <button type="button" onClick={() => scrollTo("menu")} className="text-sm font-black" style={{ color: accent }}>
                Voir tout
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featuredDishes.map((dish, index) => (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => addToCart(dish)}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  data-aos="zoom-in"
                  data-aos-delay={String(Math.min(index * 100, 300))}
                >
                  {dish.image_url ? (
                    <img src={dish.image_url} alt="" className="h-40 w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-slate-100 text-slate-300"><Store size={30} /></div>
                  )}
                  <div className="p-4">
                    <p className="line-clamp-1 text-base font-black text-slate-950">{dish.name}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-black" style={{ color: accent }}>{money(dish.price, currency)}</p>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">Ajouter</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="menu" className="border-t border-slate-100 bg-slate-50 px-5 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between" data-aos="fade-up">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Menu en ligne</p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">Découvrez nos plats</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Sélectionnez vos plats, ajoutez-les au panier et validez votre commande.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 md:w-80">
                <Search size={17} className="text-slate-400" />
                <input
                  value={menuSearch}
                  onChange={(event) => setMenuSearch(event.target.value)}
                  placeholder="Rechercher un plat..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                />
              </label>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={`h-10 rounded-lg px-4 text-sm font-black ${activeCategory === "all" ? "text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
                style={activeCategory === "all" ? { background: accent } : undefined}
              >
                Tout
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={`h-10 rounded-lg px-4 text-sm font-black ${activeCategory === category.id ? "text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
                  style={activeCategory === category.id ? { background: accent } : undefined}
                >
                  {category.name}
                </button>
              ))}
            </div>
            </div>
          </div>

          {dishes.length > 0 ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {availableDishes.map((dish, index) => (
              <article
                key={dish.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                data-aos="fade-up"
                data-aos-delay={String(Math.min((index % 3) * 100, 200))}
              >
                {dish.image_url ? (
                  <img src={dish.image_url} alt="" className="h-48 w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-48 items-center justify-center bg-slate-100 text-slate-300">
                    <Store size={38} />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  {categoryMap.get(dish.category_id) && (
                    <span className="mb-3 w-fit rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black uppercase text-slate-500">
                      {categoryMap.get(dish.category_id)}
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-black text-slate-950">{dish.name}</h3>
                    <strong className="shrink-0 rounded-lg px-2.5 py-1 text-sm" style={{ color: accent, background: accentSoft }}>{money(dish.price, currency)}</strong>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm font-medium leading-6 text-slate-500">
                    {dish.description || "Plat disponible à la commande."}
                  </p>
                  <button
                    type="button"
                    onClick={() => addToCart(dish)}
                    className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-black text-white transition hover:brightness-95"
                    style={{ background: buttonColor }}
                  >
                    <Plus size={16} /> Ajouter
                  </button>
                </div>
              </article>
            ))}
          </div>
          ) : (
            <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-12 text-center" data-aos="fade-up">
              <Store size={36} className="mx-auto text-slate-300" />
              <h3 className="mt-3 text-lg font-black text-slate-900">Menu en préparation</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">Les plats de ce restaurant seront affichés ici dès leur publication.</p>
            </div>
          )}
          {dishes.length > 0 && !availableDishes.length && (
            <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500" data-aos="fade-up">
              Aucun plat ne correspond à votre recherche.
            </div>
          )}
        </div>
      </section>

      <section id="commande" className="px-5 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px]">
          <form onSubmit={submitOrder} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-aos="fade-right">
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Commande en ligne</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Vos informations</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Nom <span className="text-red-500">*</span></span>
                <input className={inputClass} value={orderForm.customer_name} onChange={(event) => updateOrderField("customer_name", event.target.value)} required placeholder="Votre nom" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Téléphone <span className="text-red-500">*</span></span>
                <input className={inputClass} value={orderForm.customer_phone} onChange={(event) => updateOrderField("customer_phone", event.target.value)} required placeholder="+237 ..." />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Mode de retrait</span>
                <select className={inputClass} value={orderForm.fulfillment_type} onChange={(event) => updateOrderField("fulfillment_type", event.target.value)}>
                  <option value="Livraison">Livraison</option>
                  <option value="À emporter">À emporter</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Paiement</span>
                <select className={inputClass} value={orderForm.payment_method} onChange={(event) => updateOrderField("payment_method", event.target.value)}>
                  <option value="Paiement à la livraison">Paiement à la livraison</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Mobile Money">Mobile Money</option>
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">
                  Adresse {orderForm.fulfillment_type === "Livraison" && <span className="text-red-500">*</span>}
                </span>
                <input className={inputClass} value={orderForm.customer_address} onChange={(event) => updateOrderField("customer_address", event.target.value)} required={orderForm.fulfillment_type === "Livraison"} placeholder="Quartier, rue, repère..." />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">Note</span>
                <textarea className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50" value={orderForm.notes} onChange={(event) => updateOrderField("notes", event.target.value)} placeholder="Instructions particulières..." />
              </label>
            </div>
            {orderMessage && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{orderMessage}</p>}
            {orderError && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{orderError}</p>}
            <button
              type="submit"
              disabled={submittingOrder || !cartLines.length || restaurant.is_open === false}
              className="mt-5 h-12 w-full rounded-lg text-sm font-black text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: accent }}
            >
              {submittingOrder ? "Envoi de la commande..." : restaurant.is_open === false ? "Restaurant fermé" : "Valider la commande"}
            </button>
          </form>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 lg:sticky lg:top-24 lg:self-start" data-aos="fade-left" data-aos-delay="150">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Panier</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{cartLines.length} article(s)</h2>
              </div>
              <ShoppingCart style={{ color: accent }} />
            </div>
            <div className="space-y-3">
              {cartLines.map((line) => (
                <div key={line.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-900">{line.name}</p>
                      <p className="text-xs font-bold text-slate-500">{money(line.price, currency)}</p>
                    </div>
                    <button type="button" onClick={() => updateCartQuantity(line.id, 0)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateCartQuantity(line.id, line.quantity - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200">
                        <Minus size={14} />
                      </button>
                      <strong className="min-w-8 text-center">{line.quantity}</strong>
                      <button type="button" onClick={() => updateCartQuantity(line.id, line.quantity + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200">
                        <Plus size={14} />
                      </button>
                    </div>
                    <strong>{money(Number(line.price || 0) * line.quantity, currency)}</strong>
                  </div>
                </div>
              ))}
              {!cartLines.length && (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                  Votre panier est vide.
                </p>
              )}
            </div>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-slate-500">Sous-total</span>
                <strong>{money(subtotal, currency)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-slate-500">Livraison</span>
                <strong>{money(deliveryFee, currency)}</strong>
              </div>
              <div className="flex justify-between gap-3 pt-2 text-base">
                <span className="font-black">Total</span>
                <strong>{money(total, currency)}</strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section id="infos" className="border-t border-slate-100 bg-slate-50 px-5 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          <InfoCard icon={<MapPin size={18} />} title="Adresse" text={location || "Adresse non renseignée"} delay="0" />
          <InfoCard icon={<Clock size={18} />} title="Horaires" text={restaurant.opening_hours || "Horaires à confirmer"} delay="100" />
          <InfoCard icon={<Phone size={18} />} title="Contact" text={restaurant.phone || restaurant.whatsapp_phone || restaurant.email || "Contact non renseigné"} delay="200" />
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-base font-black text-slate-950">{restaurant.name}</p>
            <p className="mt-1 text-xs">{location || "Restaurant en ligne"} · Propulsé par Bloomar One</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => scrollTo("menu")} className="hover:text-slate-950">Menu</button>
            <button type="button" onClick={() => scrollTo("commande")} className="hover:text-slate-950">Commander</button>
            <button type="button" onClick={() => navigate(resolvedLoginPath)} className="hover:text-slate-950">Se connecter</button>
          </div>
        </div>
      </footer>
      {cartLines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-3 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] lg:hidden">
          <button
            type="button"
            onClick={() => scrollTo("commande")}
            className="flex h-12 w-full items-center justify-between rounded-lg px-4 text-sm font-black text-white"
            style={{ background: buttonColor }}
          >
            <span>{cartLines.length} article(s)</span>
            <span>{money(total, currency)}</span>
          </button>
        </div>
      )}
    </main>
    </TenantThemeProvider>
  );
}

function PublicState({ title, text, actionLabel, onAction }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <section className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Store size={22} />
        </div>
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{text}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-black text-white"
          >
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}

function RestaurantNotFoundPage() {
  return (
    <PublicState
      title="Restaurant introuvable"
      text="Aucun restaurant actif ne correspond à ce sous-domaine. Vérifiez l’adresse ou contactez l’administrateur."
    />
  );
}

function RestaurantSuspendedPage({ restaurant }) {
  return (
    <TenantThemeProvider restaurant={restaurant}>
      <main className="flex min-h-screen items-center justify-center bg-[var(--tenant-bg)] p-6 text-center text-[var(--tenant-text)]">
        <section className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {restaurant?.logo_url ? (
            <img src={restaurant.logo_url} alt="" className="mx-auto mb-4 h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--tenant-primary)] text-white">
              <Store size={24} />
            </div>
          )}
          <h1 className="text-2xl font-black">{restaurant?.name || "Restaurant indisponible"}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Ce site vitrine est temporairement indisponible. Merci de réessayer plus tard.
          </p>
        </section>
      </main>
    </TenantThemeProvider>
  );
}

function TrustItem({ icon, title, text }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
        {icon}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-sm font-black text-slate-950">{title}</strong>
        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{text}</span>
      </span>
    </div>
  );
}

function StepCard({ index, icon, title, text, delay = "0" }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-5" data-aos="fade-up" data-aos-delay={delay}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
          {icon}
        </span>
        <span className="text-xs font-black text-slate-300">{index}</span>
      </div>
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{text}</p>
    </article>
  );
}

function HeroMeta({ icon, label, dark = false }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-black ${
      dark
        ? "border border-white/18 bg-white/12 text-white backdrop-blur"
        : "border border-slate-200 bg-white text-slate-700"
    }`}>
      <span className={dark ? "text-white/70" : "text-slate-400"}>{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function InfoCard({ icon, title, text, delay = "0" }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg" data-aos="fade-up" data-aos-delay={delay}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        {icon}
      </div>
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{text}</p>
    </article>
  );
}
