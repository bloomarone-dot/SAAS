import { AdminDashboard } from "./roles/AdminDashboard";
import { CaisseDashboard } from "./roles/CaisseDashboard";
import { CuisineDashboard } from "./roles/CuisineDashboard";
import { ManagerDashboard } from "./roles/ManagerDashboard";
import { ServerDashboard } from "./roles/ServerDashboard";
import { StockDashboard } from "./roles/StockDashboard";
import { SuperadminDashboard } from "./roles/SuperadminDashboard";

const profiles = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  MANAGER: "manager",
  SERVEUR: "server",
  CUISINE: "kitchen",
  STOCK: "stock",
  COMPTABLE: "stock",
  CAISSE: "cashier",
};

export function RoleDashboard({ role, overrides = {} }) {
  const profile = profiles[role] ?? "admin";

  if (profile === "superadmin") return <SuperadminDashboard overrides={overrides} />;
  if (profile === "manager") return <ManagerDashboard overrides={overrides} />;
  if (profile === "cashier") return <CaisseDashboard overrides={overrides} />;
  if (profile === "server") return <ServerDashboard overrides={overrides} />;
  if (profile === "kitchen") return <CuisineDashboard overrides={overrides} />;
  if (profile === "stock") return <StockDashboard overrides={overrides} />;

  return <AdminDashboard role={role} overrides={overrides} />;
}
