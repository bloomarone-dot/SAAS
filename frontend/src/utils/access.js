import { PERMISSIONS } from "@/config/menu";

const MODULE_READ_PERMISSION = {
  SERVEUR: PERMISSIONS.SERVICE_READ,
  CUISINE: PERMISSIONS.KITCHEN_READ,
  CAISSE: PERMISSIONS.CASHIER_READ,
  STOCK: PERMISSIONS.STOCK_READ,
  COMPTABLE: PERMISSIONS.ACCOUNTING_READ,
};

export function userPermissionSet(user) {
  return new Set(user?.permissions ?? []);
}

export function hasPermission(user, permission) {
  if (!user || !permission) return false;
  if (user.is_owner) return true;
  return userPermissionSet(user).has(permission);
}

export function hasModuleAccess(user, moduleRole) {
  if (!user) return false;
  if (user.role === moduleRole) return true;
  const permission = MODULE_READ_PERMISSION[moduleRole];
  return permission ? hasPermission(user, permission) : false;
}
