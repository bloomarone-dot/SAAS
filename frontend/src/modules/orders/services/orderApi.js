import { friendlyNetworkMessage } from "@/utils/network";

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

async function request(path, options = {}) {
  const token = localStorage.getItem("access_token");
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail ?? "Action commande impossible.");
    return data;
  } catch (error) {
    throw new Error(friendlyNetworkMessage(error, "Action commande impossible."));
  }
}

export const orderApi = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/api/v1/orders${suffix}`);
  },

  update: (orderId, payload) =>
    request(`/api/v1/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateStatus: (orderId, status) =>
    request(`/api/v1/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  logReceiptPrint: (orderId) =>
    request(`/api/v1/orders/${orderId}/receipt-print`, {
      method: "POST",
    }),
};
