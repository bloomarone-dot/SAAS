<<<<<<< HEAD
import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChefHat,
  Cloud,
  Globe,
  Headphones,
  LayoutDashboard,
  Menu,
  QrCode,
  Shield,
  Smartphone,
  Star,
  TrendingUp,
  Users,
  Utensils,
  Warehouse,
  X,
  Zap,
} from "lucide-react";

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyDone, setNotifyDone] = useState(false);

  function scrollTo(id) {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goToLogin() {
    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function goToRegister() {
    window.history.pushState({}, "", "/admin");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function handleNotify(e) {
    e.preventDefault();
    if (notifyEmail.trim()) setNotifyDone(true);
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 md:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
              <Utensils size={18} className="text-white" />
            </div>
            <span className="text-xl font-black text-slate-900">
              Bloomar<span className="text-emerald-600">One</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
            <button onClick={() => scrollTo("features")} className="hover:text-emerald-600 transition">Fonctionnalités</button>
            <button onClick={() => scrollTo("pricing")} className="hover:text-emerald-600 transition">Tarifs</button>
            <button onClick={() => scrollTo("testimonials")} className="hover:text-emerald-600 transition">Témoignages</button>
=======
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Eye,
  Heart,
  Headphones,
  Leaf,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import {
  clearOfflineQueue,
  enqueueOfflineAction,
  flushOfflineQueue,
  friendlyNetworkMessage,
  isNetworkError,
  readOfflineQueue,
} from "@/utils/network";

const restaurantName = "Le Bon Coin";
const heroImage =
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1600&auto=format&fit=crop";
const pizzaImage =
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=1200&auto=format&fit=crop";
const tacosImage =
  "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=1000&auto=format&fit=crop";
const chickenImage =
  "https://images.unsplash.com/photo-1527477396000-e27163b481c2?q=80&w=1000&auto=format&fit=crop";
const drinksImage =
  "https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=1000&auto=format&fit=crop";
const dessertImage =
  "https://images.unsplash.com/photo-1551024601-bec78aea704b?q=80&w=1000&auto=format&fit=crop";

const translations = {
  fr: {
    nav: [
      ["home", "Accueil"],
      ["menu", "Menu"],
      ["about", "À propos"],
      ["blog", "Blog"],
      ["contact", "Contact"],
    ],
    order: "Commander",
    login: "Connexion",
    search: "Rechercher un plat...",
    heroKicker: "Meilleur fast-food en ville",
    heroTitleA: "Savourez l’exceptionnel,",
    heroTitleB: "chez vous !",
    heroText:
      "Des plats préparés avec des ingrédients frais et livrés rapidement chez vous.",
    orderNow: "Commander maintenant",
    seeMenu: "Voir le menu",
    service: [
      "Livraison rapide",
      "30-45 min",
      "Paiement sécurisé",
      "100% sécurisé",
      "Produits frais",
      "Qualité garantie",
      "Support 7j/7",
      "Disponible",
    ],
    categoriesKicker: "Découvrez nos catégories",
    categoriesTitle: "Choisissez ce qui vous fait plaisir",
    popularKicker: "Notre carte",
    popularTitle: "Les préférés de nos clients",
    allMenu: "Voir tout le menu",
    promoKicker: "Offre spéciale",
    promoTitle: "-20% sur votre première commande",
    promoCode: "Code promo",
    whyKicker: "Pourquoi nous choisir ?",
    whyTitle: "Une expérience unique à chaque commande",
    blogKicker: "Actualités",
    blogTitle: "Conseils et nouveautés du restaurant",
    footerTitle: "Restez connecté avec nous",
    footerText: "Suivez-nous et recevez nos offres spéciales.",
    newsletter: "Newsletter",
    email: "Votre email",
    cart: "Panier",
  },
  en: {
    nav: [
      ["home", "Home"],
      ["menu", "Menu"],
      ["about", "About"],
      ["blog", "Blog"],
      ["contact", "Contact"],
    ],
    order: "Order",
    login: "Login",
    search: "Search a meal...",
    heroKicker: "Best fast-food in town",
    heroTitleA: "Taste the exceptional,",
    heroTitleB: "at home!",
    heroText:
      "Fresh meals prepared with quality ingredients and delivered fast.",
    orderNow: "Order now",
    seeMenu: "See menu",
    service: [
      "Fast delivery",
      "30-45 min",
      "Secure payment",
      "100% secure",
      "Fresh products",
      "Quality guaranteed",
      "Support 7/7",
      "Available",
    ],
    categoriesKicker: "Explore categories",
    categoriesTitle: "Choose what you love",
    popularKicker: "Our menu",
    popularTitle: "Customer favorites",
    allMenu: "Full menu",
    promoKicker: "Special offer",
    promoTitle: "-20% on your first order",
    promoCode: "Promo code",
    whyKicker: "Why choose us?",
    whyTitle: "A unique experience with every order",
    blogKicker: "News",
    blogTitle: "Restaurant tips and updates",
    footerTitle: "Stay connected",
    footerText: "Follow us and receive our special offers.",
    newsletter: "Newsletter",
    email: "Your email",
    cart: "Cart",
  },
};

const fallbackCategories = [
  { id: "burgers", name: "Burgers", count: "12 plats", image_url: heroImage },
  { id: "pizzas", name: "Pizzas", count: "15 plats", image_url: pizzaImage },
  { id: "tacos", name: "Tacos", count: "10 plats", image_url: tacosImage },
  {
    id: "grillades",
    name: "Grillades",
    count: "18 plats",
    image_url: chickenImage,
  },
  {
    id: "boissons",
    name: "Boissons",
    count: "8 plats",
    image_url: drinksImage,
  },
  {
    id: "desserts",
    name: "Desserts",
    count: "9 plats",
    image_url: dessertImage,
  },
];

const fallbackProducts = [
  {
    id: "burger",
    name: "Cheese Burger",
    price: 4500,
    description: "Steak haché, fromage, salade, tomate, oignon.",
    image_url: heroImage,
  },
  {
    id: "pizza",
    name: "Pizza Margherita",
    price: 6500,
    description: "Sauce tomate, mozzarella, basilic frais.",
    image_url: pizzaImage,
  },
  {
    id: "tacos",
    name: "Tacos Mixte",
    price: 5000,
    description: "Viande hachée, poulet, frites, sauce fromagère.",
    image_url: tacosImage,
  },
  {
    id: "chicken",
    name: "Poulet Braisé",
    price: 6000,
    description: "Poulet mariné, épices spéciales, accompagnement.",
    image_url: chickenImage,
  },
  {
    id: "juice",
    name: "Jus Naturel",
    price: 1500,
    description: "Cocktail frais, fruits de saison.",
    image_url: drinksImage,
  },
  {
    id: "dessert",
    name: "Dessert Maison",
    price: 2500,
    description: "Dessert gourmand préparé sur place.",
    image_url: dessertImage,
  },
];

const blogPosts = [
  [
    "Comment choisir un bon burger ?",
    "Les détails qui font la différence: pain, cuisson, sauce et fraîcheur.",
  ],
  [
    "Organiser son rush du midi",
    "Des astuces simples pour servir vite sans perdre en qualité.",
  ],
  [
    "La livraison rapide et fiable",
    "Pourquoi la préparation et le packaging changent toute l’expérience.",
  ],
];

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    try {
      const configured = new URL(import.meta.env.VITE_API_URL);
      const pageHost = window.location.hostname;
      if (
        configured.hostname === "localhost" &&
        pageHost &&
        pageHost !== "localhost" &&
        pageHost !== "127.0.0.1" &&
        !isDockerBridgeHost(pageHost)
      ) {
        configured.hostname = pageHost;
        return configured.toString().replace(/\/$/, "");
      }
    } catch {
      return import.meta.env.VITE_API_URL;
    }
    return import.meta.env.VITE_API_URL;
  }
  if (import.meta.env.PROD) return window.location.origin;
  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

function isDockerBridgeHost(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

export default function RestaurantLandingPage({
  apiBaseUrl = getApiBaseUrl(),
}) {
  const [language, setLanguage] = useState("fr");
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [publicMenu, setPublicMenu] = useState(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(
    () => readOfflineQueue().length,
  );
  const t = translations[language];
  const restaurant = publicMenu?.restaurant;
  const brand = {
    primary: restaurant?.primary_color ?? "#ff1f17",
    secondary: restaurant?.secondary_color ?? "#05080d",
  };
  const dishes = publicMenu ? publicMenu.dishes : fallbackProducts;
  const categories = useMemo(
    () => buildCategories(publicMenu?.categories ?? fallbackCategories, dishes),
    [publicMenu, dishes],
  );
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    const slug =
      window.location.pathname.split("/").filter(Boolean)[0] || "main";
    fetch(`${apiBaseUrl}/api/v1/menu/public/${slug}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("menu-unavailable");
        setPublicMenu(await response.json());
      })
      .catch(() => setPublicMenu(null));
  }, [apiBaseUrl]);

  useEffect(() => {
    function refreshQueue() {
      setOfflineQueueCount(readOfflineQueue().length);
    }
    async function syncWhenOnline() {
      const result = await flushOfflineQueue(apiBaseUrl);
      refreshQueue();
      if (result.synced > 0)
        setOrderMessage(`${result.synced} action(s) synchronisée(s).`);
    }
    window.addEventListener("online", syncWhenOnline);
    window.addEventListener("offline-queue-changed", refreshQueue);
    if (navigator.onLine) syncWhenOnline();
    return () => {
      window.removeEventListener("online", syncWhenOnline);
      window.removeEventListener("offline-queue-changed", refreshQueue);
    };
  }, [apiBaseUrl]);

  function scrollToSection(id) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...current, { ...product, quantity: 1 }];
    });
    scrollToSection("menu");
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!restaurant?.slug || cart.length === 0) return;
    setIsOrdering(true);
    setOrderMessage("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      customer_name: formData.get("customer_name"),
      customer_phone: formData.get("customer_phone"),
      customer_address: formData.get("customer_address"),
      notes: formData.get("notes"),
      fulfillment_type: formData.get("fulfillment_type"),
      payment_method: formData.get("payment_method"),
      items: cart.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
      })),
    };
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/orders/public/${restaurant.slug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setOrderMessage(data.detail ?? "Commande impossible pour le moment.");
        return;
      }
      setCart([]);
      event.currentTarget.reset();
      setOrderMessage(
        `Commande ${data.order_number} reçue. Le restaurant va vous contacter.`,
      );
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueOfflineAction({
          label: "Commande visiteur",
          requests: [
            {
              path: `/api/v1/orders/public/${restaurant.slug}`,
              method: "POST",
              body: payload,
            },
          ],
        });
        setCart([]);
        event.currentTarget.reset();
        setOrderMessage(
          "Connexion indisponible. Votre commande est enregistrée localement et sera envoyée automatiquement au retour du réseau.",
        );
      } else {
        setOrderMessage(
          friendlyNetworkMessage(error, "Commande impossible pour le moment."),
        );
      }
    } finally {
      setIsOrdering(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-white text-[#111827]"
      style={{
        "--brand-primary": brand.primary,
        "--brand-secondary": brand.secondary,
      }}
    >
      <HeroSection
        t={t}
        restaurant={restaurant}
        brand={brand}
        language={language}
        setLanguage={setLanguage}
        cartCount={cartCount}
        onNavigate={scrollToSection}
      />
      {offlineQueueCount > 0 && (
        <div className="mx-auto mt-4 flex max-w-7xl flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800 md:flex-row md:items-center md:justify-between">
          <span>
            {offlineQueueCount} action(s) en attente de synchronisation.
          </span>
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                flushOfflineQueue(apiBaseUrl).then(() =>
                  setOfflineQueueCount(readOfflineQueue().length),
                )
              }
              className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm"
            >
              Synchroniser
            </button>
            <button
              type="button"
              onClick={() => {
                clearOfflineQueue();
                setOfflineQueueCount(0);
              }}
              className="rounded-lg bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm"
            >
              Vider
            </button>
          </span>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <CategoriesSection t={t} categories={categories} brand={brand} />
        <MenuSection
          t={t}
          products={dishes}
          search={search}
          onSearch={setSearch}
          onAdd={addToCart}
          onNavigate={scrollToSection}
          brand={brand}
        />
        <RestaurantInfoSection restaurant={restaurant} brand={brand} />
        <OrderSection
          cart={cart}
          setCart={setCart}
          restaurant={restaurant}
          onSubmit={submitOrder}
          message={orderMessage}
          isOrdering={isOrdering}
          brand={brand}
        />
        <PromoBanner t={t} onNavigate={scrollToSection} />
        <FeaturesSection t={t} brand={brand} />
        <BlogSection t={t} restaurant={restaurant} brand={brand} />
      </main>

      <Footer t={t} restaurant={restaurant} brand={brand} />
    </div>
  );
}

function HeroSection({
  t,
  restaurant,
  brand,
  language,
  setLanguage,
  cartCount,
  onNavigate,
}) {
  const displayName = restaurant?.name ?? restaurantName;
  return (
    <section
      id="home"
      className="relative min-h-[460px] overflow-hidden bg-black px-5 py-6 text-white md:px-10"
    >
      <img
        src={heroImage}
        alt="Burger"
        className="absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/5" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <header className="flex items-center justify-between gap-5">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="flex items-center gap-3"
          >
            <img
              src="/logo.jpeg"
              alt={`Logo ${displayName}`}
              className="h-12 w-12 rounded-lg object-cover shadow-sm ring-1 ring-white/30"
            />
            <h1 className="text-2xl font-black text-white">{displayName}</h1>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-black lg:flex">
            {t.nav.map(([id, label], index) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={
                  index === 0
                    ? "text-[#ffcf8a] underline"
                    : "transition hover:text-[#ffcf8a]"
                }
              >
                {label}
              </button>
            ))}
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
          </nav>

          <div className="flex items-center gap-3">
            <button
<<<<<<< HEAD
              onClick={goToLogin}
              className="hidden text-sm font-bold text-slate-700 hover:text-emerald-600 transition sm:block"
            >
              Se Connecter
            </button>
            <button
              onClick={goToRegister}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 transition"
            >
              S'inscrire
              <ArrowRight size={15} />
            </button>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 lg:hidden"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden">
            <nav className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
              <button onClick={() => scrollTo("features")} className="text-left hover:text-emerald-600">Fonctionnalités</button>
              <button onClick={() => scrollTo("pricing")} className="text-left hover:text-emerald-600">Tarifs</button>
              <button onClick={() => scrollTo("testimonials")} className="text-left hover:text-emerald-600">Témoignages</button>
              <button onClick={goToLogin} className="text-left hover:text-emerald-600">Se Connecter</button>
            </nav>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-24 text-white md:px-8 md:py-32">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-600/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-400/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
            <Zap size={14} />
            Gratuit pendant la phase de lancement
          </div>

          <h1 className="text-4xl font-black leading-tight md:text-6xl lg:text-7xl">
            Gérez Votre Restaurant{" "}
            <span className="text-emerald-400">Comme un Pro</span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-lg font-medium leading-8 text-slate-300 md:text-xl">
            Solution POS 100% camerounaise pour restaurants modernes.
            Caisse, stocks, équipes, rapports — tout en un, dans le cloud.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={goToRegister}
              className="inline-flex h-14 items-center gap-3 rounded-xl bg-emerald-500 px-8 text-base font-black text-white shadow-2xl shadow-emerald-500/30 hover:bg-emerald-400 transition"
            >
              Créer Mon Compte Gratuit
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="inline-flex h-14 items-center gap-3 rounded-xl border border-white/20 bg-white/5 px-8 text-base font-black text-white backdrop-blur hover:bg-white/10 transition"
            >
              Voir la Démo
            </button>
          </div>

          {/* Stats row */}
          <div className="mt-16 grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { value: "500+", label: "Restaurants inscrits" },
              { value: "99.9%", label: "Temps de disponibilité" },
              { value: "0 FCFA", label: "GRATUIT\nPendant le lancement" },
              { value: "24/7", label: "Support en français" },
            ].map(({ value, label }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-5">
                <p className="text-2xl font-black text-emerald-400">{value}</p>
                <p className="mt-1 text-xs font-semibold whitespace-pre-line text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY US ── */}
      <section className="border-b border-slate-100 bg-emerald-50 px-5 py-5 md:px-8">
        <p className="text-center text-xs font-black uppercase tracking-widest text-emerald-600">
          POURQUOI NOUS CHOISIR
        </p>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">
          Rejoignez les restaurants camerounais qui modernisent leur gestion avec une solution pensée pour nos réalités locales
        </p>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="scroll-mt-20 px-5 py-24 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Tout ce dont vous avez besoin en un seul endroit</p>
            <h2 className="mt-3 text-3xl font-black text-slate-900 md:text-4xl">
              Synchronisation cloud automatique —{" "}
              <span className="text-emerald-600">Accédez à vos données partout</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base font-medium text-slate-500">
              100% Cloud
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <LayoutDashboard size={22} />,
                title: "Gestion des Tables",
                desc: "Suivez toutes vos tables en temps réel, avec ou sans serveurs",
              },
              {
                icon: <Warehouse size={22} />,
                title: "Inventaire Intelligent",
                desc: "Alertes automatiques et suivi des stocks en FCFA",
              },
              {
                icon: <BarChart3 size={22} />,
                title: "Rapports & Analytics",
                desc: "Ventes, bénéfices et tendances en un coup d'œil",
              },
              {
                icon: <QrCode size={22} />,
                title: "Menu Digital",
                desc: "QR Code pour vos clients, mise à jour instantanée",
              },
              {
                icon: <Users size={22} />,
                title: "Gestion du Personnel",
                desc: "Pointeuse, planning et heures de présence",
              },
              {
                icon: <Cloud size={22} />,
                title: "Multi-Branches",
                desc: "Gérez plusieurs points de vente depuis un seul tableau de bord",
              },
              {
                icon: <ChefHat size={22} />,
                title: "Écran Cuisine",
                desc: "Commandes en temps réel directement en cuisine",
              },
              {
                icon: <Smartphone size={22} />,
                title: "Application Mobile",
                desc: "Accessible sur téléphone, tablette et ordinateur",
              },
              {
                icon: <Shield size={22} />,
                title: "Sécurité & Rôles",
                desc: "Permissions par rôle : admin, gérant, serveur, caisse…",
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                  {icon}
                </div>
                <h3 className="mt-5 text-base font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="scroll-mt-20 bg-slate-50 px-5 py-24 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">CE QUE DISENT NOS CLIENTS</p>
            <h2 className="mt-3 text-3xl font-black text-slate-900 md:text-4xl">Ils nous font confiance</h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                quote: "Bloomar One a transformé la gestion de mon restaurant. Simple, efficace, et pensé pour nous.",
                name: "Marie Ngo'o",
                role: "Propriétaire, Chez Marie — Yaoundé",
                verified: true,
              },
              {
                quote: "La gestion des stocks et de la caisse en un seul outil, c'est exactement ce qu'il nous fallait. Fini les tableurs Excel.",
                name: "Jean-Paul Mbarga",
                role: "Gérant, Le Gourmet — Douala",
                verified: true,
              },
              {
                quote: "Le support en français et la rapidité du système font toute la différence. Nos serveurs adorent.",
                name: "Sylvie Tchamba",
                role: "Directrice, Saveurs d'Afrique — Bafoussam",
                verified: true,
              },
            ].map(({ quote, name, role, verified }) => (
              <div key={name} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                <div className="flex gap-1 text-amber-400">
                  {[...Array(5)].map((_, i) => <Star key={i} size={15} fill="currentColor" />)}
                </div>
                <p className="mt-4 text-sm font-medium leading-7 text-slate-600">«{quote}»</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-700">
                    {name.charAt(0)}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                      {name}
                      {verified && <CheckCircle size={13} className="text-emerald-500" />}
                    </p>
                    <p className="text-xs font-medium text-slate-500">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="scroll-mt-20 px-5 py-24 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Commencez Gratuitement</p>
            <h2 className="mt-3 text-3xl font-black text-slate-900 md:text-4xl">
              Offre de lancement — Profitez de toutes les fonctionnalités sans frais
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {/* Starter */}
            <div className="relative rounded-2xl border-2 border-emerald-500 bg-white p-8 shadow-xl shadow-emerald-100">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-emerald-500 px-4 py-1 text-xs font-black text-white">DISPONIBLE MAINTENANT</span>
              </div>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-600">Starter</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-5xl font-black text-slate-900">0</span>
                <span className="mb-2 text-lg font-bold text-slate-500">FCFA/mois</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-500">Toutes les fonctionnalités, Caisse, Stocks, QR, Support</p>
              <ul className="mt-6 space-y-3">
                {["Tableau de bord complet", "Gestion des tables & commandes", "Stocks & inventaire", "Menu digital QR Code", "Rapports & analytics", "Support 24/7 en français"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                    <CheckCircle size={16} className="shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={goToRegister}
                className="mt-8 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white hover:bg-emerald-700 transition"
              >
                Créer Mon Compte
              </button>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                <TrendingUp size={12} />
                BIENTÔT DISPONIBLE
              </div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Pro</p>
              <div className="mt-3">
                <span className="text-3xl font-black text-slate-400">À définir</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-400">Lancement prévu Q3 2025</p>
              <ul className="mt-6 space-y-3">
                {["Tout du Starter", "Multi-branches", "Analytics avancés", "Intégrations paiement mobile", "API & webhooks", "Manager dédié"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm font-semibold text-slate-400">
                    <CheckCircle size={16} className="shrink-0 text-slate-300" />
                    {f}
                  </li>
                ))}
              </ul>
              <form onSubmit={handleNotify} className="mt-8">
                {notifyDone ? (
                  <p className="text-center text-sm font-bold text-emerald-600">✓ Vous serez notifié au lancement !</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-400"
                    />
                    <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-700 transition">
                      Me Notifier
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Enterprise */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-600">
                BIENTÔT DISPONIBLE
              </div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Enterprise</p>
              <div className="mt-3">
                <span className="text-3xl font-black text-slate-400">Sur mesure</span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-400">Pour chaînes de restaurants</p>
              <ul className="mt-6 space-y-3">
                {["Tout du Pro", "Nombre de branches illimité", "SLA garanti", "Intégration personnalisée", "Formation sur site", "Facturation centralisée"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm font-semibold text-slate-400">
                    <CheckCircle size={16} className="shrink-0 text-slate-300" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:contact@bloomarone.com"
                className="mt-8 block w-full rounded-xl border border-slate-300 bg-white py-3.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50 transition"
              >
                Contactez-nous
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="bg-gradient-to-r from-emerald-600 to-emerald-800 px-5 py-20 md:px-8">
        <div className="mx-auto max-w-3xl text-center text-white">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-200">PRÊT À MODERNISER VOTRE RESTAURANT ?</p>
          <h2 className="mt-4 text-3xl font-black md:text-4xl">
            Rejoignez gratuitement et découvrez pourquoi les restaurateurs camerounais nous font confiance
          </h2>
          <button
            onClick={goToRegister}
            className="mt-10 inline-flex h-14 items-center gap-3 rounded-xl bg-white px-10 text-base font-black text-emerald-700 shadow-xl hover:bg-emerald-50 transition"
          >
            CRÉER MON COMPTE GRATUIT
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-950 px-5 py-16 text-slate-400 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
                  <Utensils size={18} className="text-white" />
                </div>
                <span className="text-xl font-black text-white">
                  Bloomar<span className="text-emerald-400">One</span>
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm font-medium leading-7">
                La solution POS pensée pour les restaurants camerounais. Synchronisation cloud, support local, gratuit pendant le lancement.
              </p>
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-wider text-white">Adresse</p>
              <div className="mt-4 space-y-2 text-sm">
                <p>Mobile Omnispot, Derrière l'Annexe</p>
                <p>Cameroun</p>
                <p className="mt-3">
                  <a href="tel:+237652209571" className="hover:text-emerald-400 transition">+237 652 209 571</a>
                </p>
                <p>
                  <a href="mailto:contact@bloomarone.com" className="hover:text-emerald-400 transition">contact@bloomarone.com</a>
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-wider text-white">Liens</p>
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <button onClick={() => scrollTo("features")} className="text-left hover:text-emerald-400 transition">Fonctionnalités</button>
                <button onClick={() => scrollTo("pricing")} className="text-left hover:text-emerald-400 transition">Tarifs</button>
                <button onClick={() => scrollTo("testimonials")} className="text-left hover:text-emerald-400 transition">Témoignages</button>
                <button onClick={goToLogin} className="text-left hover:text-emerald-400 transition">Se Connecter</button>
                <button onClick={goToRegister} className="text-left hover:text-emerald-400 transition">Créer un compte</button>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs font-medium md:flex-row">
            <p>© {new Date().getFullYear()} Bloomar One SaaS. Tous droits réservés.</p>
            <div className="flex items-center gap-2 text-emerald-500">
              <Globe size={13} />
              <span>Fait au Cameroun 🇨🇲</span>
            </div>
          </div>
        </div>
      </footer>
=======
              type="button"
              onClick={() => onNavigate("menu")}
              className="hidden h-11 w-11 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20 lg:flex"
              title={t.search}
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("menu")}
              className="relative hidden h-11 w-11 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20 lg:flex"
              title={t.cart}
            >
              <ShoppingCart size={18} />
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-black"
                style={{ backgroundColor: brand.primary }}
              >
                {cartCount}
              </span>
            </button>
            <LanguageToggle language={language} setLanguage={setLanguage} />
            <a
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/20"
            >
              <LockKeyhole size={17} />
              <span className="hidden sm:inline">{t.login}</span>
            </a>
            <button
              type="button"
              onClick={() => onNavigate("menu")}
              className="hidden h-11 rounded-lg px-6 text-sm font-black text-white shadow-xl shadow-red-950/30 md:block"
              style={{ backgroundColor: brand.primary }}
            >
              {t.order}
            </button>
          </div>
        </header>

        <div className="mt-14 max-w-2xl">
          <p className="text-sm font-black uppercase tracking-normal text-[#ffcf8a]">
            🔥 {t.heroKicker}
          </p>
          <h2 className="mt-6 text-5xl font-black leading-tight md:text-7xl">
            {t.heroTitleA}
            <br />
            <span style={{ color: brand.primary }}>{t.heroTitleB}</span>
          </h2>
          <p className="mt-8 max-w-lg text-lg font-medium leading-8 text-slate-100">
            {t.heroText}
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => onNavigate("menu")}
              className="inline-flex h-14 items-center gap-3 rounded-lg px-7 text-sm font-black text-white"
              style={{ backgroundColor: brand.primary }}
            >
              {t.orderNow}
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("menu")}
              className="inline-flex h-14 items-center gap-3 rounded-lg border border-white/40 bg-white/10 px-7 text-sm font-black text-white backdrop-blur"
            >
              {t.seeMenu}
              <Eye size={17} />
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-4">
          <HeroMetric
            icon={<Truck />}
            title={t.service[0]}
            text={t.service[1]}
          />
          <HeroMetric
            icon={<ShieldCheck />}
            title={t.service[2]}
            text={t.service[3]}
          />
          <HeroMetric
            icon={<Leaf />}
            title={t.service[4]}
            text={t.service[5]}
          />
          <HeroMetric
            icon={<Headphones />}
            title={t.service[6]}
            text={t.service[7]}
          />
        </div>
      </div>
    </section>
  );
}

function CategoriesSection({ t, categories, brand }) {
  return (
    <section id="about" className="scroll-mt-8 py-20 text-center">
      <p
        className="text-xs font-black uppercase"
        style={{ color: brand.primary }}
      >
        {t.categoriesKicker}
      </p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">
        {t.categoriesTitle}
      </h2>
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          >
            <img
              src={category.image_url || heroImage}
              alt={category.name}
              className="h-28 w-full object-cover"
            />
            <div className="p-4 text-center">
              <h3 className="font-black">{category.name}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {category.count}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MenuSection({
  t,
  products,
  search,
  onSearch,
  onAdd,
  onNavigate,
  brand,
}) {
  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter(
    (product) => !query || product.name.toLowerCase().includes(query),
  );

  return (
    <section id="menu" className="scroll-mt-8 py-20">
      <div className="mb-12 grid gap-6 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p
            className="text-xs font-black uppercase"
            style={{ color: brand.primary }}
          >
            {t.popularKicker}
          </p>
          <h2 className="mt-3 text-3xl font-black text-slate-950">
            {t.popularTitle}
          </h2>
        </div>
        <label className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 shadow-sm">
          <Search size={17} className="text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t.search}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      <div className="grid gap-9 md:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => (
          <FoodCard
            key={product.id}
            product={product}
            onAdd={onAdd}
            brand={brand}
          />
        ))}
      </div>
      <div className="mt-12 flex justify-center">
        <button
          type="button"
          onClick={() => onNavigate("contact")}
          className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-black shadow-sm"
        >
          {t.allMenu}
        </button>
      </div>
    </section>
  );
}

function PromoBanner({ t, onNavigate }) {
  return (
    <section className="py-8">
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-[#ff6a00] to-[#ef233c] p-9 text-white">
        <div className="relative z-10 max-w-lg">
          <p className="text-xs font-black uppercase">{t.promoKicker}</p>
          <h2 className="mt-4 text-4xl font-black leading-tight">
            {t.promoTitle}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate("menu")}
            className="mt-7 rounded-lg bg-white px-6 py-3 text-sm font-black text-[#ff1f17]"
          >
            {t.orderNow}
          </button>
        </div>
        <img
          src={pizzaImage}
          alt="Pizza"
          className="absolute bottom-[-80px] right-[30%] hidden h-80 w-80 rounded-full object-cover lg:block"
        />
        <div className="absolute right-12 top-1/2 hidden -translate-y-1/2 rounded-lg border border-dashed border-white/80 px-12 py-8 text-center lg:block">
          <p className="font-bold">{t.promoCode}</p>
          <p className="mt-2 text-3xl font-black">BONCOIN20</p>
        </div>
      </div>
    </section>
  );
}

function RestaurantInfoSection({ restaurant, brand }) {
  const address =
    [restaurant?.address, restaurant?.city, restaurant?.country]
      .filter(Boolean)
      .join(", ") || "Adresse à renseigner";
  const phone =
    restaurant?.whatsapp_phone || restaurant?.phone || "Téléphone à renseigner";
  const paymentMethods = splitPaymentMethods(restaurant?.payment_methods);
  const whatsappHref = restaurant?.whatsapp_phone
    ? `https://wa.me/${restaurant.whatsapp_phone.replace(/\D/g, "")}`
    : null;

  return (
    <section id="contact" className="scroll-mt-8 py-12">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={<Clock3 size={19} />}
          title="Horaires"
          value={restaurant?.opening_hours || "Horaires à renseigner"}
          meta={restaurant?.is_open === false ? "Fermeture" : "Ouvert"}
          tone={restaurant?.is_open === false ? "#dc2626" : brand.primary}
        />
        <InfoCard
          icon={<MapPin size={19} />}
          title="Adresse"
          value={address}
          meta="Itinéraire restaurant"
          tone={brand.primary}
        />
        <InfoCard
          icon={<Headphones size={19} />}
          title="WhatsApp / Téléphone"
          value={phone}
          meta={whatsappHref ? "Contacter sur WhatsApp" : "Contact restaurant"}
          tone={brand.primary}
          href={whatsappHref}
        />
        <InfoCard
          icon={<Wallet size={19} />}
          title="Paiement à distance"
          value={paymentMethods.join(", ")}
          meta="Modes disponibles"
          tone={brand.primary}
        />
      </div>
    </section>
  );
}

function InfoCard({ icon, title, value, meta, tone, href }) {
  const content = (
    <div className="h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: tone }}
      >
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-black uppercase text-slate-400">
        {title}
      </h3>
      <p className="mt-2 text-base font-black text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold" style={{ color: tone }}>
        {meta}
      </p>
    </div>
  );

  if (!href) return content;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
}

function OrderSection({
  cart,
  setCart,
  restaurant,
  onSubmit,
  message,
  isOrdering,
  brand,
}) {
  const [fulfillmentType, setFulfillmentType] = useState("Livraison");
  const total = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0,
  );
  const deliveryFee =
    fulfillmentType === "Livraison" ? Number(restaurant?.delivery_fee || 0) : 0;
  const grandTotal = total + deliveryFee;
  const paymentMethods = splitPaymentMethods(restaurant?.payment_methods);

  function updateQuantity(id, delta) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  return (
    <section id="order" className="scroll-mt-8 py-12">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">Votre panier</h2>
          <div className="mt-5 divide-y divide-slate-100">
            {cart.length === 0 ? (
              <p className="py-8 text-sm font-semibold text-slate-500">
                Ajoutez des plats depuis le menu pour préparer votre commande.
              </p>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div>
                    <p className="font-black text-slate-950">{item.name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {formatMoney(item.price, restaurant?.currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      className="h-8 w-8 rounded-md border border-slate-200 font-black"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm font-black">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      className="h-8 w-8 rounded-md border border-slate-200 font-black"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-5">
            <span className="text-sm font-black text-slate-500">
              Sous-total
            </span>
            <strong className="text-xl font-black text-slate-950">
              {formatMoney(total, restaurant?.currency)}
            </strong>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-black text-slate-500">Livraison</span>
            <strong className="text-base font-black text-slate-950">
              {formatMoney(deliveryFee, restaurant?.currency)}
            </strong>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-black text-slate-500">Total</span>
            <strong className="text-xl font-black text-slate-950">
              {formatMoney(grandTotal, restaurant?.currency)}
            </strong>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-2xl font-black text-slate-950">
            Commander en ligne
          </h2>
          <div className="mt-5 grid gap-4">
            <input
              name="customer_name"
              required
              placeholder="Nom complet"
              className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]"
            />
            <input
              name="customer_phone"
              required
              placeholder="Téléphone"
              className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]"
            />
            <input
              name="customer_address"
              placeholder="Adresse de livraison"
              className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]"
            />
            <select
              name="fulfillment_type"
              value={fulfillmentType}
              onChange={(event) => setFulfillmentType(event.target.value)}
              className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]"
            >
              <option>Livraison</option>
              <option>À emporter</option>
            </select>
            <select
              name="payment_method"
              className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]"
            >
              {paymentMethods.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
            <textarea
              name="notes"
              placeholder="Instructions particulières"
              className="min-h-24 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]"
            />
          </div>
          <button
            type="submit"
            disabled={
              isOrdering ||
              cart.length === 0 ||
              !restaurant?.slug ||
              restaurant?.is_open === false
            }
            className="mt-5 h-12 w-full rounded-lg text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: brand.primary }}
          >
            {restaurant?.is_open === false
              ? "Restaurant fermé"
              : isOrdering
                ? "Envoi..."
                : "Valider la commande"}
          </button>
          {message && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">
              {message}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function FeaturesSection({ t, brand }) {
  const features = [
    [
      <Leaf />,
      "Ingrédients frais",
      "Nous utilisons uniquement des produits frais.",
    ],
    [
      <Truck />,
      "Livraison rapide",
      "Votre commande livrée en 30 à 45 minutes.",
    ],
    [
      <LockKeyhole />,
      "Paiement sécurisé",
      "Paiement en ligne ou à la livraison.",
    ],
    [<Headphones />, "Service client 7j/7", "Notre équipe reste disponible."],
  ];

  return (
    <section className="py-12 text-center">
      <p
        className="text-xs font-black uppercase"
        style={{ color: brand.primary }}
      >
        {t.whyKicker}
      </p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.whyTitle}</h2>
      <div className="mt-9 grid gap-6 md:grid-cols-4">
        {features.map(([icon, title, text]) => (
          <div
            key={title}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center"
              style={{ color: brand.primary }}
            >
              {icon}
            </div>
            <h3 className="mt-4 font-black">{title}</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BlogSection({ t, restaurant, brand }) {
  const displayName = restaurant?.name ?? restaurantName;
  return (
    <section id="blog" className="scroll-mt-8 py-12">
      <p
        className="text-xs font-black uppercase"
        style={{ color: brand.primary }}
      >
        {t.blogKicker}
      </p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.blogTitle}</h2>
      <div className="mt-7 grid gap-6 md:grid-cols-3">
        {blogPosts.map(([title, text]) => (
          <article
            key={title}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p
              className="text-xs font-black uppercase"
              style={{ color: brand.primary }}
            >
              {displayName}
            </p>
            <h3 className="mt-3 text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
              {text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer({ t, restaurant, brand }) {
  const displayName = restaurant?.name ?? restaurantName;
  return (
    <footer
      id="footer-contact"
      className="scroll-mt-8 text-white"
      style={{ backgroundColor: brand.secondary }}
    >
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-9 md:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-xl font-black">{t.footerTitle}</h2>
          <p className="mt-2 text-sm text-slate-300">{t.footerText}</p>
          <div className="mt-5 flex gap-3">
            {["f", "ig", "wa", "tk"].map((item) => (
              <span
                key={item}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-black"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-black">{t.newsletter}</h2>
          <div className="mt-4 flex overflow-hidden rounded-lg bg-white">
            <input
              placeholder={t.email}
              className="min-w-0 flex-1 px-4 text-sm font-semibold text-slate-900 outline-none"
            />
            <button
              className="flex h-12 w-14 items-center justify-center"
              style={{ backgroundColor: brand.primary }}
            >
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white text-slate-700">
        <div className="mx-auto grid max-w-7xl gap-5 px-6 py-8 md:grid-cols-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">{displayName}</h3>
            <p className="mt-3 text-sm font-medium text-slate-500">
              {restaurant?.description ||
                "Votre restaurant préféré, prêt à vous régaler avec une expérience exceptionnelle."}
            </p>
          </div>
          <FooterColumn
            title="Explorez"
            items={["Accueil", "Menu", "À propos", "Blog", "Contact"]}
          />
          <FooterColumn
            title="Contact"
            items={[
              restaurant?.phone || "+237 6 99 99 99",
              restaurant?.email || "contact@leboncoin.cm",
              [restaurant?.city, restaurant?.country]
                .filter(Boolean)
                .join(", ") || "Yaoundé, Cameroun",
            ]}
          />
          <FooterColumn
            title="Paiement accepté"
            items={["Visa", "Mastercard", "Orange Money"]}
          />
        </div>
      </div>
    </footer>
  );
}

function FoodCard({ product, onAdd, brand }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img
          src={product.image_url || heroImage}
          alt={product.name}
          className="h-56 w-full object-cover"
        />
        <button className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700">
          <Heart size={17} />
        </button>
      </div>
      <div className="p-5">
        <h3 className="font-black">{product.name}</h3>
        <p className="mt-2 min-h-12 text-sm font-medium text-slate-500">
          {product.description}
        </p>
        <div className="mt-5 flex items-center justify-between">
          <p className="text-lg font-black">{formatMoney(product.price)}</p>
          <button
            onClick={() => onAdd(product)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black text-white"
            style={{ backgroundColor: brand.primary }}
          >
            <Plus size={17} />
            Ajouter
          </button>
        </div>
      </div>
    </article>
  );
}

function HeroMetric({ icon, title, text }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
        {icon}
      </div>
      <div>
        <p className="text-sm font-black">{title}</p>
        <p className="text-xs font-medium text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function LanguageToggle({ language, setLanguage }) {
  return (
    <div className="flex rounded-lg bg-white/10 p-1">
      {["fr", "en"].map((item) => (
        <button
          key={item}
          onClick={() => setLanguage(item)}
          className={`rounded-md px-3 py-2 text-xs font-black uppercase ${
            language === item
              ? "bg-[var(--brand-primary)] text-white"
              : "text-white"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function buildCategories(categories, dishes) {
  return categories.map((category) => {
    const count = dishes.filter(
      (dish) => dish.category_id === category.id,
    ).length;
    return {
      ...category,
      count: category.count ?? `${count} plat${count > 1 ? "s" : ""}`,
    };
  });
}

function formatMoney(value, currency = "FCFA") {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency}`;
}

function splitPaymentMethods(value) {
  if (!value) return ["Paiement à la livraison"];
  const methods = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return methods.length ? methods : ["Paiement à la livraison"];
}

function FooterColumn({ title, items }) {
  return (
    <div>
      <h3 className="font-black text-slate-950">{title}</h3>
      <div className="mt-3 space-y-2 text-sm font-medium text-slate-500">
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
    </div>
  );
}
