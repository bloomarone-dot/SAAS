import { getPublicHostKind } from "@/core/tenant";

export const APP_PREFIX = "/app";

const routeAliases = {
  users: "staff",
  personnel: "staff",
  restaurants: "restaurants",
  categories: "menu-catalog",
  dishes: "menu-catalog",
  "menu-categories": "menu-catalog",
  "menu-dishes": "menu-catalog",
  availability: "menu-catalog",
  caisse: "cashier",
  // URLs canoniques demandées
  finance: "comptabilite",
  stock: "stock",
  orders: "orders",
};

const viewPathSegments = {
  staff: "users",
  "menu-catalog": "catalog",
  comptabilite: "finance",
  stocks: "stock",
};

/**
 * Préfixe de l'application SaaS authentifiée.
 * - plateforme dédiée : /superadmin (compat)
 * - ailleurs : /app
 */
export function routePrefix(user) {
  if (!user) return "";
  if (user.role === "SUPERADMIN" && getPublicHostKind() === "platform") {
    return "/superadmin";
  }
  return APP_PREFIX;
}

export function pathForView(user, view) {
  const prefix = routePrefix(user);
  const segment = viewPathSegments[view] ?? view;
  if (view === "dashboard") {
    return `${prefix}/dashboard`;
  }
  return `${prefix}/${segment}`;
}

export function viewFromPath(user, path = window.location.pathname) {
  const prefix = routePrefix(user);
  if (!prefix) return "dashboard";
  const cleanPath = path.replace(/\/+$/, "") || "/";
  if (cleanPath === prefix || cleanPath === `${prefix}/dashboard`) return "dashboard";
  if (!cleanPath.startsWith(`${prefix}/`)) return "dashboard";
  const view = cleanPath.slice(prefix.length + 1).split("/")[0];
  return routeAliases[view] ?? view ?? "dashboard";
}

export function pushAppRoute(user, view, replace = false) {
  const path = pathForView(user, view);
  if (window.location.pathname !== path) {
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  }
  return path;
}

export function isAuthenticatedAppPath(path = window.location.pathname) {
  const clean = path.replace(/\/+$/, "") || "/";
  return clean === "/app" || clean.startsWith("/app/") || clean === "/superadmin" || clean.startsWith("/superadmin/");
}
