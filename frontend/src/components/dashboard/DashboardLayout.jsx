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
  const isSuperadmin = role === "SUPERADMIN";
  const primary =
    isSuperadmin ? "#a855f7" : (theme?.primary ?? "#078d50");
  const secondary =
    isSuperadmin ? "#020617" : (theme?.secondary ?? "#003f2f");
  const accent = isSuperadmin ? "#06b6d4" : primary;
  const sidebarBackground = isSuperadmin ? "#020617" : "#ffffff";
  const sidebarText = isSuperadmin ? "#ffffff" : secondary;
  const sidebarMutedText = isSuperadmin ? "rgba(255,255,255,0.6)" : "#64748b";
  const sidebarBorder = isSuperadmin ? "rgba(255,255,255,0.15)" : "rgba(148,163,184,0.28)";
  const displayName =
    isSuperadmin ? "Bl∞marone" : (theme?.name ?? "Le Bon Coin");
  const sidebarLogo = isSuperadmin ? "/logoB.png" : "/logo.jpeg";
  const sidebarLogoAlt =
    isSuperadmin ? "Logo plateforme" : "Logo restaurant";

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
      const response = await fetch(
        `${apiBaseUrl}/api/v1/notifications?limit=8`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
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
      const hasActiveChild =
        hasChildren && item.children.some((child) => child.key === activeView);
      const isActive = activeView === item.key || hasActiveChild;
      const isExpanded =
        !isCollapsedMenu &&
        hasChildren &&
        (openMenuKeys[item.key] ?? hasActiveChild);

      return (
        <div key={item.key}>
          <button
            type="button"
            onClick={() => {
              navigateTo(item.key);
              if (hasChildren && !isCollapsedMenu) {
                setOpenMenuKeys((current) => ({
                  ...current,
                  [item.key]: !isExpanded,
                }));
              }
            }}
            title={isCollapsedMenu ? item.label : undefined}
            className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition-all ${
              isCollapsedMenu ? "justify-center" : ""
            } ${
              isActive
                ? ""
                : isSuperadmin
                  ? "text-white/85 hover:bg-white/10 hover:text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
            style={
              isActive
                ? isSuperadmin
                  ? { backgroundColor: primary, color: "white" }
                  : {
                      backgroundColor: `color-mix(in srgb, ${primary} 12%, white)`,
                      color: secondary,
                      boxShadow: `inset 3px 0 0 ${primary}`,
                    }
                : undefined
            }
          >
            <DashboardIcon name={item.icon} size={17} />
            {!isCollapsedMenu && (
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            )}
            {!isCollapsedMenu && hasChildren && (
              <DashboardIcon
                name="ChevronDown"
                size={15}
                className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            )}
          </button>

          {isExpanded && (
            <div
              className="mt-1 space-y-1 border-l pl-3"
              style={{ borderColor: sidebarBorder }}
            >
              {item.children.map((child) => {
                const isChildActive = activeView === child.key;
                return (
                  <button
                    key={child.key}
                    type="button"
                    onClick={() => navigateTo(child.key)}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-bold transition-all ${
                      isChildActive
                        ? ""
                        : isSuperadmin
                          ? "text-white/65 hover:bg-white/10 hover:text-white"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                    style={
                      isChildActive
                        ? isSuperadmin
                          ? {
                              backgroundColor: "rgba(255,255,255,0.14)",
                              color: "white",
                            }
                          : {
                              backgroundColor: `color-mix(in srgb, ${primary} 9%, white)`,
                              color: secondary,
                            }
                        : undefined
                    }
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
    <div
      className={`flex min-h-screen bg-white text-[#101828] app-theme ${role === "SUPERADMIN" ? "superadmin-theme" : "tenant-theme"}`}
      style={{
        "--dashboard-primary": primary,
        "--dashboard-secondary": secondary,
        "--dashboard-accent": accent,
      }}
    >
      <aside
        className={`hidden shrink-0 border-r py-8 transition-all duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[86px] px-4" : "w-[252px] px-5"}`}
        style={{
          background: isSuperadmin
            ? `linear-gradient(180deg, ${sidebarBackground}, color-mix(in srgb, ${sidebarBackground} 82%, black))`
            : `linear-gradient(180deg, #ffffff, color-mix(in srgb, ${primary} 4%, white))`,
          borderColor: sidebarBorder,
          color: sidebarText,
        }}
      >
        <div
          className={`mb-9 flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}
        >
          <img
            src={sidebarLogo}
            alt={sidebarLogoAlt}
            className={`h-12 w-12 rounded-full object-cover ${
              isSuperadmin
                ? "border-2 border-white/30 bg-white"
                : "border border-slate-200 bg-white shadow-sm"
            }`}
          />
          <div className={isCollapsed ? "hidden" : ""}>
            <h1
              className="text-lg font-black leading-tight"
              style={{ color: sidebarText }}
            >
              {displayName}
            </h1>
            <p className="text-xs font-semibold" style={{ color: primary }}>
              {isSuperadmin ? "Plateforme SaaS" : "Gestion de restaurant"}
            </p>
          </div>
        </div>

        <div className="space-y-2">{renderMenu(isCollapsed)}</div>

        <div
          className={`mt-auto rounded-lg border px-4 py-4 ${isCollapsed ? "hidden" : ""}`}
          style={{
            borderColor: sidebarBorder,
            backgroundColor: isSuperadmin
              ? "rgba(255,255,255,0.1)"
              : `color-mix(in srgb, ${primary} 6%, white)`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: primary }}
            />
            <p className="text-xs font-bold" style={{ color: sidebarText }}>
              {roleMeta.mode}
            </p>
          </div>
          <p className="mt-1 text-xs" style={{ color: sidebarMutedText }}>
            {roleMeta.sync}
          </p>
        </div>

        <div
          className={`mt-6 flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white"
            style={{
              background: isSuperadmin
                ? "linear-gradient(135deg, #e2e8f0, #94a3b8)"
                : `linear-gradient(135deg, ${primary}, ${secondary})`,
            }}
          >
            {user.first_name?.[0]}
          </div>
          <div className={`min-w-0 flex-1 ${isCollapsed ? "hidden" : ""}`}>
            <p className="truncate text-sm font-black" style={{ color: sidebarText }}>
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs font-semibold" style={{ color: sidebarMutedText }}>
              {roleMeta.userRole}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Déconnexion"
            className={`${isCollapsed ? "hidden" : ""}`}
            style={{ color: sidebarMutedText }}
          >
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
          <aside
            className="relative flex h-full w-[min(86vw,320px)] flex-col overflow-y-auto border-r px-5 py-6 shadow-2xl"
            style={{
              background: isSuperadmin
                ? `linear-gradient(180deg, ${sidebarBackground}, color-mix(in srgb, ${sidebarBackground} 82%, black))`
                : `linear-gradient(180deg, #ffffff, color-mix(in srgb, ${primary} 4%, white))`,
              borderColor: sidebarBorder,
              color: sidebarText,
            }}
          >
            <div className="mb-7 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={sidebarLogo}
                  alt={sidebarLogoAlt}
                  className={`h-11 w-11 rounded-full object-cover ${
                    isSuperadmin
                      ? "border-2 border-white/30 bg-white"
                      : "border border-slate-200 bg-white shadow-sm"
                  }`}
                />
                <div>
                  <h1
                    className="text-base font-black leading-tight"
                    style={{ color: sidebarText }}
                  >
                    {displayName}
                  </h1>
                  <p
                    className="text-xs font-semibold"
                    style={{ color: primary }}
                  >
                    {isSuperadmin ? "Plateforme SaaS" : "Gestion de restaurant"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  isSuperadmin
                    ? "text-white/80 hover:bg-white/10"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
                title="Fermer le menu"
              >
                <DashboardIcon name="Menu" size={20} />
              </button>
            </div>

            <div className="space-y-2">{renderMenu(false)}</div>
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <header
          className="relative flex h-[76px] items-center justify-between border-b bg-white/95 px-4 backdrop-blur md:px-7"
          style={{
            borderColor: isSuperadmin
              ? "rgba(226,232,240,0.8)"
              : `color-mix(in srgb, ${primary} 16%, #e2e8f0)`,
          }}
        >
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition-colors"
              style={{
                backgroundColor: isSuperadmin
                  ? undefined
                  : `color-mix(in srgb, ${primary} 7%, white)`,
                color: isSuperadmin ? undefined : secondary,
              }}
              title="Ouvrir le menu"
            >
              <DashboardIcon name="Menu" size={21} />
            </button>
            <h1 className="text-lg font-black text-slate-950">{displayName}</h1>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="hidden text-slate-600 transition-colors lg:block"
            onMouseEnter={(event) => {
              event.currentTarget.style.color = primary;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = "";
            }}
            title={isCollapsed ? "Déplier le menu" : "Réduire le menu"}
          >
            <DashboardIcon name="Menu" size={20} />
          </button>

          <div
            className="absolute left-1/2 hidden -translate-x-1/2 text-center text-base font-black uppercase xl:block"
            style={{ color: primary }}
          >
            {roleMeta.heading}
          </div>

          <div className="flex items-center gap-3">
            <button
              className="hidden h-10 items-center gap-2 rounded-lg border bg-white px-4 text-xs font-black shadow-sm md:flex"
              style={{
                borderColor: isSuperadmin
                  ? "#e2e8f0"
                  : `color-mix(in srgb, ${primary} 18%, #e2e8f0)`,
                color: secondary,
              }}
            >
              <span style={{ color: primary }}>
                <DashboardIcon name="Store" size={15} />
              </span>
              {role === "SUPERADMIN"
                ? "Plateforme SaaS"
                : (theme?.name ?? "Restaurant Central")}
            </button>
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((value) => !value)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600"
            >
              <DashboardIcon name="Bell" size={19} />
              {notifications.some((item) => !item.is_read) && (
                <span
                  className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black text-white"
                  style={{ backgroundColor: primary }}
                >
                  {notifications.filter((item) => !item.is_read).length}
                </span>
              )}
            </button>
            {isNotificationsOpen && (
              <div className="absolute right-4 top-[64px] z-40 w-[min(92vw,380px)] rounded-lg border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-black text-slate-950">
                    Notifications
                  </h2>
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-xs font-black"
                    style={{ color: primary }}
                  >
                    Tout marquer lu
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length ? (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => markNotificationRead(notification.id)}
                        className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${notification.is_read ? "opacity-70" : ""}`}
                      >
                        <p className="text-sm font-black text-slate-900">
                          {notification.title}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          {notification.message}
                        </p>
                        <p className="mt-2 text-[11px] font-bold uppercase text-slate-400">
                          {new Date(notification.created_at).toLocaleString(
                            "fr-FR",
                          )}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      Aucune notification.
                    </p>
                  )}
                </div>
              </div>
            )}
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              }}
            >
              {user.first_name?.[0]}
            </div>
          </div>
        </header>

        <div
          className="min-h-[calc(100vh-76px)] overflow-x-hidden p-4 md:p-6"
          style={{
            backgroundColor: isSuperadmin
              ? "#f8fafc"
              : `color-mix(in srgb, ${primary} 5%, #f8fafc)`,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function getRoleMeta(role) {
  return (
    {
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
    }
  );
}
