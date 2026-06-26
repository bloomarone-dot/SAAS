from datetime import datetime
from app.modules.shared.models import utcnow

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.orders.models import CustomerOrder
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User
from .models import TableModel, TableStatus
from .schemas import (
    TableCreate,
    TableOrderCreateIn,
    TableOrderCreateResponse,
    TableOrderResponse,
    TableResponse,
    TableUpdate,
)

router = APIRouter(
    prefix="/tables",
    tags=["Tables"]
)

# 1. CRÉER UNE TABLE
@router.post("", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
def create_table(
    restaurant_id: str,
    obj_in: TableCreate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_table_update_allowed(current_user)
    if restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=403, detail="Restaurant non autorise")

    # Vérifier si le numéro de table existe déjà pour ce restaurant
    existing_table = db.query(TableModel).filter(
        TableModel.restaurant_id == current_user.restaurant_id,
        TableModel.number == obj_in.name
    ).first()
    
    if existing_table:
        raise HTTPException(
            status_code=400, 
            detail=f"La table {obj_in.name} existe déjà dans ce restaurant."
        )

    db_table = TableModel(
        restaurant_id=current_user.restaurant_id,
        number=obj_in.name,
        room=obj_in.room,
        capacity=obj_in.capacity,
        status=TableStatus.LIBRE
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return serialize_table(db_table, [])

# 2. LISTER LES TABLES D'UN RESTAURANT
@router.get("/restaurant/{restaurant_id}", response_model=List[TableResponse])
def get_restaurant_tables(
    restaurant_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_table_read_allowed(current_user)
    if restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=403, detail="Restaurant non autorise")

    tables = db.query(TableModel).filter(
        TableModel.restaurant_id == current_user.restaurant_id,
        TableModel.is_active.is_(True),
    ).all()
    table_ids = [table.id for table in tables]
    active_orders_by_table = get_active_orders_by_table(db, table_ids, current_user.restaurant_id)
    return [serialize_table(table, active_orders_by_table.get(table.id, [])) for table in tables]

# 3. MODIFIER UNE TABLE (Changer le statut : Libre -> Occupée)
@router.patch("/{table_id}", response_model=TableResponse)
def update_table_status(
    table_id: int,
    obj_in: TableUpdate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_table_update_allowed(current_user)
    db_table = get_table_for_user(db, table_id, current_user)

    # Mettre à jour uniquement les champs envoyés
    update_data = obj_in.dict(exclude_unset=True)
    if "name" in update_data:
        update_data["number"] = update_data.pop("name")
        existing_table = db.query(TableModel).filter(
            TableModel.restaurant_id == current_user.restaurant_id,
            TableModel.number == update_data["number"],
            TableModel.id != db_table.id,
        ).first()
        if existing_table:
            raise HTTPException(status_code=400, detail=f"La table {update_data['number']} existe déjà.")
    for field, value in update_data.items():
        setattr(db_table, field, value)

    db.commit()
    db.refresh(db_table)
    return serialize_table(db_table, get_active_orders(db, db_table.id))

# 4. SUPPRIMER UNE TABLE
@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(
    table_id: int,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_table_update_allowed(current_user)
    db_table = get_table_for_user(db, table_id, current_user)
    if get_active_orders(db, db_table.id):
        raise HTTPException(status_code=400, detail="Impossible de supprimer une table avec commande active.")
    
    db_table.is_active = False
    db.commit()
    return None


@router.get("/{table_id}/orders/active", response_model=List[TableOrderResponse])
def get_active_table_orders(
    table_id: int,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    db_table = get_table_for_user(db, table_id, current_user)
    return [serialize_table_order(order, db_table, db) for order in get_active_orders(db, db_table.id)]


@router.post("/{table_id}/orders", response_model=TableOrderCreateResponse, status_code=status.HTTP_201_CREATED)
def create_table_order(
    table_id: int,
    payload: TableOrderCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    db_table = get_table_for_user(db, table_id, current_user)
    active_orders = get_active_orders(db, db_table.id)
    occupied_seats = count_occupied_seats(active_orders)
    free_seats = max(0, int(db_table.capacity or 0) - occupied_seats)
    if payload.party_size > free_seats:
        raise HTTPException(
            status_code=400,
            detail=f"Places insuffisantes: {free_seats} place(s) libre(s) sur {db_table.capacity}.",
        )
    order = CustomerOrder(
        restaurant_id=current_user.restaurant_id,
        branch_id=current_user.branch_id,
        table_id=db_table.id,
        server_id=current_user.id,
        party_size=payload.party_size,
        order_number=make_table_order_number(db_table.number),
        customer_name=(payload.customer_name or f"Client table {db_table.number}").strip(),
        customer_phone=(payload.customer_phone or "-").strip(),
        status="Nouvelle",
        fulfillment_type="Sur place",
        payment_method="À régler",
        total_amount=0,
    )
    db_table.status = TableStatus.OCCUPEE
    db.add(order)
    db.commit()
    db.refresh(order)
    active_orders_with_new_order = [*active_orders, order]
    return TableOrderCreateResponse(
        order=serialize_table_order(order, db_table, db),
        active_orders=[serialize_table_order(item, db_table, db) for item in active_orders_with_new_order],
        occupied_seats=count_occupied_seats(active_orders_with_new_order),
        free_seats=max(0, int(db_table.capacity or 0) - count_occupied_seats(active_orders_with_new_order)),
    )


def get_table_for_user(db: Session, table_id: int, user: User) -> TableModel:
    db_table = (
        db.query(TableModel)
        .filter(TableModel.id == table_id, TableModel.restaurant_id == user.restaurant_id)
        .first()
    )
    if not db_table:
        raise HTTPException(status_code=404, detail="Table introuvable.")
    return db_table


def assert_table_read_allowed(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER, Role.STOCK}:
        return
    assert_permission(user, Permission.SERVICE_READ)


def assert_table_update_allowed(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER, Role.STOCK}:
        return
    assert_permission(user, Permission.SERVICE_UPDATE)


def get_active_orders(db: Session, table_id: int) -> list[CustomerOrder]:
    inactive_statuses = {"Payée", "Payee", "Livrée", "Livree", "Annulée", "Annulee", "Archivée", "Archivee"}
    return (
        db.query(CustomerOrder)
        .filter(CustomerOrder.table_id == table_id)
        .filter(CustomerOrder.deleted_at.is_(None))
        .filter(~CustomerOrder.status.in_(inactive_statuses))
        .order_by(CustomerOrder.created_at.asc())
        .all()
    )


def get_active_orders_by_table(db: Session, table_ids: list[int], restaurant_id: str) -> dict[int, list[CustomerOrder]]:
    if not table_ids:
        return {}
    inactive_statuses = {"Payée", "Payee", "Livrée", "Livree", "Annulée", "Annulee", "Archivée", "Archivee"}
    orders = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.restaurant_id == restaurant_id)
        .filter(CustomerOrder.table_id.in_(table_ids))
        .filter(CustomerOrder.deleted_at.is_(None))
        .filter(~CustomerOrder.status.in_(inactive_statuses))
        .order_by(CustomerOrder.created_at.asc())
        .all()
    )
    grouped: dict[int, list[CustomerOrder]] = {}
    for order in orders:
        if order.table_id is not None:
            grouped.setdefault(order.table_id, []).append(order)
    return grouped


def serialize_table_order(order: CustomerOrder, table: TableModel, db: Session) -> TableOrderResponse:
    server = db.query(User).filter(User.id == order.server_id).first() if order.server_id else None
    return TableOrderResponse(
        id=order.id,
        order_number=order.order_number,
        table_id=table.id,
        table_name=table.number,
        server_id=order.server_id or "",
        server_name=f"{server.first_name} {server.last_name}" if server else "Serveur non assigné",
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        party_size=int(order.party_size or 1),
        status=order.status,
        total_amount=float(order.total_amount or 0),
        created_at=order.created_at.isoformat(),
    )


def serialize_table(table: TableModel, active_orders: list[CustomerOrder]) -> TableResponse:
    occupied_seats = count_occupied_seats(active_orders)
    return TableResponse(
        id=table.id,
        restaurant_id=table.restaurant_id,
        name=table.number,
        number=table.number,
        room=table.room,
        capacity=int(table.capacity or 0),
        status=table.status,
        occupied_seats=occupied_seats,
        free_seats=max(0, int(table.capacity or 0) - occupied_seats),
    )


def count_occupied_seats(active_orders: list[CustomerOrder]) -> int:
    return sum(max(1, int(order.party_size or 1)) for order in active_orders)


def make_table_order_number(table_name: str) -> str:
    clean_table = "".join(char for char in table_name.upper() if char.isalnum())[:8] or "TABLE"
    return f"{clean_table}-{utcnow().strftime('%y%m%d%H%M%S%f')[-12:]}"
