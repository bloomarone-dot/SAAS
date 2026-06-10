import asyncio
from collections import defaultdict

from fastapi import WebSocket


class PaymentConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, restaurant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[restaurant_id].add(websocket)

    async def disconnect(self, restaurant_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[restaurant_id].discard(websocket)
            if not self._connections[restaurant_id]:
                self._connections.pop(restaurant_id, None)

    async def broadcast(self, restaurant_id: str, event: dict) -> None:
        async with self._lock:
            connections = list(self._connections.get(restaurant_id, ()))
        stale = []
        for websocket in connections:
            try:
                await websocket.send_json(event)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            await self.disconnect(restaurant_id, websocket)


payment_connections = PaymentConnectionManager()
