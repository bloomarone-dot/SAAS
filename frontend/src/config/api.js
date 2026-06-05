export function getApiBaseUrl() {
  if (import.meta.env.PROD) return window.location.origin;

  if (import.meta.env.VITE_API_URL) {
    try {
      const configured = new URL(import.meta.env.VITE_API_URL);
      const pageHost = window.location.hostname;
      if (
        configured.hostname === "localhost" &&
        pageHost &&
        pageHost !== "localhost" &&
        pageHost !== "127.0.0.1" &&
        !isDockerBridgeHost(pageHost)
      ) {
        configured.hostname = pageHost;
        return configured.toString().replace(/\/$/, "");
      }
    } catch {
      return import.meta.env.VITE_API_URL;
    }
    return import.meta.env.VITE_API_URL;
  }

  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

function isDockerBridgeHost(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}
