const PAYMENT_BUCKETS = ["Espèces", "Mobile Money", "Carte", "Autre"];

const PAYMENT_INTENT_PREFIXES = [
  "paiement avant livraison",
  "paiement pendant la livraison",
  "paiement à la livraison",
  "paiement a la livraison",
];

function methodLower(method) {
  return String(method || "").trim().toLowerCase();
}

export function isCashMethod(method) {
  const value = methodLower(method);
  return value === "espèces" || value === "especes" || value === "cash" || value === "liquide"
    || value.includes("espèce") || value.includes("espece");
}

export function isMobileMethod(method) {
  const value = methodLower(method);
  return value.includes("orange") || value.includes("mtn") || value.includes("mobile money")
    || value.includes("momo") || value.includes("dépôt orange") || value.includes("depot orange")
    || value.includes("dépôt mtn") || value.includes("depot mtn");
}

export function isCardMethod(method) {
  const value = methodLower(method);
  return value.includes("carte") || value.includes("card");
}

export function isMixedMethod(method) {
  return methodLower(method).includes("mixte");
}

export function isPaymentIntent(method) {
  const value = methodLower(method);
  return PAYMENT_INTENT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function classifyPaymentBucket(method) {
  if (isMixedMethod(method)) return "Autre";
  if (isCashMethod(method)) return "Espèces";
  if (isMobileMethod(method)) return "Mobile Money";
  if (isCardMethod(method)) return "Carte";
  if (isPaymentIntent(method)) return "Espèces";
  return "Autre";
}

export function orderPaymentBreakdown(order) {
  const buckets = Object.fromEntries(PAYMENT_BUCKETS.map((name) => [name, 0]));
  const cashPart = order?.cash_paid_amount;
  const mobilePart = order?.mobile_paid_amount;
  if (cashPart != null && mobilePart != null) {
    buckets["Espèces"] += Number(cashPart || 0);
    buckets["Mobile Money"] += Number(mobilePart || 0);
    return Object.fromEntries(Object.entries(buckets).filter(([, amount]) => amount > 0));
  }
  const amount = Number(order?.total_amount || 0);
  if (amount <= 0) return {};
  const bucket = classifyPaymentBucket(order?.payment_method);
  buckets[bucket] += amount;
  return Object.fromEntries(Object.entries(buckets).filter(([, amount]) => amount > 0));
}

export function aggregatePaymentMethods(orders = []) {
  const totals = Object.fromEntries(PAYMENT_BUCKETS.map((name) => [name, 0]));
  for (const order of orders) {
    for (const [bucket, amount] of Object.entries(orderPaymentBreakdown(order))) {
      totals[bucket] = (totals[bucket] || 0) + Number(amount || 0);
    }
  }
  return Object.fromEntries(
    Object.entries(totals)
      .filter(([, amount]) => amount > 0)
      .map(([key, value]) => [key, Math.round(value * 100) / 100]),
  );
}

export function aggregateDeliveryFees(orders = []) {
  return Math.round(
    orders.reduce((sum, order) => sum + Number(order?.delivery_fee || 0), 0) * 100,
  ) / 100;
}
