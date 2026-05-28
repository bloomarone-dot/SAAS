import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChefHat,
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
import { clearOfflineQueue, enqueueOfflineAction, flushOfflineQueue, friendlyNetworkMessage, isNetworkError, readOfflineQueue } from "@/utils/network";

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
    search: "Rechercher un plat...",
    heroKicker: "Meilleur fast-food en ville",
    heroTitleA: "Savourez l’exceptionnel,",
    heroTitleB: "chez vous !",
    heroText: "Des plats préparés avec des ingrédients frais et livrés rapidement chez vous.",
    orderNow: "Commander maintenant",
    seeMenu: "Voir le menu",
    service: ["Livraison rapide", "30-45 min", "Paiement sécurisé", "100% sécurisé", "Produits frais", "Qualité garantie", "Support 7j/7", "Disponible"],
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
    search: "Search a meal...",
    heroKicker: "Best fast-food in town",
    heroTitleA: "Taste the exceptional,",
    heroTitleB: "at home!",
    heroText: "Fresh meals prepared with quality ingredients and delivered fast.",
    orderNow: "Order now",
    seeMenu: "See menu",
    service: ["Fast delivery", "30-45 min", "Secure payment", "100% secure", "Fresh products", "Quality guaranteed", "Support 7/7", "Available"],
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
  { id: "grillades", name: "Grillades", count: "18 plats", image_url: chickenImage },
  { id: "boissons", name: "Boissons", count: "8 plats", image_url: drinksImage },
  { id: "desserts", name: "Desserts", count: "9 plats", image_url: dessertImage },
];

const fallbackProducts = [
  { id: "burger", name: "Cheese Burger", price: 4500, description: "Steak haché, fromage, salade, tomate, oignon.", image_url: heroImage },
  { id: "pizza", name: "Pizza Margherita", price: 6500, description: "Sauce tomate, mozzarella, basilic frais.", image_url: pizzaImage },
  { id: "tacos", name: "Tacos Mixte", price: 5000, description: "Viande hachée, poulet, frites, sauce fromagère.", image_url: tacosImage },
  { id: "chicken", name: "Poulet Braisé", price: 6000, description: "Poulet mariné, épices spéciales, accompagnement.", image_url: chickenImage },
  { id: "juice", name: "Jus Naturel", price: 1500, description: "Cocktail frais, fruits de saison.", image_url: drinksImage },
  { id: "dessert", name: "Dessert Maison", price: 2500, description: "Dessert gourmand préparé sur place.", image_url: dessertImage },
];

const blogPosts = [
  ["Comment choisir un bon burger ?", "Les détails qui font la différence: pain, cuisson, sauce et fraîcheur."],
  ["Organiser son rush du midi", "Des astuces simples pour servir vite sans perdre en qualité."],
  ["La livraison rapide et fiable", "Pourquoi la préparation et le packaging changent toute l’expérience."],
];

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

export default function RestaurantLandingPage({ apiBaseUrl = getApiBaseUrl() }) {
  const [language, setLanguage] = useState("fr");
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [publicMenu, setPublicMenu] = useState(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => readOfflineQueue().length);
  const t = translations[language];
  const restaurant = publicMenu?.restaurant;
  const brand = {
    primary: restaurant?.primary_color ?? "#ff1f17",
    secondary: restaurant?.secondary_color ?? "#05080d",
  };
  const dishes = publicMenu ? publicMenu.dishes : fallbackProducts;
  const categories = useMemo(
    () => buildCategories(publicMenu?.categories ?? fallbackCategories, dishes),
    [publicMenu, dishes]
  );
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    const slug = window.location.pathname.split("/").filter(Boolean)[0] || "main";
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
      if (result.synced > 0) setOrderMessage(`${result.synced} action(s) synchronisée(s).`);
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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
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
      items: cart.map((item) => ({ menu_item_id: item.id, quantity: item.quantity })),
    };
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/orders/public/${restaurant.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setOrderMessage(data.detail ?? "Commande impossible pour le moment.");
        return;
      }
      setCart([]);
      event.currentTarget.reset();
      setOrderMessage(`Commande ${data.order_number} reçue. Le restaurant va vous contacter.`);
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueOfflineAction({
          label: "Commande visiteur",
          requests: [{ path: `/api/v1/orders/public/${restaurant.slug}`, method: "POST", body: payload }],
        });
        setCart([]);
        event.currentTarget.reset();
        setOrderMessage("Connexion indisponible. Votre commande est enregistrée localement et sera envoyée automatiquement au retour du réseau.");
      } else {
        setOrderMessage(friendlyNetworkMessage(error, "Commande impossible pour le moment."));
      }
    } finally {
      setIsOrdering(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#111827]" style={{ "--brand-primary": brand.primary, "--brand-secondary": brand.secondary }}>
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
          <span>{offlineQueueCount} action(s) en attente de synchronisation.</span>
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={() => flushOfflineQueue(apiBaseUrl).then(() => setOfflineQueueCount(readOfflineQueue().length))} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm">
              Synchroniser
            </button>
            <button type="button" onClick={() => { clearOfflineQueue(); setOfflineQueueCount(0); }} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-red-600 shadow-sm">
              Vider
            </button>
          </span>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <CategoriesSection t={t} categories={categories} brand={brand} />
        <MenuSection t={t} products={dishes} search={search} onSearch={setSearch} onAdd={addToCart} onNavigate={scrollToSection} brand={brand} />
        <RestaurantInfoSection restaurant={restaurant} brand={brand} />
        <OrderSection cart={cart} setCart={setCart} restaurant={restaurant} onSubmit={submitOrder} message={orderMessage} isOrdering={isOrdering} brand={brand} />
        <PromoBanner t={t} onNavigate={scrollToSection} />
        <FeaturesSection t={t} brand={brand} />
        <BlogSection t={t} restaurant={restaurant} brand={brand} />
      </main>

      <Footer t={t} restaurant={restaurant} brand={brand} />
    </div>
  );
}

function HeroSection({ t, restaurant, brand, language, setLanguage, cartCount, onNavigate }) {
  const displayName = restaurant?.name ?? restaurantName;
  return (
    <section id="home" className="relative min-h-[460px] overflow-hidden bg-black px-5 py-6 text-white md:px-10">
      <img src={heroImage} alt="Burger" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/5" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <header className="flex items-center justify-between gap-5">
          <button type="button" onClick={() => onNavigate("home")} className="flex items-center gap-3">
            <ChefHat style={{ color: brand.primary }} size={34} />
            <h1 className="text-2xl font-black text-white">{displayName}</h1>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-black lg:flex">
            {t.nav.map(([id, label], index) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={index === 0 ? "text-[#ffcf8a] underline" : "transition hover:text-[#ffcf8a]"}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onNavigate("menu")} className="hidden h-11 w-11 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20 lg:flex" title={t.search}>
              <Search size={18} />
            </button>
            <button type="button" onClick={() => onNavigate("menu")} className="relative hidden h-11 w-11 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20 lg:flex" title={t.cart}>
              <ShoppingCart size={18} />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-black" style={{ backgroundColor: brand.primary }}>
                {cartCount}
              </span>
            </button>
            <LanguageToggle language={language} setLanguage={setLanguage} />
            <button type="button" onClick={() => onNavigate("menu")} className="hidden h-11 rounded-lg px-6 text-sm font-black text-white shadow-xl shadow-red-950/30 md:block" style={{ backgroundColor: brand.primary }}>
              {t.order}
            </button>
          </div>
        </header>

        <div className="mt-14 max-w-2xl">
          <p className="text-sm font-black uppercase tracking-normal text-[#ffcf8a]">🔥 {t.heroKicker}</p>
          <h2 className="mt-6 text-5xl font-black leading-tight md:text-7xl">
            {t.heroTitleA}
            <br />
            <span style={{ color: brand.primary }}>{t.heroTitleB}</span>
          </h2>
          <p className="mt-8 max-w-lg text-lg font-medium leading-8 text-slate-100">{t.heroText}</p>

          <div className="mt-10 flex flex-wrap gap-4">
            <button type="button" onClick={() => onNavigate("menu")} className="inline-flex h-14 items-center gap-3 rounded-lg px-7 text-sm font-black text-white" style={{ backgroundColor: brand.primary }}>
              {t.orderNow}
              <ArrowRight size={17} />
            </button>
            <button type="button" onClick={() => onNavigate("menu")} className="inline-flex h-14 items-center gap-3 rounded-lg border border-white/40 bg-white/10 px-7 text-sm font-black text-white backdrop-blur">
              {t.seeMenu}
              <Eye size={17} />
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-4">
          <HeroMetric icon={<Truck />} title={t.service[0]} text={t.service[1]} />
          <HeroMetric icon={<ShieldCheck />} title={t.service[2]} text={t.service[3]} />
          <HeroMetric icon={<Leaf />} title={t.service[4]} text={t.service[5]} />
          <HeroMetric icon={<Headphones />} title={t.service[6]} text={t.service[7]} />
        </div>
      </div>
    </section>
  );
}

function CategoriesSection({ t, categories, brand }) {
  return (
    <section id="about" className="scroll-mt-8 py-20 text-center">
      <p className="text-xs font-black uppercase" style={{ color: brand.primary }}>{t.categoriesKicker}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.categoriesTitle}</h2>
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {categories.map((category) => (
          <button key={category.id} type="button" className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <img src={category.image_url || heroImage} alt={category.name} className="h-28 w-full object-cover" />
            <div className="p-4 text-center">
              <h3 className="font-black">{category.name}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{category.count}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MenuSection({ t, products, search, onSearch, onAdd, onNavigate, brand }) {
  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter((product) => !query || product.name.toLowerCase().includes(query));

  return (
    <section id="menu" className="scroll-mt-8 py-20">
      <div className="mb-12 grid gap-6 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="text-xs font-black uppercase" style={{ color: brand.primary }}>{t.popularKicker}</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950">{t.popularTitle}</h2>
        </div>
        <label className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 shadow-sm">
          <Search size={17} className="text-slate-400" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.search} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" />
        </label>
      </div>
      <div className="grid gap-9 md:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => (
          <FoodCard key={product.id} product={product} onAdd={onAdd} brand={brand} />
        ))}
      </div>
      <div className="mt-12 flex justify-center">
        <button type="button" onClick={() => onNavigate("contact")} className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-black shadow-sm">
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
          <h2 className="mt-4 text-4xl font-black leading-tight">{t.promoTitle}</h2>
          <button type="button" onClick={() => onNavigate("menu")} className="mt-7 rounded-lg bg-white px-6 py-3 text-sm font-black text-[#ff1f17]">
            {t.orderNow}
          </button>
        </div>
        <img src={pizzaImage} alt="Pizza" className="absolute bottom-[-80px] right-[30%] hidden h-80 w-80 rounded-full object-cover lg:block" />
        <div className="absolute right-12 top-1/2 hidden -translate-y-1/2 rounded-lg border border-dashed border-white/80 px-12 py-8 text-center lg:block">
          <p className="font-bold">{t.promoCode}</p>
          <p className="mt-2 text-3xl font-black">BONCOIN20</p>
        </div>
      </div>
    </section>
  );
}

function RestaurantInfoSection({ restaurant, brand }) {
  const address = [restaurant?.address, restaurant?.city, restaurant?.country].filter(Boolean).join(", ") || "Adresse à renseigner";
  const phone = restaurant?.whatsapp_phone || restaurant?.phone || "Téléphone à renseigner";
  const paymentMethods = splitPaymentMethods(restaurant?.payment_methods);
  const whatsappHref = restaurant?.whatsapp_phone ? `https://wa.me/${restaurant.whatsapp_phone.replace(/\D/g, "")}` : null;

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
        <InfoCard icon={<MapPin size={19} />} title="Adresse" value={address} meta="Itinéraire restaurant" tone={brand.primary} />
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
      <div className="flex h-11 w-11 items-center justify-center rounded-lg text-white" style={{ backgroundColor: tone }}>
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-black uppercase text-slate-400">{title}</h3>
      <p className="mt-2 text-base font-black text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold" style={{ color: tone }}>{meta}</p>
    </div>
  );

  if (!href) return content;
  return <a href={href} target="_blank" rel="noreferrer">{content}</a>;
}

function OrderSection({ cart, setCart, restaurant, onSubmit, message, isOrdering, brand }) {
  const [fulfillmentType, setFulfillmentType] = useState("Livraison");
  const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
  const deliveryFee = fulfillmentType === "Livraison" ? Number(restaurant?.delivery_fee || 0) : 0;
  const grandTotal = total + deliveryFee;
  const paymentMethods = splitPaymentMethods(restaurant?.payment_methods);

  function updateQuantity(id, delta) {
    setCart((current) =>
      current
        .map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
        .filter((item) => item.quantity > 0)
    );
  }

  return (
    <section id="order" className="scroll-mt-8 py-12">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">Votre panier</h2>
          <div className="mt-5 divide-y divide-slate-100">
            {cart.length === 0 ? (
              <p className="py-8 text-sm font-semibold text-slate-500">Ajoutez des plats depuis le menu pour préparer votre commande.</p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-black text-slate-950">{item.name}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{formatMoney(item.price, restaurant?.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => updateQuantity(item.id, -1)} className="h-8 w-8 rounded-md border border-slate-200 font-black">-</button>
                    <span className="w-6 text-center text-sm font-black">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.id, 1)} className="h-8 w-8 rounded-md border border-slate-200 font-black">+</button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-5">
            <span className="text-sm font-black text-slate-500">Sous-total</span>
            <strong className="text-xl font-black text-slate-950">{formatMoney(total, restaurant?.currency)}</strong>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-black text-slate-500">Livraison</span>
            <strong className="text-base font-black text-slate-950">{formatMoney(deliveryFee, restaurant?.currency)}</strong>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-black text-slate-500">Total</span>
            <strong className="text-xl font-black text-slate-950">{formatMoney(grandTotal, restaurant?.currency)}</strong>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">Commander en ligne</h2>
          <div className="mt-5 grid gap-4">
            <input name="customer_name" required placeholder="Nom complet" className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]" />
            <input name="customer_phone" required placeholder="Téléphone" className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]" />
            <input name="customer_address" placeholder="Adresse de livraison" className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]" />
            <select name="fulfillment_type" value={fulfillmentType} onChange={(event) => setFulfillmentType(event.target.value)} className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]">
              <option>Livraison</option>
              <option>À emporter</option>
            </select>
            <select name="payment_method" className="h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]">
              {paymentMethods.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
            <textarea name="notes" placeholder="Instructions particulières" className="min-h-24 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]" />
          </div>
          <button
            type="submit"
            disabled={isOrdering || cart.length === 0 || !restaurant?.slug || restaurant?.is_open === false}
            className="mt-5 h-12 w-full rounded-lg text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: brand.primary }}
          >
            {restaurant?.is_open === false ? "Restaurant fermé" : isOrdering ? "Envoi..." : "Valider la commande"}
          </button>
          {message && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">{message}</p>}
        </form>
      </div>
    </section>
  );
}

function FeaturesSection({ t, brand }) {
  const features = [
    [<Leaf />, "Ingrédients frais", "Nous utilisons uniquement des produits frais."],
    [<Truck />, "Livraison rapide", "Votre commande livrée en 30 à 45 minutes."],
    [<LockKeyhole />, "Paiement sécurisé", "Paiement en ligne ou à la livraison."],
    [<Headphones />, "Service client 7j/7", "Notre équipe reste disponible."],
  ];

  return (
    <section className="py-12 text-center">
      <p className="text-xs font-black uppercase" style={{ color: brand.primary }}>{t.whyKicker}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.whyTitle}</h2>
      <div className="mt-9 grid gap-6 md:grid-cols-4">
        {features.map(([icon, title, text]) => (
          <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center" style={{ color: brand.primary }}>{icon}</div>
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
      <p className="text-xs font-black uppercase" style={{ color: brand.primary }}>{t.blogKicker}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.blogTitle}</h2>
      <div className="mt-7 grid gap-6 md:grid-cols-3">
        {blogPosts.map(([title, text]) => (
          <article key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase" style={{ color: brand.primary }}>{displayName}</p>
            <h3 className="mt-3 text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer({ t, restaurant, brand }) {
  const displayName = restaurant?.name ?? restaurantName;
  return (
    <footer id="footer-contact" className="scroll-mt-8 text-white" style={{ backgroundColor: brand.secondary }}>
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-9 md:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-xl font-black">{t.footerTitle}</h2>
          <p className="mt-2 text-sm text-slate-300">{t.footerText}</p>
          <div className="mt-5 flex gap-3">
            {["f", "ig", "wa", "tk"].map((item) => (
              <span key={item} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-black">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-black">{t.newsletter}</h2>
          <div className="mt-4 flex overflow-hidden rounded-lg bg-white">
            <input placeholder={t.email} className="min-w-0 flex-1 px-4 text-sm font-semibold text-slate-900 outline-none" />
            <button className="flex h-12 w-14 items-center justify-center" style={{ backgroundColor: brand.primary }}>
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white text-slate-700">
        <div className="mx-auto grid max-w-7xl gap-5 px-6 py-8 md:grid-cols-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">{displayName}</h3>
            <p className="mt-3 text-sm font-medium text-slate-500">{restaurant?.description || "Votre restaurant préféré, prêt à vous régaler avec une expérience exceptionnelle."}</p>
          </div>
          <FooterColumn title="Explorez" items={["Accueil", "Menu", "À propos", "Blog", "Contact"]} />
          <FooterColumn title="Contact" items={[restaurant?.phone || "+237 6 99 99 99", restaurant?.email || "contact@leboncoin.cm", [restaurant?.city, restaurant?.country].filter(Boolean).join(", ") || "Douala, Cameroun"]} />
          <FooterColumn title="Paiement accepté" items={["Visa", "Mastercard", "Orange Money"]} />
        </div>
      </div>
    </footer>
  );
}

function FoodCard({ product, onAdd, brand }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img src={product.image_url || heroImage} alt={product.name} className="h-56 w-full object-cover" />
        <button className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700">
          <Heart size={17} />
        </button>
      </div>
      <div className="p-5">
        <h3 className="font-black">{product.name}</h3>
        <p className="mt-2 min-h-12 text-sm font-medium text-slate-500">{product.description}</p>
        <div className="mt-5 flex items-center justify-between">
          <p className="text-lg font-black">{formatMoney(product.price)}</p>
          <button onClick={() => onAdd(product)} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: brand.primary }}>
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
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">{icon}</div>
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
            language === item ? "bg-[var(--brand-primary)] text-white" : "text-white"
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
    const count = dishes.filter((dish) => dish.category_id === category.id).length;
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
  const methods = value.split(",").map((item) => item.trim()).filter(Boolean);
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
    </div>
  );
}
