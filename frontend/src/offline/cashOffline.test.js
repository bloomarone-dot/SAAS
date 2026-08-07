/**
 * Tests verrouillage session caisse + numérotation tickets + conflits + stress.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applySessionLock,
  CashSessionConflictError,
  evaluateCashSessionAccess,
} from "./cashSessionLockCore.js";
import {
  formatTicketNumber,
  nextSequenceValue,
  parseTicketNumber,
  preserveClientTicketNumber,
} from "./ticketSequenceCore.js";
import {
  resolvePaymentConflict,
  resolveCashSessionCloseConflict,
  resolveOrderItemsConflict,
} from "./conflictResolution.js";
import { dedupeQueue, sortQueueForFlush } from "./syncHelpers.js";
import { computeReceiptTotals, buildCashSessionView } from "./cashSessionCore.js";

describe("evaluateCashSessionAccess", () => {
  it("autorise la reprise même utilisateur même appareil", () => {
    const result = evaluateCashSessionAccess(
      { status: "OPEN", opened_by_user_id: "u1", locked_by_device_id: "d1" },
      { userId: "u1", deviceId: "d1" },
    );
    assert.equal(result.action, "resume");
  });

  it("bloque un autre utilisateur", () => {
    assert.throws(
      () => evaluateCashSessionAccess(
        { status: "OPEN", opened_by_user_id: "u1", opened_by_name: "Alice", locked_by_device_id: "d1" },
        { userId: "u2", deviceId: "d2" },
      ),
      CashSessionConflictError,
    );
  });

  it("autorise reprise manager sur autre appareil", () => {
    const result = evaluateCashSessionAccess(
      { status: "OPEN", opened_by_user_id: "u1", locked_by_device_id: "d1" },
      { userId: "mgr", deviceId: "d2", role: "MANAGER", forceResume: true },
    );
    assert.equal(result.action, "takeover");
  });
});

describe("ticketSequenceCore", () => {
  it("formate CAM-DEVICE-YYYYMMDD-000001 multi-terminal", () => {
    const num = formatTicketNumber("CAM", "2026-08-07", 1, "abc-dev-123");
    assert.equal(num, "CAM-ABCDEV12-20260807-000001");
    const parsed = parseTicketNumber(num);
    assert.equal(parsed.sequence, 1);
    assert.equal(parsed.deviceCode, "ABCDEV12");
  });

  it("incrémente la séquence", () => {
    assert.equal(nextSequenceValue(41), 42);
  });

  it("préserve le numéro client après sync", () => {
    const merged = preserveClientTicketNumber(
      { order_number: "CAM-20260807-000001" },
      { id: "srv", order_number: "RESTO-123456789012" },
    );
    assert.equal(merged.order_number, "CAM-20260807-000001");
    assert.equal(merged.server_order_number, "RESTO-123456789012");
  });
});

describe("conflictResolution", () => {
  it("rejette double paiement", () => {
    const result = resolvePaymentConflict(
      { status: "Payée", payment_status: "SUCCESS" },
      { payment_method: "Espèces" },
    );
    assert.equal(result.action, "reject_duplicate");
  });

  it("first close wins", () => {
    const result = resolveCashSessionCloseConflict(
      { closed_at: "2026-08-07T20:00:00Z" },
      { closed_at: "2026-08-07T20:05:00Z" },
    );
    assert.equal(result.winner.closed_at, "2026-08-07T20:00:00Z");
  });

  it("last write wins pour items", () => {
    const result = resolveOrderItemsConflict(
      { updated_at: "2026-08-07T12:00:00Z", items: [{ quantity: 2 }] },
      { updated_at: "2026-08-07T11:00:00Z", items: [{ quantity: 1 }] },
    );
    assert.equal(result.merged.items[0].quantity, 2);
  });
});

describe("stress offline", () => {
  it("500 commandes — calcul rapport < 500ms", () => {
    const receipts = Array.from({ length: 500 }, (_, i) => ({
      total_amount: 1000 + i,
      payment_method: "Espèces",
    }));
    const start = performance.now();
    computeReceiptTotals(receipts);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 500, `500 cmd: ${elapsed}ms`);
  });

  it("100 commandes — calcul rapport < 200ms", () => {
    const receipts = Array.from({ length: 100 }, (_, i) => ({
      total_amount: 500 + i,
      payment_method: "MTN Mobile Money",
    }));
    const start = performance.now();
    computeReceiptTotals(receipts);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `100 cmd: ${elapsed}ms`);
  });

  it("1000 commandes — calcul rapport < 500ms", () => {
    const receipts = Array.from({ length: 1000 }, (_, i) => ({
      total_amount: 1000 + i,
      payment_method: i % 2 === 0 ? "Espèces" : "Carte",
    }));
    const start = performance.now();
    const totals = computeReceiptTotals(receipts);
    const view = buildCashSessionView(
      { status: "OPEN", opening_float: 10000 },
      receipts,
      [],
    );
    const elapsed = performance.now() - start;
    assert.equal(totals.paid_orders_count, 1000);
    assert.ok(view.expected_in_drawer > 0);
    assert.ok(elapsed < 500, `rapport trop lent: ${elapsed}ms`);
  });

  it("10000 PendingOperations — dedupe + tri < 2s", () => {
    const queue = Array.from({ length: 10000 }, (_, i) => ({
      id: `a${i}`,
      type: i % 3 === 0 ? "cash_payment" : "order_status",
      localOrderId: `order_${i % 500}`,
      created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      status: "pending",
    }));
    const start = performance.now();
    const deduped = dedupeQueue(queue);
    const sorted = sortQueueForFlush(deduped);
    const elapsed = performance.now() - start;
    assert.ok(sorted.length <= queue.length);
    assert.ok(elapsed < 2000, `sync queue trop lente: ${elapsed}ms`);
  });
});

describe("tenant isolation keys", () => {
  it("clés session et tickets incluent tenantId", async () => {
    const { cashSessionMetaKey } = await import("./cashSessionCore.js");
    const { ticketSequenceMetaKey } = await import("./ticketSequenceCore.js");
    assert.match(cashSessionMetaKey("tenant-a", "2026-08-07", "main"), /tenant-a/);
    assert.match(ticketSequenceMetaKey("tenant-a", "2026-08-07", "device-1"), /tenant-a/);
    assert.match(ticketSequenceMetaKey("tenant-a", "2026-08-07", "device-1"), /device-1/);
    assert.doesNotMatch(cashSessionMetaKey("tenant-a", "2026-08-07"), /tenant-b/);
  });
});

describe("applySessionLock", () => {
  it("assigne deviceId et lock_token", () => {
    const locked = applySessionLock({ status: "OPEN" }, { userId: "u1", deviceId: "dev-1", userName: "Bob" });
    assert.equal(locked.locked_by_device_id, "dev-1");
    assert.ok(locked.lock_token);
  });
});
