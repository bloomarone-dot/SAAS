/** Analytics admin — fonctions pures (Node-testable). */
const PAID_STATUSES = new Set(["Payée", "Payee", "Paye"]);
const CANCELLED_STATUSES = new Set(["Annulée", "Annulee"]);
const ARCHIVED = new Set(["Archivée", "Archivee"]);

const REALTIME_STATUS_KEYS = {
  "En préparation": "preparing",
  Prête: "ready",
  Livrée: "delivered",
  Payée: "paid",
  Payee: "paid",
  Annulée: "cancelled",
  Nouvelle: "new",
  Acceptée: "accepted",
  PENDING_PAYMENT: "pending_payment",
};

const WEEKDAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function periodBounds(period) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  if (period === "today") return [startOfDay(now), endOfDay(now)];
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return [startOfDay(y), endOfDay(y)];
  }
  if (period === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return [startOfDay(s), endOfDay(now)];
  }
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
  return [startOfDay(now), endOfDay(now)];
}

function previousPeriodBounds(period) {
  const [start, end] = periodBounds(period);
  const duration = end.getTime() - start.getTime();
  return [new Date(start.getTime() - duration - 1), new Date(start.getTime() - 1)];
}

export function orderActivityAt(order) {
  const raw = order?.paid_at || order?.paidAt || order?.updated_at || order?.updatedAt || order?.created_at || order?.createdAt;
  return raw ? new Date(raw) : null;
}

export function isPaidOrder(order) {
  if (!order) return false;
  if (order._paid_offline || order.payment_status === "SUCCESS") return true;
  return PAID_STATUSES.has(String(order.status || "").trim());
}

export function isCancelledOrder(order) {
  return CANCELLED_STATUSES.has(String(order?.status || "").trim());
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function variation(current, previous) {
  if (!previous) return null;
  return round2(((current - previous) / previous) * 100);
}

function channelSet(category) {
  if (category === "meal") return new Set(["REPAS"]);
  if (category === "drink") return new Set(["BOISSON"]);
  return new Set(["REPAS", "BOISSON"]);
}

function inferItemChannel(item, dishByName) {
  const channel = String(item?.sale_channel || "").toUpperCase();
  if (channel === "REPAS" || channel === "BOISSON") return channel;
  const dish = dishByName.get(String(item?.name || "").toLowerCase());
  if (dish?.sale_channel) return String(dish.sale_channel).toUpperCase();
  return "REPAS";
}

function buildDishIndex(menu) {
  const byName = new Map();
  for (const dish of menu?.dishes || []) {
    if (dish?.name) byName.set(String(dish.name).toLowerCase(), dish);
  }
  return byName;
}

function buildStaffIndex(staff) {
  const byId = new Map();
  for (const user of staff || []) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || "—";
    byId.set(String(user.id), name);
  }
  return byId;
}

export function mergeLocalOrders(localOrders = [], cashierSnapshot = null) {
  const byId = new Map();
  for (const order of cashierSnapshot?.receipts || []) {
    byId.set(String(order.id), { ...order });
  }
  for (const order of cashierSnapshot?.pending_orders || []) {
    byId.set(String(order.id), { ...(byId.get(String(order.id)) || {}), ...order });
  }
  for (const order of localOrders) {
    const id = String(order.id);
    byId.set(id, { ...(byId.get(id) || {}), ...order });
  }
  return [...byId.values()];
}

export function filterOrdersInRange(orders, start, end, { branchId, category, menu } = {}) {
  const channels = channelSet(category);
  const dishByName = buildDishIndex(menu);
  const startMs = start.getTime();
  const endMs = end.getTime();

  return orders.filter((order) => {
    if (ARCHIVED.has(String(order.status || ""))) return false;
    if (branchId && String(order.branch_id || order.branchId || "") !== String(branchId)) return false;
    const at = orderActivityAt(order);
    if (!at || at.getTime() < startMs || at.getTime() > endMs) return false;
    if (!isPaidOrder(order)) return false;
    if (category && category !== "all") {
      const items = order.items || [];
      if (!items.length) return true;
      return items.some((item) => channels.has(inferItemChannel(item, dishByName)));
    }
    return true;
  });
}

export function computeHourlySales(orders, startHour = 8, endHour = 22) {
  const buckets = {};
  for (let h = startHour; h <= endHour; h += 1) buckets[h] = 0;
  for (const order of orders) {
    const at = orderActivityAt(order);
    if (!at) continue;
    const hour = at.getHours();
    if (hour in buckets) buckets[hour] += Number(order.total_amount || 0);
  }
  return Object.entries(buckets).map(([hour, revenue]) => ({
    hour: `${String(hour).padStart(2, "0")}h`,
    revenue: round2(revenue),
  }));
}

export function computeTopProducts(orders, menu, category, limit = 8) {
  const channels = channelSet(category);
  const dishByName = buildDishIndex(menu);
  const agg = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const channel = inferItemChannel(item, dishByName);
      if (category && category !== "all" && !channels.has(channel)) continue;
      const name = item.name || "Article";
      const row = agg.get(name) || { name, category: channel, quantity: 0, revenue: 0 };
      row.quantity += Number(item.quantity || 0);
      row.revenue += Number(item.line_total || item.unit_price * item.quantity || 0);
      agg.set(name, row);
    }
  }
  return [...agg.values()]
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function computeTopCategories(orders, menu, limit = 8) {
  const dishByName = buildDishIndex(menu);
  const categoryNames = new Map((menu?.categories || []).map((c) => [String(c.id), c.name]));
  const agg = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const dish = dishByName.get(String(item?.name || "").toLowerCase());
      const catId = item.category_id || dish?.category_id || "other";
      const name = categoryNames.get(String(catId)) || "Autre";
      const row = agg.get(name) || { name, quantity: 0, revenue: 0 };
      row.quantity += Number(item.quantity || 0);
      row.revenue += Number(item.line_total || 0);
      agg.set(name, row);
    }
  }
  return [...agg.values()]
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function computePaymentMethods(orders) {
  const agg = new Map();
  for (const order of orders) {
    const method = String(order.payment_method || "Non renseigné").trim() || "Non renseigné";
    agg.set(method, (agg.get(method) || 0) + Number(order.total_amount || 0));
  }
  const total = [...agg.values()].reduce((s, v) => s + v, 0) || 0;
  return [...agg.entries()]
    .map(([method, amount]) => ({
      method,
      amount: round2(amount),
      share: total ? round2((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeEmployeePerformance(orders, staffIndex, limit = 8) {
  const agg = new Map();
  for (const order of orders) {
    const sid = order.server_id || order.serverId;
    if (!sid) continue;
    const row = agg.get(String(sid)) || {
      name: staffIndex.get(String(sid)) || order.server_name || "—",
      revenue: 0,
      orders: 0,
    };
    row.revenue += Number(order.total_amount || 0);
    row.orders += 1;
    agg.set(String(sid), row);
  }
  return [...agg.values()]
    .map((r) => ({
      ...r,
      revenue: round2(r.revenue),
      average_ticket: r.orders ? round2(r.revenue / r.orders) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function computeMealVsDrink(orders, menu) {
  const dishByName = buildDishIndex(menu);
  let meal = 0;
  let drink = 0;
  for (const order of orders) {
    for (const item of order.items || []) {
      const ch = inferItemChannel(item, dishByName);
      const amount = Number(item.line_total || 0);
      if (ch === "BOISSON") drink += amount;
      else meal += amount;
    }
  }
  if (!meal && !drink) {
    const total = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    meal = total;
  }
  return { meal: round2(meal), drink: round2(drink) };
}

export function computeRealtimeOrders(allOrders) {
  const counts = { new: 0, accepted: 0, preparing: 0, ready: 0, delivered: 0, paid: 0, cancelled: 0, pending_payment: 0 };
  for (const order of allOrders) {
    if (ARCHIVED.has(String(order.status || ""))) continue;
    const key = REALTIME_STATUS_KEYS[String(order.status || "")];
    if (key) counts[key] += 1;
  }
  counts.in_progress = counts.new + counts.accepted + counts.preparing + counts.ready;
  return counts;
}

export function computeKitchenStats(tickets) {
  const open = tickets.filter((t) => t.status !== "Servie");
  const closed = tickets.filter((t) => t.status === "Servie");
  let prepTotal = 0;
  let prepCount = 0;
  let serviceTotal = 0;
  let serviceCount = 0;
  for (const t of tickets) {
    const started = t.started_at || t.created_at;
    const ready = t.ready_at;
    const served = t.served_at;
    if (started && ready) {
      prepTotal += new Date(ready) - new Date(started);
      prepCount += 1;
    }
    if (ready && served) {
      serviceTotal += new Date(served) - new Date(ready);
      serviceCount += 1;
    }
  }
  return {
    open_tickets: open.length,
    closed_tickets: closed.length,
    avg_prep_minutes: prepCount ? Math.round(prepTotal / prepCount / 60000) : null,
    avg_service_minutes: serviceCount ? Math.round(serviceTotal / serviceCount / 60000) : null,
  };
}

export function computeTableStats(tables) {
  const list = Array.isArray(tables) ? tables : [];
  const occupied = list.filter((t) => Number(t.occupied_seats || 0) > 0 || String(t.status || "").toLowerCase().includes("occup"));
  return {
    total: list.length,
    occupied: occupied.length,
    free: Math.max(0, list.length - occupied.length),
  };
}

export function computeCashDrawer(cashierSnapshot) {
  if (!cashierSnapshot) {
    return {
      is_open: null,
      opening_float: 0,
      total_collected: 0,
      total_discounts: 0,
      expected_balance: 0,
      receipts_count: 0,
      pending_count: 0,
    };
  }
  return {
    is_open: true,
    opening_float: Number(cashierSnapshot.opening_float || 0),
    total_collected: round2(cashierSnapshot.total_collected),
    total_discounts: round2(cashierSnapshot.total_discounts),
    expected_balance: round2(cashierSnapshot.total_collected),
    receipts_count: Number(cashierSnapshot.receipts_count || cashierSnapshot.receipts?.length || 0),
    pending_count: Number(cashierSnapshot.pending_orders_count || cashierSnapshot.pending_orders?.length || 0),
  };
}

export function computeDiscountsAndVat(orders, vatRate = 0) {
  let totalDiscounts = 0;
  let discountedCount = 0;
  let vatCollected = 0;
  const discountLines = [];
  for (const order of orders) {
    const discount = Number(order.discount_amount || 0);
    if (discount > 0) {
      totalDiscounts += discount;
      discountedCount += 1;
      discountLines.push({
        order_number: order.order_number || order.id,
        discount_amount: round2(discount),
        total_amount: round2(order.total_amount),
        server_name: order.server_name || null,
        cashier_name: order.cashier_name || null,
      });
    }
    const amount = Number(order.total_amount || 0);
    const rate = Number(order.vat_rate ?? vatRate ?? 0);
    if (rate > 0) vatCollected += amount * (rate / (100 + rate));
  }
  discountLines.sort((a, b) => b.discount_amount - a.discount_amount);
  return {
    total_discounts: round2(totalDiscounts),
    discounted_orders_count: discountedCount,
    discount_lines: discountLines,
    vat_collected: round2(vatCollected),
  };
}

export function computeSalesChart(orders, start, end) {
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cursor <= endDay) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.map((day) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const dayOrders = filterOrdersInRange(orders, dayStart, dayEnd, { category: "all" });
    const revenue = dayOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return {
      label: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      date: day.toISOString().slice(0, 10),
      revenue: round2(revenue),
      orders: dayOrders.length,
    };
  });
}

function aggregatePeriod(orders, menu, staffIndex, start, end, opts) {
  const paid = filterOrdersInRange(orders, start, end, { ...opts, menu });
  const revenue = paid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const clients = paid.reduce((s, o) => s + Math.max(1, Number(o.party_size || 1)), 0);
  const { total_discounts, vat_collected } = computeDiscountsAndVat(paid, opts.vatRate);
  const cancellations = orders.filter((o) => {
    const at = orderActivityAt(o);
    return isCancelledOrder(o) && at && at >= start && at <= end;
  }).length;
  return {
    revenue: round2(revenue),
    orders_count: paid.length,
    average_ticket: paid.length ? round2(revenue / paid.length) : 0,
    clients_served: clients,
    profit: 0,
    margin_rate: 0,
    total_discounts,
    vat_collected,
    cancellations,
    paid,
  };
}

export function computeLocalAnalytics({
  orders,
  menu,
  staff,
  tables,
  tickets,
  cashierSnapshot,
  period = "today",
  category = "all",
  branchId = "",
  vatRate = 0,
}) {
  const [start, end] = periodBounds(period);
  const [prevStart, prevEnd] = previousPeriodBounds(period);
  const staffIndex = buildStaffIndex(staff);
  const opts = { branchId, category, menu, vatRate };

  const current = aggregatePeriod(orders, menu, staffIndex, start, end, opts);
  const previous = aggregatePeriod(orders, menu, staffIndex, prevStart, prevEnd, opts);
  const mealDrink = computeMealVsDrink(current.paid, menu);
  const discounts = computeDiscountsAndVat(current.paid, vatRate);

  return {
    source: "local",
    period: { start: start.toISOString(), end: end.toISOString() },
    kpis: {
      revenue: current.revenue,
      revenue_variation: variation(current.revenue, previous.revenue),
      profit: current.profit,
      orders_count: current.orders_count,
      orders_variation: variation(current.orders_count, previous.orders_count),
      average_ticket: current.average_ticket,
      average_ticket_variation: variation(current.average_ticket, previous.average_ticket),
      margin_rate: current.margin_rate,
      clients_served: current.clients_served,
      revenue_today: aggregatePeriod(orders, menu, staffIndex, ...periodBounds("today"), opts).revenue,
      revenue_week: aggregatePeriod(orders, menu, staffIndex, ...periodBounds("week"), opts).revenue,
      revenue_month: aggregatePeriod(orders, menu, staffIndex, ...periodBounds("month"), opts).revenue,
      open_tickets: computeKitchenStats(tickets).open_tickets,
      closed_tickets: computeKitchenStats(tickets).closed_tickets,
      avg_prep_minutes: computeKitchenStats(tickets).avg_prep_minutes,
      avg_service_minutes: computeKitchenStats(tickets).avg_service_minutes,
      tables_occupied: computeTableStats(tables?.tables || tables).occupied,
      tables_free: computeTableStats(tables?.tables || tables).free,
      total_discounts: discounts.total_discounts,
      vat_collected: discounts.vat_collected,
      cancellations: current.cancellations,
      refunds: 0,
    },
    hourly_sales: computeHourlySales(current.paid),
    sales_chart: computeSalesChart(orders, start, end),
    meal_vs_drink: mealDrink,
    top_products: computeTopProducts(current.paid, menu, category),
    top_categories: computeTopCategories(current.paid, menu),
    payment_methods: computePaymentMethods(current.paid),
    employee_performance: computeEmployeePerformance(current.paid, staffIndex),
    realtime_orders: computeRealtimeOrders(orders),
    stock_alerts: [],
    branches: [],
    cash_drawer: computeCashDrawer(cashierSnapshot),
    discount_lines: discounts.discount_lines,
  };
}

export function computeLocalHomeInsights({ orders, menu, branchId = "" }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const staffIndex = buildStaffIndex([]);
  const opts = { branchId, category: "all", menu };

  const today = aggregatePeriod(orders, menu, staffIndex, todayStart, now, opts);
  const yesterdayCutoff = new Date(now.getTime() - 86400000);
  const yesterdayStart = new Date(yesterdayCutoff.getFullYear(), yesterdayCutoff.getMonth(), yesterdayCutoff.getDate());
  const yesterday = aggregatePeriod(orders, menu, staffIndex, yesterdayStart, yesterdayCutoff, opts);

  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay() + (todayStart.getDay() === 0 ? -6 : 1));
  const week = aggregatePeriod(orders, menu, staffIndex, weekStart, now, opts);
  const lastWeekCutoff = new Date(now.getTime() - 7 * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const lastWeek = aggregatePeriod(orders, menu, staffIndex, lastWeekStart, lastWeekCutoff, opts);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = aggregatePeriod(orders, menu, staffIndex, monthStart, now, opts);

  const timeLabel = `${String(now.getHours()).padStart(2, "0")}h${String(now.getMinutes()).padStart(2, "0")}`;

  const cards = [
    {
      key: "today_vs_yesterday",
      title: "Chiffre d'affaires — par jour",
      value: today.revenue,
      comparison_value: yesterday.revenue,
      variation_pct: variation(today.revenue, yesterday.revenue),
      subtitle: "Aujourd'hui vs hier (même heure)",
    },
    {
      key: "week_vs_last_week",
      title: "Chiffre d'affaires — semaine",
      value: week.revenue,
      comparison_value: lastWeek.revenue,
      variation_pct: variation(week.revenue, lastWeek.revenue),
      subtitle: `Semaine en cours · ${WEEKDAYS_FR[now.getDay() === 0 ? 6 : now.getDay() - 1]}`,
    },
    {
      key: "month_vs_prev",
      title: "Chiffre d'affaires — mois",
      value: month.revenue,
      comparison_value: null,
      variation_pct: null,
      subtitle: MONTHS_FR[now.getMonth()],
    },
  ];

  return { source: "local", time_label: timeLabel, cards };
}

export function computeRecentActivities(orders, limit = 8) {
  return [...orders]
    .sort((a, b) => (orderActivityAt(b)?.getTime() || 0) - (orderActivityAt(a)?.getTime() || 0))
    .slice(0, limit)
    .map((order) => ({
      label: isPaidOrder(order)
        ? `Encaissement ${order.order_number || ""}`.trim()
        : isCancelledOrder(order)
          ? `Annulation ${order.order_number || ""}`.trim()
          : `Commande ${order.order_number || ""}`.trim(),
      value: `${Number(order.total_amount || 0).toLocaleString("fr-FR")} FCFA · ${order.status || "—"}`,
      time: orderActivityAt(order)?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) || "—",
    }));
}

export function computeLocalDailyReport({ orders, menu, staff, restaurantName, branchId = "", vatRate = 0 }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const analytics = computeLocalAnalytics({
    orders,
    menu,
    staff,
    tables: [],
    tickets: [],
    cashierSnapshot: null,
    period: "today",
    category: "all",
    branchId,
    vatRate,
  });
  const yesterdayCutoff = new Date(now.getTime() - 86400000);
  const yesterdayStart = new Date(yesterdayCutoff.getFullYear(), yesterdayCutoff.getMonth(), yesterdayCutoff.getDate());
  const yesterdayPaid = filterOrdersInRange(orders, yesterdayStart, yesterdayCutoff, { branchId, category: "all", menu });
  const yesterdayRevenue = yesterdayPaid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const staffIndex = buildStaffIndex(staff);
  const paidToday = filterOrdersInRange(orders, start, now, { branchId, category: "all", menu });
  const discounts = computeDiscountsAndVat(paidToday, vatRate);

  return {
    source: "local",
    date: now.toISOString().slice(0, 10),
    generated_at: now.toISOString(),
    restaurant_name: restaurantName || "Restaurant",
    owner_whatsapp: null,
    kpis: {
      ...analytics.kpis,
      total_discounts: discounts.total_discounts,
      discounted_orders_count: discounts.discounted_orders_count,
      meal_revenue: analytics.meal_vs_drink.meal,
      drink_revenue: analytics.meal_vs_drink.drink,
    },
    comparison: {
      yesterday_same_time_revenue: round2(yesterdayRevenue),
      variation_pct: variation(analytics.kpis.revenue, yesterdayRevenue),
    },
    payment_methods: analytics.payment_methods,
    top_products: analytics.top_products,
    employee_performance: computeEmployeePerformance(paidToday, staffIndex, 8),
    discount_lines: discounts.discount_lines,
    stock_alerts: [],
    realtime_orders: computeRealtimeOrders(orders),
  };
}