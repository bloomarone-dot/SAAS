import { useEffect, useState } from "react";

import { APP_MENUS } from "@/config/menu";
import { InstallAppButton } from "@/components/InstallAppButton";
import { useFullscreen } from "@/hooks/useFullscreen";
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
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const menus = APP_MENUS[role] ?? APP_MENUS.MANAGER;
  const roleMeta = getRoleMeta(role);
  const hideSidebar = role === "SERVEUR" || role === "CUISINE" || role === "COMPTABLE";
  const isSuperadmin = role === "SUPERADMIN";
  const primary = isSuperadmin ? "#a855f7" : "#FF6347";
  const secondary =
    isSuperadmin ? "#020617" : (theme?.secondary ?? "#003f2f");
  const accent = isSuperadmin ? "#06b6d4" : primary;
  const sidebarBackground = isSuperadmin ? "#1e293b" : "#ffffff";
  const sidebarText = isSuperadmin ? "#ffffff" : "#334155";
  const sidebarMutedText = isSuperadmin ? "rgba(255,255,255,0.62)" : "#94a3b8";
  const sidebarBorder = isSuperadmin ? "rgba(255,255,255,0.12)" : "#e2e8f0";
  const displayName =
    isSuperadmin ? "Bl∞marone" : (theme?.name ?? "Le Bon Coin");
  const sidebarLogo = isSuperadmin ? "/logoB.png" : "/logo.jpeg";
  const sidebarLogoAlt =
    isSuperadmin ? "Logo plateforme" : "Logo restaurant";
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
        `${apiBaseUrl}/api/v1/notifications?limit=30`,
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

  function openNotification(notification) {
    markNotificationRead(notification.id);
    const view = (notification.link || "").split("/").filter(Boolean).pop();
    if (view) navigateTo(view);
    setIsNotificationsOpen(false);
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
              if (hasChildren && !isCollapsedMenu) {
                setOpenMenuKeys((current) => ({
                  ...current,
                  [item.key]: !isExpanded,
                }));
                return;
              }
              navigateTo(item.defaultView ?? item.key);
            }}
            title={isCollapsedMenu ? item.label : undefined}
            className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition-all ${
              isCollapsedMenu ? "justify-center" : ""
            } ${
              isActive
                ? ""
                : isSuperadmin
                  ? "text-white/75 hover:bg-white/10 hover:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
            style={
              isActive
                ? isSuperadmin
                  ? {
                      backgroundColor: "rgba(15,23,42,0.35)",
                      color: "white",
                      boxShadow: `inset 4px 0 0 ${primary}`,
                    }
                  : {
                      backgroundColor: "rgba(255,99,71,0.1)",
                      color: "#FF6347",
                      boxShadow: "inset 4px 0 0 #FF6347",
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
                          ? "text-white/60 hover:bg-white/10 hover:text-white"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                    style={
                      isChildActive
                        ? isSuperadmin
                          ? {
                              backgroundColor: "rgba(255,255,255,0.12)",
                              color: "white",
                            }
                          : {
                              backgroundColor: "rgba(255,99,71,0.08)",
                              color: "#FF6347",
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
      className={`flex h-screen max-h-screen overflow-hidden bg-slate-100 text-slate-700 app-theme ${role === "SUPERADMIN" ? "superadmin-theme" : "tenant-theme"}`}
      style={{
        "--dashboard-primary": primary,
        "--dashboard-secondary": secondary,
        "--dashboard-accent": accent,
      }}
    >
      <aside
        className={`hidden shrink-0 border-r transition-all duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[68px]" : "w-64"} ${hideSidebar ? "!hidden" : ""}`}
        style={{
          background: isSuperadmin
            ? `linear-gradient(180deg, ${sidebarBackground}, color-mix(in srgb, ${sidebarBackground} 78%, black))`
            : sidebarBackground,
          borderColor: sidebarBorder,
          color: sidebarText,
        }}
      >
        <div
          className={`flex h-16 items-center gap-3 border-b px-3 ${isCollapsed ? "justify-center" : ""}`}
          style={{ borderColor: sidebarBorder }}
        >
          <img
            src={sidebarLogo}
            alt={sidebarLogoAlt}
            className={`h-9 w-9 shrink-0 rounded object-cover ${
              isSuperadmin
                ? "border-2 border-white/30 bg-white"
                : "border border-slate-200 bg-white shadow-sm"
            }`}
          />
          <div className={isCollapsed ? "hidden" : ""}>
            <h1
              className="text-base font-bold leading-tight"
              style={{ color: sidebarText }}
            >
              {displayName}
            </h1>
            <p className="text-[11px] font-semibold" style={{ color: sidebarMutedText }}>
              {isSuperadmin ? "Plateforme SaaS" : "Gestion de restaurant"}
            </p>
          </div>
        </div>

        {!isCollapsed && (
          <div className="border-b px-3 py-3" style={{ borderColor: sidebarBorder }}>
            <p className="text-sm font-semibold" style={{ color: sidebarText }}>{roleMeta.userRole}</p>
            <p className="mt-1 flex items-center gap-2 text-xs" style={{ color: isOnline ? "#10b981" : "#f59e0b" }}>
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"}`} />
              {isOnline ? "En ligne" : "Mode hors ligne"}
            </p>
          </div>
        )}

        {!isCollapsed && (
          <p className="px-4 pb-2 pt-4 text-[11px] font-bold uppercase tracking-wider" style={{ color: sidebarMutedText }}>
            Navigation
          </p>
        )}
        <div className={`flex-1 space-y-1 overflow-y-auto py-2 ${isCollapsed ? "px-2" : "px-3"}`}>
          {renderMenu(isCollapsed)}
        </div>

        <div
          className={`mx-3 mb-3 mt-auto border-t px-1 pt-3 ${isCollapsed ? "hidden" : ""}`}
          style={{
            borderColor: sidebarBorder,
            backgroundColor: "transparent",
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

        <div className={`border-t px-3 py-3 ${isCollapsed ? "flex justify-center" : "flex items-center gap-3"}`} style={{ borderColor: sidebarBorder }}>
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
          <div className={`flex items-center gap-1 ${isCollapsed ? "hidden" : ""}`}>
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              title="Changer mon mot de passe"
              style={{ color: sidebarMutedText }}
            >
              <DashboardIcon name="KeyRound" size={16} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Déconnexion"
              style={{ color: sidebarMutedText }}
            >
              <DashboardIcon name="LogOut" size={16} />
            </button>
          </div>
        </div>
      </aside>

      {isMobileMenuOpen && !hideSidebar && (
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
                ? `linear-gradient(180deg, ${sidebarBackground}, color-mix(in srgb, ${sidebarBackground} 78%, black))`
                : sidebarBackground,
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
                    style={{ color: sidebarMutedText }}
                  >
                    {isSuperadmin ? "Plateforme SaaS" : "Gestion de restaurant"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex h-10 w-10 items-center justify-center rounded ${
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

            <div className="mt-auto border-t pt-4" style={{ borderColor: sidebarBorder }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
                  style={{
                    background: isSuperadmin
                      ? "linear-gradient(135deg, #e2e8f0, #94a3b8)"
                      : `linear-gradient(135deg, ${primary}, ${secondary})`,
                  }}
                >
                  {user.first_name?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black" style={{ color: sidebarText }}>
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: sidebarMutedText }}>
                    {roleMeta.userRole}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsChangePasswordOpen(true);
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-black"
                style={{ borderColor: sidebarBorder, color: sidebarText }}
              >
                <DashboardIcon name="KeyRound" size={16} />
                Changer mon mot de passe
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onLogout();
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-black"
                style={{ borderColor: sidebarBorder, color: sidebarText }}
              >
                <DashboardIcon name="LogOut" size={16} />
                Déconnexion
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-3 text-white shadow-sm md:px-5"
          style={{
            backgroundColor: primary,
          }}
        >
          <div className={`flex items-center gap-3 ${hideSidebar ? "" : "lg:hidden"}`}>
            {!hideSidebar && (
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-white transition-colors hover:bg-black/10 lg:hidden"
              title="Ouvrir le menu"
            >
              <DashboardIcon name="Menu" size={21} />
            </button>
            )}
            <h1 className={`text-base font-bold text-white ${hideSidebar ? "block" : "lg:hidden"}`}>{displayName}</h1>
          </div>

          {!hideSidebar && (
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="hidden h-10 rounded-md px-3 text-white/90 transition-colors hover:bg-black/10 lg:block"
            title={isCollapsed ? "Déplier le menu" : "Réduire le menu"}
          >
            <DashboardIcon name="Menu" size={20} />
          </button>
          )}

          <div
            className="absolute left-1/2 hidden -translate-x-1/2 text-center text-sm font-bold uppercase tracking-wide text-white/95 xl:block"
          >
            {roleMeta.heading}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <InstallAppButton />
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex h-10 w-10 items-center justify-center rounded-md text-white/90 hover:bg-black/10"
              title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            >
              <DashboardIcon name={isFullscreen ? "Minimize2" : "Maximize2"} size={18} />
            </button>
            <button
              className="hidden h-9 items-center gap-2 rounded border border-white/20 bg-black/10 px-3 text-xs font-bold text-white md:flex"
              style={{
                color: "white",
              }}
            >
              <span className="text-white">
                <DashboardIcon name="Store" size={15} />
              </span>
              {role === "SUPERADMIN"
                ? "Plateforme SaaS"
                : (theme?.name ?? "Restaurant Central")}
            </button>
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((value) => !value)}
              className="relative flex h-10 w-10 items-center justify-center rounded-md text-white/90 hover:bg-black/10"
            >
              <DashboardIcon name="Bell" size={19} />
              {unreadCount > 0 && (
                <span
                  className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black text-white"
                  style={{ backgroundColor: accent }}
                >
                  {Math.min(9, unreadCount)}{unreadCount > 9 ? "+" : ""}
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
                        onClick={() => openNotification(notification)}
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
            {hideSidebar && (
              <button
                type="button"
                onClick={onLogout}
                title="Déconnexion"
                className="flex h-10 w-10 items-center justify-center rounded-md text-white/90 hover:bg-black/10"
              >
                <DashboardIcon name="LogOut" size={18} />
              </button>
            )}
          </div>
        </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 lg:px-6">
            {children}
          </div>
          <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            <span><strong>{displayName}</strong> · Restaurant SaaS</span>
            <span>Interface de gestion · 2026</span>
          </footer>
        </div>
      </main>

      {isChangePasswordOpen && (
        <ChangePasswordModal apiBaseUrl={apiBaseUrl} onClose={() => setIsChangePasswordOpen(false)} />
      )}
    </div>
  );
}

function ChangePasswordModal({ apiBaseUrl, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setError("");
    if (next !== confirm) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/change-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data?.detail === "string" ? data.detail : "Changement impossible.";
        setError(detail);
        return;
      }
      // Le backend renvoie un nouveau jeton (les autres sessions sont révoquées).
      if (data.access_token) localStorage.setItem("access_token", data.access_token);
      setDone(true);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !busy && onClose()}>
      <div className="lte-card mb-0 w-full max-w-sm" onClick={(event) => event.stopPropagation()}>
        <div className="lte-card-header">
          <h2 className="lte-card-title"><DashboardIcon name="KeyRound" size={17} /> Changer mon mot de passe</h2>
          <div className="lte-card-tools">
            <button type="button" onClick={onClose} className="lte-tool-btn"><DashboardIcon name="X" size={14} /></button>
          </div>
        </div>
        {done ? (
          <div className="lte-card-body space-y-4 text-center">
            <p className="text-sm font-semibold text-emerald-700">Mot de passe mis à jour. Vos autres sessions ont été déconnectées.</p>
            <button type="button" onClick={onClose} className="lte-btn lte-btn-primary w-full">Fermer</button>
          </div>
        ) : (
          <>
            <div className="lte-card-body space-y-3">
              <label className="lte-form-group">
                <span className="lte-label">Mot de passe actuel <span className="req">*</span></span>
                <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="form-control" autoFocus />
              </label>
              <label className="lte-form-group">
                <span className="lte-label">Nouveau mot de passe <span className="req">*</span></span>
                <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="form-control" />
                <span className="lte-help">Min. 8 caractères, avec minuscule, majuscule, chiffre et symbole.</span>
              </label>
              <label className="lte-form-group">
                <span className="lte-label">Confirmer le nouveau mot de passe <span className="req">*</span></span>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="form-control" />
              </label>
              {error && <p className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
            </div>
            <div className="lte-card-footer">
              <button type="button" onClick={onClose} disabled={busy} className="lte-btn lte-btn-default">Annuler</button>
              <button type="button" onClick={submit} disabled={busy || !current || !next} className="ml-auto lte-btn lte-btn-primary">
                {busy ? "Mise à jour…" : "Mettre à jour"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function findActiveMenu(menus, activeView) {
  for (const item of menus) {
    if (item.key === activeView) return item;
    const child = item.children?.find((entry) => entry.key === activeView);
    if (child) return child;
  }
  return null;
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
        heading: "SERVICE EN SALLE",
        mode: "Interface simplifiée",
        sync: "En ligne",
        userRole: "Serveuse",
      },
      CUISINE: {
        heading: "CUISINE",
        mode: "Production simplifiée",
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
