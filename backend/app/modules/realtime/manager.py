"""WebSocket temps réel pour synchroniser cuisine, caisse et salle."""
import asyncio
import json
import logging
import os
from collections import defaultdict
from contextlib import suppress

from fastapi import WebSocket

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "").strip()
RESTAURANT_CHANNEL = "restaurant:events"


class RestaurantConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._redis = None
        self._listener_task: asyncio.Task | None = None

    async def connect(self, restaurant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[restaurant_id].add(websocket)

    async def disconnect(self, restaurant_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[restaurant_id].discard(websocket)
            if not self._connections[restaurant_id]:
                self._connections.pop(restaurant_id, None)

    async def _deliver_local(self, restaurant_id: str, event: dict) -> None:
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

    async def broadcast(self, restaurant_id: str, event: dict) -> None:
        if self._redis is not None:
            try:
                await self._redis.publish(
                    RESTAURANT_CHANNEL,
                    json.dumps({"restaurant_id": restaurant_id, "event": event}, default=str),
                )
                return
            except Exception:
                logger.exception("Publication Redis restaurant échouée; diffusion locale en secours")
        await self._deliver_local(restaurant_id, event)

    async def start(self) -> None:
        if not REDIS_URL:
            logger.info("WebSocket restaurant: mode mémoire (mono-instance)")
            return
        try:
            import redis.asyncio as aioredis  # type: ignore

            self._redis = aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
            await self._redis.ping()
            self._listener_task = asyncio.create_task(self._listen())
            logger.info("WebSocket restaurant: pub/sub Redis activé")
        except Exception:
            logger.warning("REDIS_URL défini mais Redis injoignable; WebSocket restaurant en mode mémoire")
            self._redis = None

    async def _listen(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(RESTAURANT_CHANNEL)
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message["data"])
                except (ValueError, TypeError):
                    continue
                restaurant_id = payload.get("restaurant_id")
                event = payload.get("event")
                if restaurant_id and isinstance(event, dict):
                    await self._deliver_local(restaurant_id, event)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Boucle pub/sub restaurant interrompue")
        finally:
            with suppress(Exception):
                await pubsub.unsubscribe(RESTAURANT_CHANNEL)
                await pubsub.aclose()

    async def stop(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._listener_task
        if self._redis is not None:
            with suppress(Exception):
                await self._redis.aclose()


restaurant_connections = RestaurantConnectionManager()


async def emit_restaurant_event(restaurant_id: str, event: str, **payload) -> None:
    await restaurant_connections.broadcast(restaurant_id, {"event": event, **payload})
