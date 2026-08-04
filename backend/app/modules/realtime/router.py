from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.modules.realtime.manager import restaurant_connections
from app.modules.users.models import User
from app.security import decode_access_token

router = APIRouter(prefix="/realtime", tags=["Realtime"])


@router.websocket("/ws")
async def restaurant_realtime_websocket(websocket: WebSocket, token: str = Query(default="")):
    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None
    db = SessionLocal()
    try:
        user = db.get(User, user_id) if user_id else None
        token_revoked = user is not None and int(payload.get("ver", 0)) != int(
            getattr(user, "token_version", 0) or 0
        )
        if not user or not user.is_active or not user.restaurant_id or token_revoked:
            await websocket.close(code=4401)
            return
        restaurant_id = user.restaurant_id
    finally:
        db.close()

    await restaurant_connections.connect(restaurant_id, websocket)
    try:
        await websocket.send_json({"event": "restaurant_stream_ready"})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await restaurant_connections.disconnect(restaurant_id, websocket)
