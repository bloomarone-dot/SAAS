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

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail ?? "Requete table impossible.");
    }

    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    throw new Error(friendlyNetworkMessage(error, "Requete table impossible."));
  }
}

export const tableApi = {
  getTables: (restaurantId) => request(`/tables/restaurant/${restaurantId}`),

  createTable: (restaurantId, tableData) =>
    request(`/tables?restaurant_id=${restaurantId}`, {
      method: "POST",
      body: JSON.stringify(tableData),
    }),

  updateTableStatus: (tableId, status) =>
    request(`/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getActiveOrders: (tableId) => request(`/tables/${tableId}/orders/active`),

  createOrder: (tableId, payload = { party_size: 1 }) =>
    request(`/tables/${tableId}/orders`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
