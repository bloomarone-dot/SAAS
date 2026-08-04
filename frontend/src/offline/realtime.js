import { getApiWsBaseUrl } from "@/config/api";
import { getToken } from "@/config/http";

const RESTAURANT_REALTIME_EVENT = "restaurant-realtime";

let socket = null;
let reconnectTimer = null;
let started = false;

function dispatchRestaurantEvent(payload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RESTAURANT_REALTIME_EVENT, { detail: payload }));
}

function scheduleReconnect() {
  if (reconnectTimer || !started) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRestaurantRealtime();
  }, 4_000);
}

export function connectRestaurantRealtime() {
  if (typeof window === "undefined") return () => {};
  started = true;
  const token = getToken();
  if (!token) return () => {};

  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }

  const ws = new WebSocket(
    `${getApiWsBaseUrl()}/api/v1/realtime/ws?token=${encodeURIComponent(token)}`,
  );
  socket = ws;

  ws.onopen = () => {
    dispatchRestaurantEvent({ event: "restaurant_stream_ready" });
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      if (payload?.event) dispatchRestaurantEvent(payload);
    } catch {
      // ignore malformed payloads
    }
  };

  ws.onclose = () => {
    if (socket === ws) socket = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      // ignore
    }
  };

  return () => {
    started = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
      socket = null;
    }
  };
}

export function onRestaurantRealtime(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail || {});
  window.addEventListener(RESTAURANT_REALTIME_EVENT, listener);
  return () => window.removeEventListener(RESTAURANT_REALTIME_EVENT, listener);
}

export function isKitchenRealtimeEvent(eventName) {
  return ["kitchen_updated", "restaurant_stream_ready"].includes(eventName);
}

export function isCashierRealtimeEvent(eventName) {
  return ["cashier_updated", "kitchen_updated", "restaurant_stream_ready"].includes(eventName);
}
