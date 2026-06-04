import { friendlyNetworkMessage } from "@/utils/network";

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.PROD) return window.location.origin;
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
      throw new Error(data.detail ?? "Requete cuisine impossible.");
    }

    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    throw new Error(friendlyNetworkMessage(error, "Requete cuisine impossible."));
  }
}

export const kitchenApi = {
  getActiveTickets: () => request("/kitchen/tickets/active"),

  createTicket: (ticketData) =>
    request("/kitchen/ticket", {
      method: "POST",
      body: JSON.stringify(ticketData),
    }),

  updateTicketStatus: (ticketId, status) =>
    request(`/kitchen/ticket/${ticketId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
