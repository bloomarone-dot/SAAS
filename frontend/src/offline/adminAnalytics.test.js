import assert from "node:assert/strict";
import test from "node:test";

import {
  computeHourlySales,
  computeLocalAnalytics,
  computeRealtimeOrders,
  mergeLocalOrders,
} from "./adminAnalyticsCore.js";

test("mergeLocalOrders déduplique par id", () => {
  const merged = mergeLocalOrders(
    [{ id: "local_1", total_amount: 1000, status: "Payée", created_at: "2026-08-07T10:00:00Z" }],
    { receipts: [{ id: "local_1", total_amount: 900, status: "Payée", payment_method: "Espèces" }] },
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].total_amount, 1000);
  assert.equal(merged[0].payment_method, "Espèces");
});

test("computeLocalAnalytics calcule le CA du jour", () => {
  const today = new Date();
  const iso = today.toISOString();
  const orders = [
    {
      id: "1",
      status: "Payée",
      total_amount: 5000,
      paid_at: iso,
      items: [{ name: "Poulet", quantity: 1, line_total: 5000, sale_channel: "REPAS" }],
      payment_method: "Espèces",
    },
    {
      id: "2",
      status: "Payée",
      total_amount: 3000,
      paid_at: iso,
      items: [{ name: "Jus", quantity: 2, line_total: 3000, sale_channel: "BOISSON" }],
      payment_method: "Carte",
    },
  ];
  const result = computeLocalAnalytics({
    orders,
    menu: { categories: [], dishes: [] },
    staff: [],
    tables: { tables: [] },
    tickets: [],
    cashierSnapshot: null,
    period: "today",
  });
  assert.equal(result.kpis.revenue, 8000);
  assert.equal(result.kpis.orders_count, 2);
  assert.equal(result.kpis.average_ticket, 4000);
  assert.equal(result.payment_methods.length, 2);
  assert.equal(result.source, "local");
});

test("computeHourlySales agrège par heure", () => {
  const orders = [
    { total_amount: 1000, paid_at: "2026-08-07T12:30:00Z", status: "Payée" },
    { total_amount: 2000, paid_at: "2026-08-07T12:45:00Z", status: "Payée" },
  ];
  const rows = computeHourlySales(orders);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  assert.equal(total, 3000);
});

test("computeRealtimeOrders compte les statuts actifs", () => {
  const counts = computeRealtimeOrders([
    { status: "En préparation" },
    { status: "Prête" },
    { status: "Annulée" },
  ]);
  assert.equal(counts.preparing, 1);
  assert.equal(counts.ready, 1);
  assert.equal(counts.cancelled, 1);
  assert.equal(counts.in_progress, 2);
});
