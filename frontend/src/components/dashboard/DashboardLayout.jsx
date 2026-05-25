import { useState } from "react";

import { APP_MENUS } from "@/config/menu";
import { DashboardIcon } from "./icons";

export function DashboardLayout({
  role,
  user,
  activeView,
  theme,
  onNavigate,
  onLogout,
  children,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const menus = APP_MENUS[role] ?? APP_MENUS.MANAGER;
  const roleMeta = getRoleMeta(role);
  const primary = theme?.primary ?? "#f04438";
  const secondary = theme?.secondary ?? "#07133d";
  const activeBackground = `${primary}14`;

  return (
    <div className={`flex min-h-screen bg-white text-[#101828] ${role !== "SUPERADMIN" ? "tenant-theme" : ""}`} style={{ "--dashboard-primary": primary, "--dashboard-secondary": secondary }}>
      <aside className={`hidden shrink-0 border-r border-slate-200/80 bg-white py-8 transition-all duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[86px] px-4" : "w-[252px] px-5"}`}>
        <div className={`mb-9 flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2" style={{ borderColor: primary, color: primary }}>
            <DashboardIcon name="Store" size={22} />
          </div>
          <div className={isCollapsed ? "hidden" : ""}>
            <h1 className="text-lg font-black leading-tight text-slate-950">{role === "SUPERADMIN" ? "Resto SaaS" : theme?.name ?? "Restaurant"}</h1>
            <p className="text-xs font-semibold text-slate-500">Smart Restaurant</p>
          </div>
        </div>

        <div className="space-y-2">
          {menus.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              title={isCollapsed ? item.label : undefined}
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition-all ${
                isCollapsed ? "justify-center" : ""
              } ${
                activeView === item.key
                  ? ""
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
              style={activeView === item.key ? { backgroundColor: activeBackground, color: primary } : undefined}
            >
              <DashboardIcon name={item.icon} size={17} />
              {!isCollapsed && item.label}
            </button>
          ))}
        </div>

        <div className={`mt-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 ${isCollapsed ? "hidden" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <p className="text-xs font-bold text-slate-700">{roleMeta.mode}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">{roleMeta.sync}</p>
        </div>

        <div className={`mt-6 flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-sm font-black text-white">
            {user.first_name?.[0]}
          </div>
          <div className={`min-w-0 flex-1 ${isCollapsed ? "hidden" : ""}`}>
            <p className="truncate text-sm font-black text-slate-950">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs font-semibold text-slate-500">{roleMeta.userRole}</p>
          </div>
          <button type="button" onClick={onLogout} title="Déconnexion" className={`text-slate-500 ${isCollapsed ? "hidden" : ""}`} style={{ "--tw-text-opacity": 1 }} onMouseEnter={(event) => { event.currentTarget.style.color = primary; }} onMouseLeave={(event) => { event.currentTarget.style.color = ""; }}>
            <DashboardIcon name="LogOut" size={16} />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="relative flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-4 md:px-7">
          <div className="lg:hidden">
            <h1 className="text-lg font-black text-slate-950">Resto SaaS</h1>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="hidden text-slate-600 transition-colors lg:block"
            onMouseEnter={(event) => { event.currentTarget.style.color = primary; }}
            onMouseLeave={(event) => { event.currentTarget.style.color = ""; }}
            title={isCollapsed ? "Déplier le menu" : "Réduire le menu"}
          >
            <DashboardIcon name="Menu" size={20} />
          </button>

          <div className="absolute left-1/2 hidden -translate-x-1/2 text-center text-base font-black uppercase xl:block" style={{ color: primary }}>
            {roleMeta.heading}
          </div>

          <div className="flex items-center gap-3">
            <button className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm md:flex">
              <span style={{ color: primary }}>
                <DashboardIcon name="Store" size={15} />
              </span>
              {role === "SUPERADMIN" ? "Plateforme SaaS" : theme?.name ?? "Restaurant Central"}
            </button>
            <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600">
              <DashboardIcon name="Bell" size={19} />
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ backgroundColor: primary }}>
                4
              </span>
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
              {user.first_name?.[0]}
            </div>
          </div>
        </header>

        <div className="overflow-x-hidden bg-white p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

function getRoleMeta(role) {
  return {
    SUPERADMIN: {
      heading: "1. SUPERADMIN",
      mode: "Système en ligne",
      sync: "Synchronisé à 10:30",
      userRole: "Super administrateur",
    },
    ADMIN: {
      heading: "1. ADMINISTRATEUR / PROPRIÉTAIRE",
      mode: "Système en ligne",
      sync: "Synchronisé à 10:30",
      userRole: "Propriétaire",
    },
    MANAGER: {
      heading: "1. MANAGER",
      mode: "Système en ligne",
      sync: "Synchronisé à 10:30",
      userRole: "Manager",
    },
    SERVEUR: {
      heading: "2. SERVEUR / SERVEUSE",
      mode: "Mode hors ligne",
      sync: "Données locales",
      userRole: "Serveur",
    },
    CUISINE: {
      heading: "3. CUISINIER",
      mode: "Mode cuisine",
      sync: "En ligne",
      userRole: "Cuisinier",
    },
    STOCK: {
      heading: "4. GESTIONNAIRE DE STOCK / COMPTABLE",
      mode: "Synchronisé",
      sync: "À jour",
      userRole: "Gestionnaire",
    },
    COMPTABLE: {
      heading: "4. GESTIONNAIRE DE STOCK / COMPTABLE",
      mode: "Synchronisé",
      sync: "À jour",
      userRole: "Comptable",
    },
    CAISSE: {
      heading: "5. CAISSE",
      mode: "Caisse active",
      sync: "À jour",
      userRole: "Caissier",
    },
  }[role] ?? {
    heading: role,
    mode: "Système en ligne",
    sync: "Synchronisé",
    userRole: role,
  };
}
