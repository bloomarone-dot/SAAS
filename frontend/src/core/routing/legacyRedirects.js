import { cleanPathname, navigate } from "@/core/routing/navigate";

/**
 * Redirige les anciennes URLs vers le schéma séparé (marketing / restaurant / app).
 * Retourne true si une redirection a été effectuée.
 */
export function applyLegacyRedirect(path = window.location.pathname) {
  const clean = cleanPathname(path);
  const search = window.location.search || "";

  // Ancien path-tenant public : /r/:slug → /restaurant/:slug
  const legacyPublic = clean.match(/^\/r\/([^/]+)(\/.*)?$/);
  if (legacyPublic) {
    const slug = legacyPublic[1];
    const rest = legacyPublic[2] || "";
    let target = `/restaurant/${slug}`;
    if (rest === "/menu") target = `/restaurant/${slug}/menu`;
    else if (rest === "/commande" || rest === "/order") target = `/restaurant/${slug}/order`;
    else if (rest === "/contact") target = `/restaurant/${slug}/contact`;
    else if (rest === "/login" || rest === "/admin") target = `/restaurant/${slug}/login`;
    else if (rest && rest !== "/") {
      // Anciennes routes authentifiées sous /r/:slug/:view → /app/:view
      const segment = rest.replace(/^\//, "").split("/")[0];
      if (segment && !["menu", "commande", "order", "contact", "login", "admin"].includes(segment)) {
        target = segment === "dashboard" || !segment ? "/app/dashboard" : `/app/${segment}`;
      }
    }
    if (clean + search !== target + search) {
      navigate(target + search, { replace: true });
      return true;
    }
  }

  // Ancien préfixe staff sur sous-domaine : /admin → /app
  if (clean === "/admin") {
    navigate(`/app/dashboard${search}`, { replace: true });
    return true;
  }
  if (clean.startsWith("/admin/")) {
    const segment = clean.slice("/admin/".length).split("/")[0];
    navigate(`/${segment ? `app/${segment}` : "app/dashboard"}${search}`, { replace: true });
    return true;
  }

  // Anciens préfixes rôle (fallback local sans slug)
  const rolePrefix = clean.match(/^\/(serveur|cuisine|caisse|stock|comptable|manager)(\/.*)?$/);
  if (rolePrefix) {
    const rest = (rolePrefix[2] || "").replace(/^\//, "");
    const segment = rest.split("/")[0];
    const target = !segment || segment === "dashboard" ? "/app/dashboard" : `/app/${segment}`;
    navigate(target + search, { replace: true });
    return true;
  }

  return false;
}
