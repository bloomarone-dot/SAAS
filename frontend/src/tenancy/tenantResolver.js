const DEFAULT_SAAS_HOST = "restaurant.bloomarone.com";
const DEFAULT_PLATFORM_HOST = "platform.bloomarone.com";
const DEFAULT_BASE_DOMAIN = "bloomarone.com";
const RESERVED_SUBDOMAINS = new Set(["restaurant", "platform", "www", "api", "admin", "app", "assets", "static"]);

export function getTenantConfig() {
  return {
    saasHost: import.meta.env.VITE_SAAS_HOST || DEFAULT_SAAS_HOST,
    platformHost: import.meta.env.VITE_PLATFORM_HOST || DEFAULT_PLATFORM_HOST,
    baseDomain: import.meta.env.VITE_BASE_DOMAIN || DEFAULT_BASE_DOMAIN,
  };
}

export function isLocalHost(hostname = window.location.hostname) {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname) || hostname.endsWith(".local");
}

export function normalizeHost(hostname = window.location.hostname) {
  return String(hostname || "").split(":")[0].trim().toLowerCase();
}

export function isPlatformHost(hostname = window.location.hostname) {
  const host = normalizeHost(hostname);
  const { platformHost } = getTenantConfig();
  return host === platformHost || host === `www.${platformHost}`;
}

export function isSaasHost(hostname = window.location.hostname) {
  const host = normalizeHost(hostname);
  const { saasHost } = getTenantConfig();
  return host === saasHost || host === `www.${saasHost}` || isLocalHost(host);
}

export function getPublicHostKind(hostname = window.location.hostname) {
  if (isPlatformHost(hostname)) return "platform";
  if (isSaasHost(hostname)) return "saas";
  if (extractRestaurantSubdomain(hostname)) return "restaurant";
  return isLocalHost(hostname) ? "saas" : "unknown";
}

export function extractRestaurantSubdomain(hostname = window.location.hostname) {
  const host = normalizeHost(hostname);
  if (host.endsWith(".localhost")) {
    const subdomain = host.slice(0, -".localhost".length);
    if (subdomain && !subdomain.includes(".") && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return subdomain;
    }
    return null;
  }
  const { baseDomain } = getTenantConfig();
  if (!host.endsWith(`.${baseDomain}`)) return null;
  const subdomain = host.slice(0, -(baseDomain.length + 1));
  if (!subdomain || subdomain.includes(".") || RESERVED_SUBDOMAINS.has(subdomain)) return null;
  return subdomain;
}

export function shouldResolveTenantFromHost(hostname = window.location.hostname) {
  const host = normalizeHost(hostname);
  if (isPlatformHost(host) || isSaasHost(host)) return false;
  if (isLocalHost(host)) return false;
  return Boolean(extractRestaurantSubdomain(host));
}
