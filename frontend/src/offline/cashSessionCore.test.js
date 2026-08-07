/**
 * Tests purs Phase 5 — session de caisse offline.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCashSessionView,
  buildCloseReport,
  canCloseCashSession,
  canOpenCashSession,
  computeReceiptTotals,
  MOVEMENT_TYPES,
  pickAuthoritativeSession,
  sumCashMovementImpact,
} from "./cashSessionCore.js";

describe("computeReceiptTotals", () => {
  it("agrège ventes espèces / mobile / carte", () => {
    const totals = computeReceiptTotals([
      { total_amount: 5000, payment_method: "Espèces" },
      { total_amount: 3000, payment_method: "MTN Mobile Money" },
      {
        total_amount: 7000,
        payment_method: "Mixte (Espèces + Mobile Money)",
        cash_paid_amount: 4000,
        mobile_paid_amount: 3000,
      },
    ]);
    assert.equal(totals.sales_total, 15000);
    assert.equal(totals.cash_sales, 9000);
    assert.equal(totals.mobile_sales, 6000);
    assert.equal(totals.paid_orders_count, 3);
  });
});

describe("sumCashMovementImpact", () => {
  it("calcule le net caisse des mouvements", () => {
    const impact = sumCashMovementImpact([
      { type: MOVEMENT_TYPES.DEPOSIT, amount: 5000 },
      { type: MOVEMENT_TYPES.WITHDRAWAL, amount: 2000 },
      { type: MOVEMENT_TYPES.EXPENSE, amount: 1000 },
      { type: MOVEMENT_TYPES.REFUND, amount: 500 },
      { type: MOVEMENT_TYPES.ADJUSTMENT, amount: 200 },
    ]);
    assert.equal(impact.deposits, 5000);
    assert.equal(impact.withdrawals, 2000);
    assert.equal(impact.expenses, 1000);
    assert.equal(impact.refunds, 500);
    assert.equal(impact.net_cash, 1700);
  });
});

describe("buildCashSessionView", () => {
  it("calcule expected_in_drawer avec fond + espèces + mouvements", () => {
    const view = buildCashSessionView(
      {
        id: "local_cash_1",
        status: "OPEN",
        opening_float: 10000,
        opened_at: "2026-08-07T08:00:00Z",
      },
      [
        { total_amount: 5000, payment_method: "Espèces" },
        { total_amount: 3000, payment_method: "Carte" },
      ],
      [{ type: MOVEMENT_TYPES.DEPOSIT, amount: 1000 }],
    );
    assert.equal(view.status, "OPEN");
    assert.equal(view.opening_float, 10000);
    assert.equal(view.cash_sales, 5000);
    assert.equal(view.sales_total, 8000);
    assert.equal(view.expected_in_drawer, 16000);
    assert.equal(view.expected_day_total, 18000);
    assert.equal(canCloseCashSession(view), true);
    assert.equal(canOpenCashSession(view), false);
  });

  it("calcule variance à la clôture", () => {
    const view = buildCashSessionView(
      {
        status: "CLOSED",
        opening_float: 10000,
        closing_counted: 15400,
      },
      [{ total_amount: 5000, payment_method: "Espèces" }],
      [],
    );
    assert.equal(view.variance, 400);
    const report = buildCloseReport(view);
    assert.equal(report.expected_in_drawer, 15000);
    assert.equal(report.variance, 400);
  });
});

describe("pickAuthoritativeSession", () => {
  it("préfère la session serveur clôturée", () => {
    const picked = pickAuthoritativeSession(
      { id: "local_cash_1", status: "OPEN", syncStatus: "PENDING_SYNC" },
      { id: "srv_1", status: "CLOSED", syncStatus: "SYNCED" },
    );
    assert.equal(picked.status, "CLOSED");
    assert.equal(picked.id, "srv_1");
  });

  it("conserve l'ouverture locale si le serveur n'a rien", () => {
    const picked = pickAuthoritativeSession(
      { id: "local_cash_1", status: "OPEN", syncStatus: "PENDING_SYNC" },
      { status: "NONE" },
    );
    assert.equal(picked.id, "local_cash_1");
  });
});

describe("canOpenCashSession", () => {
  it("refuse si session ouverte ou clôturée", () => {
    assert.equal(canOpenCashSession(buildCashSessionView(null, [], [])), true);
    assert.equal(canOpenCashSession(buildCashSessionView({ status: "OPEN" }, [], [])), false);
    assert.equal(canOpenCashSession(buildCashSessionView({ status: "CLOSED" }, [], [])), false);
  });
});
