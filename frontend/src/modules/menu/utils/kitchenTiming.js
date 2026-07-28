/** Utilitaires d'affichage des temps cuisine (tickets + commandes). */

export function minutesSince(value, now = Date.now()) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((now - ts) / 60000));
}

export function minutesBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / 60000));
}

export function formatMinutes(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const mins = Math.max(0, Number(value));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Temps de l'étape en cours pour un ticket cuisine. */
export function ticketCurrentStageMinutes(ticket, now = Date.now()) {
  if (!ticket) return 0;
  if (ticket.status === "En attente") return minutesSince(ticket.created_at, now);
  if (ticket.status === "En préparation") return minutesSince(ticket.started_at || ticket.created_at, now);
  if (ticket.status === "Prête") return minutesSince(ticket.ready_at || ticket.started_at || ticket.created_at, now);
  if (ticket.status === "Servie") {
    return minutesBetween(ticket.created_at, ticket.served_at || ticket.ready_at) ?? minutesSince(ticket.created_at, now);
  }
  return minutesSince(ticket.created_at, now);
}

/** Lignes de détail des étapes d'un ticket. */
export function ticketStageLines(ticket, now = Date.now()) {
  if (!ticket?.created_at) return [];
  const lines = [];
  const waitEnd = ticket.started_at || (ticket.status === "En attente" ? new Date(now).toISOString() : null);
  if (waitEnd || ticket.status === "En attente") {
    lines.push({
      key: "wait",
      label: "Attente",
      minutes: minutesBetween(ticket.created_at, ticket.started_at) ?? minutesSince(ticket.created_at, now),
      active: ticket.status === "En attente",
    });
  }
  if (ticket.started_at || ticket.status === "En préparation") {
    lines.push({
      key: "prep",
      label: "Préparation",
      minutes:
        minutesBetween(ticket.started_at || ticket.created_at, ticket.ready_at) ??
        (ticket.status === "En préparation" ? minutesSince(ticket.started_at || ticket.created_at, now) : null),
      active: ticket.status === "En préparation",
    });
  }
  if (ticket.ready_at || ticket.status === "Prête") {
    lines.push({
      key: "ready",
      label: "Prêt → servi",
      minutes:
        minutesBetween(ticket.ready_at, ticket.served_at) ??
        (ticket.status === "Prête" ? minutesSince(ticket.ready_at, now) : null),
      active: ticket.status === "Prête",
    });
  }
  return lines.filter((line) => line.minutes != null);
}

/** Résumé court pour une commande (serveur / admin / caisse). */
export function orderKitchenTimingLabel(order) {
  if (!order?.kitchen_sent_at && order?.kitchen_total_minutes == null && !order?.kitchen_wait_minutes) {
    return null;
  }
  const status = order.status;
  if (status === "Acceptée" || status === "Nouvelle") {
    if (order.kitchen_wait_minutes != null) return `Cuisine · attente ${formatMinutes(order.kitchen_wait_minutes)}`;
  }
  if (status === "En préparation") {
    const prep = order.kitchen_prep_minutes;
    return prep != null ? `Cuisine · prep ${formatMinutes(prep)}` : "Cuisine · en préparation";
  }
  if (status === "Prête") {
    const wait = order.kitchen_ready_wait_minutes;
    return wait != null ? `Prête · ${formatMinutes(wait)}` : "Prête";
  }
  if (["Livrée", "Livree", "Payée", "Payee"].includes(status)) {
    const total = order.kitchen_total_minutes;
    return total != null ? `Cuisine · total ${formatMinutes(total)}` : null;
  }
  if (order.kitchen_total_minutes != null) {
    return `Cuisine · ${formatMinutes(order.kitchen_total_minutes)}`;
  }
  return null;
}

export function orderKitchenTimingDetails(order) {
  if (!order?.kitchen_sent_at && order?.kitchen_total_minutes == null) return [];
  const rows = [];
  if (order.kitchen_wait_minutes != null) {
    rows.push({ label: "Attente avant prep", minutes: order.kitchen_wait_minutes });
  }
  if (order.kitchen_prep_minutes != null) {
    rows.push({ label: "Préparation", minutes: order.kitchen_prep_minutes });
  }
  if (order.kitchen_ready_wait_minutes != null) {
    rows.push({ label: "Attente service", minutes: order.kitchen_ready_wait_minutes });
  }
  if (order.kitchen_total_minutes != null) {
    rows.push({ label: "Total cuisine", minutes: order.kitchen_total_minutes });
  }
  return rows;
}
