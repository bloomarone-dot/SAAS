/**
 * Résolution multi-tenant et thème restaurant.
 */
export {
  getTenantConfig,
  isLocalHost,
  normalizeHost,
  isPlatformHost,
  isSaasHost,
  getPublicHostKind,
  extractRestaurantSubdomain,
  shouldResolveTenantFromHost,
} from "@/tenancy/tenantResolver";

export { TenantThemeProvider, tenantThemeStyle } from "@/tenancy/TenantProvider";
export { normalizePublicRestaurant, buildRestaurantTheme } from "@/utils/restaurantTheme";
