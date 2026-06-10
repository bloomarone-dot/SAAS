import { apiFetch } from "@/config/http";

const request = (path, options = {}) =>
  apiFetch(path, { ...options, fallback: "Requete cuisine impossible." });

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
