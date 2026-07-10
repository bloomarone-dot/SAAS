const STORAGE_KEY = "server_workspace_session";
const ORDER_SNAPSHOT_KEY = "server_workspace_order_snapshot";

export function saveServerSession(userId, session) {
  if (!userId || !session?.orderId) return;
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      userId,
      orderId: session.orderId,
      tableId: session.tableId || null,
      tableName: session.tableName || "",
      tableRoom: session.tableRoom || "Rez-de-chaussée",
      menuMode: session.menuMode !== false,
      savedAt: Date.now(),
    })
  );
}

export function loadServerSession(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.userId !== userId || !data.orderId) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearServerSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ORDER_SNAPSHOT_KEY);
}

export function saveOrderSnapshot(userId, order) {
  if (!userId || !order?.id) return;
  localStorage.setItem(
    ORDER_SNAPSHOT_KEY,
    JSON.stringify({
      userId,
      orderId: order.id,
      order,
      savedAt: Date.now(),
    })
  );
}

export function loadOrderSnapshot(userId, orderId) {
  if (!userId || !orderId) return null;
  try {
    const raw = localStorage.getItem(ORDER_SNAPSHOT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.userId !== userId || data.orderId !== orderId) return null;
    return data.order;
  } catch {
    return null;
  }
}
