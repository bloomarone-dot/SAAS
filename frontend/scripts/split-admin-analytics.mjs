import fs from "node:fs";

const p = new URL("../src/offline/adminAnalytics.js", import.meta.url);
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const corePath = new URL("../src/offline/adminAnalyticsCore.js", import.meta.url);

const core = [
  "/** Analytics admin — fonctions pures (Node-testable). */",
  ...lines.slice(20, 606),
];
fs.writeFileSync(corePath, core.join("\n"));

const head = lines.slice(0, 19).join("\n");
const tail = lines.slice(606).join("\n");
const body = `import {
  periodBounds,
  orderActivityAt,
  isPaidOrder,
  isCancelledOrder,
  mergeLocalOrders,
  filterOrdersInRange,
  computeHourlySales,
  computeTopProducts,
  computeTopCategories,
  computePaymentMethods,
  computeEmployeePerformance,
  computeMealVsDrink,
  computeRealtimeOrders,
  computeKitchenStats,
  computeTableStats,
  computeCashDrawer,
  computeDiscountsAndVat,
  computeSalesChart,
  computeLocalAnalytics,
  computeLocalHomeInsights,
  computeRecentActivities,
  computeLocalDailyReport,
} from "./adminAnalyticsCore.js";

export * from "./adminAnalyticsCore.js";
`;

fs.writeFileSync(p, `${head}\n${body}\n${tail}`);
