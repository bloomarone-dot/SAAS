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
import InstanceRequestForm from "@/features/instances/InstanceRequestForm";
import { navigate } from "@/core/routing/navigate";

export default function LandingPage({ apiBaseUrl }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyDone, setNotifyDone] = useState(false);

  function scrollTo(id) {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goToLogin() {
    navigate("/login");
  }

  function goToRegister() {
    navigate("/contact");
  }

  function goToSuperadmin() {
    goToLogin();
  }

  function goToSection(path, sectionId) {
    setMobileMenuOpen(false);
    if (window.location.pathname === path) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate(path);
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
          <a
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
            }}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
              <Utensils size={18} className="text-white" />
            </div>
            <span className="text-xl font-black text-slate-900">
              Bloomar<span className="text-emerald-600">One</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
            <button type="button" onClick={() => goToSection("/features", "features")} className="hover:text-emerald-600 transition">Fonctionnalités</button>
            <button type="button" onClick={() => goToSection("/pricing", "pricing")} className="hover:text-emerald-600 transition">Tarifs</button>
            <button type="button" onClick={() => goToSection("/contact", "request-instance")} className="hover:text-emerald-600 transition">Contact</button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goToLogin}
              className="hidden text-sm font-bold text-slate-700 hover:text-emerald-600 transition sm:block"
            >
              Se connecter
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

        {mobileMenuOpen && (
          <div className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden">
            <nav className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
              <button type="button" onClick={() => goToSection("/features", "features")} className="text-left hover:text-emerald-600">Fonctionnalités</button>
              <button type="button" onClick={() => goToSection("/pricing", "pricing")} className="text-left hover:text-emerald-600">Tarifs</button>
              <button type="button" onClick={() => goToSection("/contact", "request-instance")} className="text-left hover:text-emerald-600">Contact</button>
              <button type="button" onClick={goToLogin} className="text-left hover:text-emerald-600">Se connecter</button>
            </nav>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-24 text-white md:px-8 md:py-32">
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
              className="inline-flex h-14 items-center gap-3 rounded-lg bg-emerald-500 px-8 text-base font-black text-white shadow-2xl shadow-emerald-500/30 hover:bg-emerald-400 transition"
            >
              Créer Mon Compte Gratuit
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="inline-flex h-14 items-center gap-3 rounded-lg border border-white/20 bg-white/5 px-8 text-base font-black text-white backdrop-blur hover:bg-white/10 transition"
            >
              Voir la Démo
            </button>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { value: "500+", label: "Restaurants inscrits" },
              { value: "99.9%", label: "Temps de disponibilité" },
              { value: "0 FCFA", label: "GRATUIT\nPendant le lancement" },
              { value: "24/7", label: "Support en français" },
            ].map(({ value, label }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-5">
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
              { icon: <LayoutDashboard size={22} />, title: "Gestion des Tables", desc: "Suivez toutes vos tables en temps réel, avec ou sans serveurs" },
              { icon: <Warehouse size={22} />, title: "Inventaire Intelligent", desc: "Alertes automatiques et suivi des stocks en FCFA" },
              { icon: <BarChart3 size={22} />, title: "Rapports & Analytics", desc: "Ventes, bénéfices et tendances en un coup d'œil" },
              { icon: <QrCode size={22} />, title: "Menu Digital", desc: "QR Code pour vos clients, mise à jour instantanée" },
              { icon: <Users size={22} />, title: "Gestion du Personnel", desc: "Pointeuse, planning et heures de présence" },
              { icon: <Cloud size={22} />, title: "Multi-Branches", desc: "Gérez plusieurs points de vente depuis un seul tableau de bord" },
              { icon: <ChefHat size={22} />, title: "Écran Cuisine", desc: "Commandes en temps réel directement en cuisine" },
              { icon: <Smartphone size={22} />, title: "Application Mobile", desc: "Accessible sur téléphone, tablette et ordinateur" },
              { icon: <Shield size={22} />, title: "Sécurité & Rôles", desc: "Permissions par rôle : admin, gérant, serveur, caisse…" },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-lg border border-slate-100 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
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
              },
              {
                quote: "La gestion des stocks et de la caisse en un seul outil, c'est exactement ce qu'il nous fallait. Fini les tableurs Excel.",
                name: "Jean-Paul Mbarga",
                role: "Gérant, Le Gourmet — Douala",
              },
              {
                quote: "Le support en français et la rapidité du système font toute la différence. Nos serveurs adorent.",
                name: "Sylvie Tchamba",
                role: "Directrice, Saveurs d'Afrique — Bafoussam",
              },
            ].map(({ quote, name, role }) => (
              <div key={name} className="rounded-lg border border-slate-200 bg-white p-7 shadow-sm">
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
                      <CheckCircle size={13} className="text-emerald-500" />
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
            <div className="relative rounded-lg border-2 border-emerald-500 bg-white p-8 shadow-xl shadow-emerald-100">
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
                className="mt-8 w-full rounded-lg bg-emerald-600 py-3.5 text-sm font-black text-white hover:bg-emerald-700 transition"
              >
                Créer Mon Compte
              </button>
            </div>

            {/* Pro */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8">
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
                  <p className="text-center text-sm font-bold text-emerald-600">Vous serez notifié au lancement !</p>
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8">
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
                className="mt-8 block w-full rounded-lg border border-slate-300 bg-white py-3.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50 transition"
              >
                Contactez-nous
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEMANDE D'INSTANCE ── */}
      <section id="request-instance" className="bg-slate-50 px-5 py-20 md:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600">DEMANDER UNE INSTANCE</p>
          <h2 className="mt-3 text-3xl font-black text-slate-900 md:text-4xl">Créez l'espace de votre restaurant</h2>
          <p className="mt-3 text-sm font-medium leading-7 text-slate-500">
            Remplissez ce formulaire : notre équipe examine votre demande et active votre instance dédiée.
          </p>
        </div>
        <div className="mt-10">
          <InstanceRequestForm apiBaseUrl={apiBaseUrl} />
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
            className="mt-10 inline-flex h-14 items-center gap-3 rounded-lg bg-white px-10 text-base font-black text-emerald-700 shadow-xl hover:bg-emerald-50 transition"
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
                <button type="button" onClick={() => goToSection("/features", "features")} className="text-left hover:text-emerald-400 transition">Fonctionnalités</button>
                <button type="button" onClick={() => goToSection("/pricing", "pricing")} className="text-left hover:text-emerald-400 transition">Tarifs</button>
                <button type="button" onClick={() => goToSection("/contact", "request-instance")} className="text-left hover:text-emerald-400 transition">Contact</button>
                <button type="button" onClick={goToLogin} className="text-left hover:text-emerald-400 transition">Se Connecter</button>
                <button onClick={goToRegister} className="text-left hover:text-emerald-400 transition">Créer un compte</button>
                <button onClick={goToSuperadmin} className="text-left text-slate-500 hover:text-emerald-400 transition">Administration</button>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs font-medium md:flex-row">
            <p>© {new Date().getFullYear()} Bloomar One SaaS. Tous droits réservés.</p>
            <div className="flex items-center gap-2 text-emerald-500">
              <Globe size={13} />
              <span>Fait au Cameroun</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
