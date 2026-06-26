export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured || configured === "/") return window.location.origin;
  return configured.replace(/\/+$/, "");
}
