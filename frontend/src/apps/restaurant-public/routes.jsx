import { TenantPublicRouter } from "@/features/auth/PublicAuthPages";
import { cleanPathname } from "@/core/routing/navigate";
import RestaurantStorefrontPage, {
  RestaurantStaffLogin,
} from "@/apps/restaurant-public/pages/RestaurantStorefrontPage";

/** /restaurant/:slug[/menu|/order|/contact|/login] */
const RESTAURANT_PUBLIC_RE = /^\/restaurant\/([^/]+)(?:\/(menu|order|commande|contact|login|admin))?$/;

export function matchRestaurantPublicPath(path = window.location.pathname) {
  return RESTAURANT_PUBLIC_RE.test(cleanPathname(path));
}

export function parseRestaurantPublicPath(path = window.location.pathname) {
  const match = cleanPathname(path).match(RESTAURANT_PUBLIC_RE);
  if (!match) return null;
  const slug = match[1];
  const segment = match[2] || "";
  let section = null;
  if (segment === "menu") section = "menu";
  else if (segment === "order" || segment === "commande") section = "commande";
  else if (segment === "contact") section = "infos";
  const isLogin = segment === "login" || segment === "admin";
  return { slug, section, isLogin };
}

/**
 * Site public restaurant (path-based).
 * Sur sous-domaine restaurant, délègue à TenantPublicRouter (host resolve).
 */
export function RestaurantPublicRoutes({
  path,
  apiBaseUrl,
  onAuthenticated,
  hostMode = false,
}) {
  if (hostMode) {
    return (
      <TenantPublicRouter
        apiBaseUrl={apiBaseUrl}
        currentPath={cleanPathname(path)}
        onAuthenticated={onAuthenticated}
      />
    );
  }

  const parsed = parseRestaurantPublicPath(path);
  if (!parsed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm font-semibold text-slate-500">
        Restaurant introuvable
      </div>
    );
  }

  if (parsed.isLogin) {
    return (
      <RestaurantStaffLogin
        apiBaseUrl={apiBaseUrl}
        slug={parsed.slug}
        onAuthenticated={onAuthenticated}
      />
    );
  }

  return (
    <RestaurantStorefrontPage
      apiBaseUrl={apiBaseUrl}
      slug={parsed.slug}
      initialSection={parsed.section}
    />
  );
}
