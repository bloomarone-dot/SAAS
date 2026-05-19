import { useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Eye,
  Heart,
  Headphones,
  Leaf,
  LockKeyhole,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from "lucide-react";

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
    login: "Connexion",
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
    login: "Login",
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

const categories = [
  ["Burgers", "12 plats", heroImage],
  ["Pizzas", "15 plats", pizzaImage],
  ["Tacos", "10 plats", tacosImage],
  ["Grillades", "18 plats", chickenImage],
  ["Boissons", "8 plats", drinksImage],
  ["Desserts", "9 plats", dessertImage],
];

const products = [
  ["Cheese Burger", "4 500 FCFA", "Steak haché, fromage, salade, tomate, oignon.", heroImage],
  ["Pizza Margherita", "6 500 FCFA", "Sauce tomate, mozzarella, basilic frais.", pizzaImage],
  ["Tacos Mixte", "5 000 FCFA", "Viande hachée, poulet, frites, sauce fromagère.", tacosImage],
  ["Poulet Braisé", "6 000 FCFA", "Poulet mariné, épices spéciales, accompagnement.", chickenImage],
  ["Jus Naturel", "1 500 FCFA", "Cocktail frais, fruits de saison.", drinksImage],
  ["Dessert Maison", "2 500 FCFA", "Dessert gourmand préparé sur place.", dessertImage],
];

const blogPosts = [
  ["Comment choisir un bon burger ?", "Les détails qui font la différence: pain, cuisson, sauce et fraîcheur."],
  ["Organiser son rush du midi", "Des astuces simples pour servir vite sans perdre en qualité."],
  ["La livraison rapide et fiable", "Pourquoi la préparation et le packaging changent toute l’expérience."],
];

export default function RestaurantLandingPage({ onLoginClick }) {
  const [language, setLanguage] = useState("fr");
  const [cartCount, setCartCount] = useState(2);
  const [search, setSearch] = useState("");
  const t = translations[language];

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addToCart() {
    setCartCount((count) => count + 1);
    scrollToSection("menu");
  }

  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <HeroSection
        t={t}
        language={language}
        setLanguage={setLanguage}
        cartCount={cartCount}
        onLoginClick={onLoginClick}
        onNavigate={scrollToSection}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <CategoriesSection t={t} />
        <MenuSection t={t} search={search} onSearch={setSearch} onAdd={addToCart} onNavigate={scrollToSection} />
        <PromoBanner t={t} onNavigate={scrollToSection} />
        <FeaturesSection t={t} />
        <BlogSection t={t} />
      </main>

      <Footer t={t} />
    </div>
  );
}

function HeroSection({ t, language, setLanguage, cartCount, onLoginClick, onNavigate }) {
  return (
    <section id="home" className="relative min-h-[460px] overflow-hidden bg-black px-5 py-6 text-white md:px-10">
      <img src={heroImage} alt="Burger" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/5" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <header className="flex items-center justify-between gap-5">
          <button type="button" onClick={() => onNavigate("home")} className="flex items-center gap-3">
            <ChefHat className="text-[#ff1f17]" size={34} />
            <h1 className="text-2xl font-black text-white">{restaurantName}</h1>
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
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff1f17] px-1 text-xs font-black">
                {cartCount}
              </span>
            </button>
            <LanguageToggle language={language} setLanguage={setLanguage} />
            <button type="button" onClick={onLoginClick} className="h-11 rounded-lg border border-white/25 px-5 text-sm font-black text-white transition hover:bg-white hover:text-black">
              {t.login}
            </button>
            <button type="button" onClick={() => onNavigate("menu")} className="hidden h-11 rounded-lg bg-[#ff1f17] px-6 text-sm font-black text-white shadow-xl shadow-red-950/30 md:block">
              {t.order}
            </button>
          </div>
        </header>

        <div className="mt-14 max-w-2xl">
          <p className="text-sm font-black uppercase tracking-normal text-[#ffcf8a]">🔥 {t.heroKicker}</p>
          <h2 className="mt-6 text-5xl font-black leading-tight md:text-7xl">
            {t.heroTitleA}
            <br />
            <span className="text-[#ff1f17]">{t.heroTitleB}</span>
          </h2>
          <p className="mt-8 max-w-lg text-lg font-medium leading-8 text-slate-100">{t.heroText}</p>

          <div className="mt-10 flex flex-wrap gap-4">
            <button type="button" onClick={() => onNavigate("menu")} className="inline-flex h-14 items-center gap-3 rounded-lg bg-[#ff1f17] px-7 text-sm font-black text-white">
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

function CategoriesSection({ t }) {
  return (
    <section id="about" className="scroll-mt-8 py-20 text-center">
      <p className="text-xs font-black uppercase text-[#ff1f17]">{t.categoriesKicker}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.categoriesTitle}</h2>
      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {categories.map(([title, count, image]) => (
          <button key={title} type="button" className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <img src={image} alt={title} className="h-28 w-full object-cover" />
            <div className="p-4 text-center">
              <h3 className="font-black">{title}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{count}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MenuSection({ t, search, onSearch, onAdd, onNavigate }) {
  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter(([title]) => !query || title.toLowerCase().includes(query));

  return (
    <section id="menu" className="scroll-mt-8 py-20">
      <div className="mb-12 grid gap-6 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="text-xs font-black uppercase text-[#ff1f17]">{t.popularKicker}</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950">{t.popularTitle}</h2>
        </div>
        <label className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 shadow-sm">
          <Search size={17} className="text-slate-400" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t.search} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" />
        </label>
      </div>
      <div className="grid gap-9 md:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => (
          <FoodCard key={product[0]} product={product} onAdd={onAdd} />
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

function FeaturesSection({ t }) {
  const features = [
    [<Leaf />, "Ingrédients frais", "Nous utilisons uniquement des produits frais."],
    [<Truck />, "Livraison rapide", "Votre commande livrée en 30 à 45 minutes."],
    [<LockKeyhole />, "Paiement sécurisé", "Paiement en ligne ou à la livraison."],
    [<Headphones />, "Service client 7j/7", "Notre équipe reste disponible."],
  ];

  return (
    <section className="py-12 text-center">
      <p className="text-xs font-black uppercase text-[#ff1f17]">{t.whyKicker}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.whyTitle}</h2>
      <div className="mt-9 grid gap-6 md:grid-cols-4">
        {features.map(([icon, title, text]) => (
          <div key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center text-[#ff1f17]">{icon}</div>
            <h3 className="mt-4 font-black">{title}</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BlogSection({ t }) {
  return (
    <section id="blog" className="scroll-mt-8 py-12">
      <p className="text-xs font-black uppercase text-[#ff1f17]">{t.blogKicker}</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">{t.blogTitle}</h2>
      <div className="mt-7 grid gap-6 md:grid-cols-3">
        {blogPosts.map(([title, text]) => (
          <article key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase text-[#ff1f17]">{restaurantName}</p>
            <h3 className="mt-3 text-xl font-black text-slate-950">{title}</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer({ t }) {
  return (
    <footer id="contact" className="scroll-mt-8 bg-[#05080d] text-white">
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
            <button className="flex h-12 w-14 items-center justify-center bg-[#ff1f17]">
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white text-slate-700">
        <div className="mx-auto grid max-w-7xl gap-5 px-6 py-8 md:grid-cols-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">{restaurantName}</h3>
            <p className="mt-3 text-sm font-medium text-slate-500">Votre restaurant préféré, prêt à vous régaler avec une expérience exceptionnelle.</p>
          </div>
          <FooterColumn title="Explorez" items={["Accueil", "Menu", "À propos", "Blog", "Contact"]} />
          <FooterColumn title="Contact" items={["+237 6 99 99 99", "contact@leboncoin.cm", "Douala, Cameroun"]} />
          <FooterColumn title="Paiement accepté" items={["Visa", "Mastercard", "Orange Money"]} />
        </div>
      </div>
    </footer>
  );
}

function FoodCard({ product, onAdd }) {
  const [title, price, description, image] = product;
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img src={image} alt={title} className="h-56 w-full object-cover" />
        <button className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700">
          <Heart size={17} />
        </button>
      </div>
      <div className="p-5">
        <h3 className="font-black">{title}</h3>
        <p className="mt-2 min-h-12 text-sm font-medium text-slate-500">{description}</p>
        <div className="mt-5 flex items-center justify-between">
          <p className="text-lg font-black">{price}</p>
          <button onClick={() => onAdd(product)} className="inline-flex items-center gap-2 rounded-lg bg-[#ff1f17] px-4 py-2 text-sm font-black text-white">
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
            language === item ? "bg-[#ff1f17] text-white" : "text-white"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
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
