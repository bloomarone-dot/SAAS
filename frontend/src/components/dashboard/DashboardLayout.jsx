import { useEffect, useState } from "react";

import { APP_MENUS } from "@/config/menu";
import { DashboardIcon } from "./icons";

export function DashboardLayout({
  role,
  user,
  activeView,
  theme,
  onNavigate,
  onLogout,
  apiBaseUrl,
  children,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [openMenuKeys, setOpenMenuKeys] = useState({});
  const menus = APP_MENUS[role] ?? APP_MENUS.MANAGER;
  const roleMeta = getRoleMeta(role);
  const primary = role === "SUPERADMIN" ? "#a855f7" : theme?.primary ?? "#078d50";
  const secondary = role === "SUPERADMIN" ? "#020617" : theme?.secondary ?? "#003f2f";
  const accent = role === "SUPERADMIN" ? "#06b6d4" : primary;
  const sidebarLogo = role === "SUPERADMIN" ? "/logoB.png" : "/logo.jpeg";
  const sidebarLogoAlt = role === "SUPERADMIN" ? "Logo plateforme" : "Logo restaurant";
  const activeBackground = `${primary}14`;

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 15000);
    return () => window.clearInterval(timer);
  }, [apiBaseUrl]);

  async function loadNotifications() {
    if (!apiBaseUrl) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/notifications?limit=8`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      setNotifications(await response.json());
    } catch {
      // Notifications must not block dashboard usage.
    }
  }

  async function markNotificationRead(notificationId) {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    await fetch(`${apiBaseUrl}/api/v1/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    loadNotifications();
  }

  async function markAllNotificationsRead() {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    await fetch(`${apiBaseUrl}/api/v1/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    loadNotifications();
  }

  function navigateTo(view) {
    onNavigate(view);
    setIsMobileMenuOpen(false);
  }

  function renderMenu(isCollapsedMenu = false) {
    return menus.map((item) => {
      const hasChildren = Boolean(item.children?.length);
      const hasActiveChild = hasChildren && item.children.some((child) => child.key === activeView);
      const isActive = activeView === item.key || hasActiveChild;
      const isExpanded = !isCollapsedMenu && hasChildren && (openMenuKeys[item.key] ?? hasActiveChild);

      return (
        <div key={item.key}>
          <button
            type="button"
            onClick={() => {
              navigateTo(item.key);
              if (hasChildren && !isCollapsedMenu) {
                setOpenMenuKeys((current) => ({ ...current, [item.key]: !isExpanded }));
              }
            }}
            title={isCollapsedMenu ? item.label : undefined}
            className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition-all ${
              isCollapsedMenu ? "justify-center" : ""
            } ${isActive ? "" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
            style={isActive ? { backgroundColor: primary, color: "white" } : undefined}
          >
            <DashboardIcon name={item.icon} size={17} />
            {!isCollapsedMenu && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
            {!isCollapsedMenu && hasChildren && (
              <DashboardIcon
                name="ChevronDown"
                size={15}
                className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            )}
          </button>

          {isExpanded && (
            <div className="mt-1 space-y-1 border-l border-white/15 pl-3">
              {item.children.map((child) => {
                const isChildActive = activeView === child.key;
                return (
                  <button
                    key={child.key}
                    type="button"
                    onClick={() => navigateTo(child.key)}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-bold transition-all ${
                      isChildActive ? "" : "text-white/65 hover:bg-white/10 hover:text-white"
                    }`}
                    style={isChildActive ? { backgroundColor: "rgba(255,255,255,0.14)", color: "white" } : undefined}
                  >
                    <DashboardIcon name={child.icon} size={14} />
                    <span className="truncate">{child.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className={`flex min-h-screen bg-white text-[#101828] app-theme ${role === "SUPERADMIN" ? "superadmin-theme" : "tenant-theme"}`} style={{ "--dashboard-primary": primary, "--dashboard-secondary": secondary, "--dashboard-accent": accent }}>
      <aside className={`hidden shrink-0 py-8 text-white transition-all duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[86px] px-4" : "w-[252px] px-5"}`} style={{ background: `linear-gradient(180deg, ${secondary}, color-mix(in srgb, ${secondary} 82%, black))` }}>
        <div className={`mb-9 flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <img src={sidebarLogo} alt={sidebarLogoAlt} className="h-12 w-12 rounded-full border-2 border-white/30 object-cover bg-white" />
          <div className={isCollapsed ? "hidden" : ""}>
            <h1 className="text-lg font-black leading-tight text-white">{theme?.name ?? "Le Bon Coin"}</h1>
            <p className="text-xs font-semibold" style={{ color: primary }}>{role === "SUPERADMIN" ? "Plateforme SaaS" : "Gestion de restaurant"}</p>
          </div>
        </div>

        <div className="space-y-2">
          {renderMenu(isCollapsed)}
        </div>

        <div className={`mt-auto rounded-lg border border-white/15 bg-white/10 px-4 py-4 ${isCollapsed ? "hidden" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <p className="text-xs font-bold text-white">{roleMeta.mode}</p>
          </div>
          <p className="mt-1 text-xs text-white/60">{roleMeta.sync}</p>
        </div>

        <div className={`mt-6 flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-sm font-black text-white">
            {user.first_name?.[0]}
          </div>
          <div className={`min-w-0 flex-1 ${isCollapsed ? "hidden" : ""}`}>
            <p className="truncate text-sm font-black text-white">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs font-semibold text-white/60">{roleMeta.userRole}</p>
          </div>
          <button type="button" onClick={onLogout} title="Déconnexion" className={`text-white/70 ${isCollapsed ? "hidden" : ""}`}>
            <DashboardIcon name="LogOut" size={16} />
          </button>
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Fermer le menu"
          />
          <aside className="relative flex h-full w-[min(86vw,320px)] flex-col overflow-y-auto px-5 py-6 text-white shadow-2xl" style={{ background: `linear-gradient(180deg, ${secondary}, color-mix(in srgb, ${secondary} 82%, black))` }}>
            <div className="mb-7 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={sidebarLogo} alt={sidebarLogoAlt} className="h-11 w-11 rounded-full border-2 border-white/30 object-cover bg-white" />
                <div>
                  <h1 className="text-base font-black leading-tight text-white">{theme?.name ?? "Le Bon Coin"}</h1>
                  <p className="text-xs font-semibold" style={{ color: primary }}>{role === "SUPERADMIN" ? "Plateforme SaaS" : "Gestion de restaurant"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10" title="Fermer le menu">
                <DashboardIcon name="Menu" size={20} />
              </button>
            </div>

            <div className="space-y-2">{renderMenu(false)}</div>
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <header className="relative flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-4 md:px-7">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
              title="Ouvrir le menu"
            >
              <DashboardIcon name="Menu" size={21} />
            </button>
            <h1 className="text-lg font-black text-slate-950">Le Bon Coin</h1>
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
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((value) => !value)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600"
            >
              <DashboardIcon name="Bell" size={19} />
              {notifications.some((item) => !item.is_read) && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ backgroundColor: primary }}>
                  {notifications.filter((item) => !item.is_read).length}
                </span>
              )}
            </button>
            {isNotificationsOpen && (
              <div className="absolute right-4 top-[64px] z-40 w-[min(92vw,380px)] rounded-lg border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-black text-slate-950">Notifications</h2>
                  <button type="button" onClick={markAllNotificationsRead} className="text-xs font-black" style={{ color: primary }}>
                    Tout marquer lu
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length ? notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => markNotificationRead(notification.id)}
                      className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${notification.is_read ? "opacity-70" : ""}`}
                    >
                      <p className="text-sm font-black text-slate-900">{notification.title}</p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{notification.message}</p>
                      <p className="mt-2 text-[11px] font-bold uppercase text-slate-400">
                        {new Date(notification.created_at).toLocaleString("fr-FR")}
                      </p>
                    </button>
                  )) : (
                    <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Aucune notification.</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
              {user.first_name?.[0]}
            </div>
          </div>
        </header>

        <div className="min-h-[calc(100vh-76px)] overflow-x-hidden bg-slate-50 p-4 md:p-6">{children}</div>
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
