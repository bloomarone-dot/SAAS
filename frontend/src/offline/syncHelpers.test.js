/**
 * Tests purs Phase 5 — syncHelpers (sans navigateur).
 * Exécution : npm run test:offline
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dedupeQueue,
  isConflictResolved,
  isLocalId,
  sortQueueForFlush,
  TYPE_PRIORITY,
} from "./syncHelpers.js";

describe("isLocalId", () => {
  it("détecte les ids locaux", () => {
    assert.equal(isLocalId("local_order_1"), true);
    assert.equal(isLocalId("local_ticket_x"), true);
    assert.equal(isLocalId("abc-123"), false);
    assert.equal(isLocalId(null), false);
  });
});

describe("sortQueueForFlush", () => {
  it("ordonne create → items → cuisine → statut → paiement", () => {
    const sorted = sortQueueForFlush([
      { id: "p", type: "cash_payment", localOrderId: "o1", created_at: "2026-01-01T00:00:05Z" },
      { id: "c", type: "create_table_order", localOrderId: "o1", created_at: "2026-01-01T00:00:01Z" },
      { id: "i", type: "update_order_items", localOrderId: "o1", created_at: "2026-01-01T00:00:02Z" },
      { id: "s", type: "send_to_kitchen", localOrderId: "o1", created_at: "2026-01-01T00:00:03Z" },
      { id: "st", type: "order_status", localOrderId: "o1", created_at: "2026-01-01T00:00:04Z" },
    ]);
    assert.deepEqual(
      sorted.map((a) => a.type),
      ["create_table_order", "update_order_items", "send_to_kitchen", "order_status", "cash_payment"],
    );
    assert.ok(TYPE_PRIORITY.create_table_order < TYPE_PRIORITY.cash_payment);
  });

  it("place les failed à la fin", () => {
    const sorted = sortQueueForFlush([
      { id: "f", type: "cash_payment", status: "failed", localOrderId: "o1" },
      { id: "c", type: "create_table_order", status: "pending", localOrderId: "o1" },
    ]);
    assert.equal(sorted[0].id, "c");
    assert.equal(sorted[1].id, "f");
  });
});

describe("dedupeQueue", () => {
  it("ne garde qu'un paiement cash par commande (le dernier)", () => {
    const out = dedupeQueue([
      { id: "1", type: "cash_payment", localOrderId: "o1", payload: { payment_method: "Espèces" }, created_at: "t1" },
      { id: "2", type: "cash_payment", localOrderId: "o1", payload: { payment_method: "Carte" }, created_at: "t2" },
    ]);
    const cash = out.filter((a) => a.type === "cash_payment");
    assert.equal(cash.length, 1);
    assert.equal(cash[0].id, "2");
    assert.equal(cash[0].payload.payment_method, "Carte");
  });

  it("ne garde que le dernier update_order_items", () => {
    const out = dedupeQueue([
      { id: "a", type: "update_order_items", localOrderId: "o1", items: [{ menu_item_id: 1, quantity: 1 }] },
      { id: "b", type: "update_order_items", localOrderId: "o1", items: [{ menu_item_id: 1, quantity: 3 }] },
    ]);
    const items = out.filter((a) => a.type === "update_order_items");
    assert.equal(items.length, 1);
    assert.equal(items[0].items[0].quantity, 3);
  });

  it("déduplique l'envoi cuisine", () => {
    const out = dedupeQueue([
      { id: "1", type: "send_to_kitchen", localOrderId: "o1" },
      { id: "2", type: "send_to_kitchen_after_create", localOrderId: "o1" },
    ]);
    const sends = out.filter((a) => String(a.type).startsWith("send_to_kitchen"));
    assert.equal(sends.length, 1);
    assert.equal(sends[0].id, "1");
  });

  it("garde le statut cuisine le plus avancé", () => {
    const out = dedupeQueue([
      {
        id: "1",
        type: "kitchen_status_local",
        orderId: "o1",
        itemName: "Ndolé",
        quantity: 1,
        status: "En attente",
      },
      {
        id: "2",
        type: "kitchen_status_local",
        orderId: "o1",
        itemName: "Ndolé",
        quantity: 1,
        status: "Prête",
      },
    ]);
    const tickets = out.filter((a) => a.type === "kitchen_status_local");
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].status, "Prête");
  });
});

describe("isConflictResolved", () => {
  it("reconnaît déjà payée", () => {
    assert.equal(isConflictResolved(new Error("Cette commande est déjà payée")), true);
    assert.equal(isConflictResolved(new Error("Stock insuffisant")), false);
  });
});
