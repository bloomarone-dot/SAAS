from datetime import datetime
from app.modules.shared.models import utcnow

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.dependencies import assert_permission, has_permission, require_tenant_user
from app.modules.notifications.service import notify
from app.modules.orders.models import CustomerOrder
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User
from .models import KitchenTicketModel, KitchenStatus
from .schemas import KitchenTicketCreate, KitchenTicketUpdateStatus, KitchenTicketResponse

router = APIRouter(
    prefix="/kitchen",
    tags=["Kitchen / Cuisine"]
)

# 1. ENVOYER UN PLAT EN CUISINE (Appelé automatiquement quand le POS valide une commande)
@router.post("/ticket", response_model=KitchenTicketResponse, status_code=status.HTTP_201_CREATED)
def create_kitchen_ticket(
    obj_in: KitchenTicketCreate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_kitchen_create_allowed(current_user)
    order = get_order_for_user(db, obj_in.order_id, current_user)
    db_ticket = KitchenTicketModel(
        order_id=order.id,
        table_number=obj_in.table_number,
        item_name=obj_in.item_name,
        quantity=obj_in.quantity,
        notes=obj_in.notes,
        status=KitchenStatus.EN_ATTENTE
    )
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

# 2. RÉCUPÉRER TOUS LES TICKETS ACTIFS (Pour l'écran des cuisiniers)
# On exclut les plats déjà servis pour ne pas encombrer l'écran
@router.get("/tickets/active", response_model=List[KitchenTicketResponse])
def get_active_kitchen_tickets(
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_kitchen_read_allowed(current_user)
    tickets = (
        db.query(KitchenTicketModel)
        .join(CustomerOrder, CustomerOrder.id == KitchenTicketModel.order_id)
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
        .filter(KitchenTicketModel.status != KitchenStatus.SERVIE)
        .order_by(KitchenTicketModel.created_at.asc())
        .all()
    )
    return tickets

# 3. METTRE À JOUR LE STATUT D'UN PLAT (En attente -> En préparation -> Prête -> Servie)
@router.patch("/ticket/{ticket_id}/status", response_model=KitchenTicketResponse)
def update_ticket_status(
    ticket_id: int,
    obj_in: KitchenTicketUpdateStatus,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_kitchen_update_allowed(current_user)
    db_ticket = (
        db.query(KitchenTicketModel)
        .join(CustomerOrder, CustomerOrder.id == KitchenTicketModel.order_id)
        .filter(KitchenTicketModel.id == ticket_id)
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
        .first()
    )
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket de cuisine introuvable.")

    db_ticket.status = obj_in.status
    sync_order_status_from_tickets(db, db_ticket.order_id)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket


@router.get("/stats/month")
def kitchen_month_stats(
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_kitchen_read_allowed(current_user)
    now = utcnow()
    month_start = datetime(now.year, now.month, 1)
    base = (
        db.query(KitchenTicketModel)
        .join(CustomerOrder, CustomerOrder.id == KitchenTicketModel.order_id)
        .filter(
            CustomerOrder.restaurant_id == current_user.restaurant_id,
            KitchenTicketModel.created_at >= month_start,
            KitchenTicketModel.status != KitchenStatus.EN_ATTENTE,
        )
    )
    total_dishes = (
        db.query(func.coalesce(func.sum(KitchenTicketModel.quantity), 0))
        .select_from(KitchenTicketModel)
        .join(CustomerOrder, CustomerOrder.id == KitchenTicketModel.order_id)
        .filter(
            CustomerOrder.restaurant_id == current_user.restaurant_id,
            KitchenTicketModel.created_at >= month_start,
            KitchenTicketModel.status != KitchenStatus.EN_ATTENTE,
        )
        .scalar()
    )
    rows = (
        base.with_entities(
            KitchenTicketModel.item_name,
            func.sum(KitchenTicketModel.quantity).label("quantity"),
        )
        .group_by(KitchenTicketModel.item_name)
        .order_by(func.sum(KitchenTicketModel.quantity).desc())
        .limit(12)
        .all()
    )
    return {
        "month": month_start.strftime("%Y-%m"),
        "total_dishes": int(total_dishes or 0),
        "top_items": [{"name": name, "quantity": int(qty or 0)} for name, qty in rows],
    }


def get_order_for_user(db: Session, order_id: str, user: User) -> CustomerOrder:
    order = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.id == order_id, CustomerOrder.restaurant_id == user.restaurant_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return order


def assert_kitchen_read_allowed(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER}:
        return
    assert_permission(user, Permission.KITCHEN_READ)


def assert_kitchen_update_allowed(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER}:
        return
    assert_permission(user, Permission.KITCHEN_UPDATE)


def assert_kitchen_create_allowed(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER}:
        return
    if has_permission(user, Permission.SERVICE_UPDATE) or has_permission(user, Permission.KITCHEN_UPDATE):
        return
    raise HTTPException(status_code=403, detail="Permission cuisine ou service requise")


def sync_order_status_from_tickets(db: Session, order_id: str) -> None:
    order = db.get(CustomerOrder, order_id)
    if not order or order.status in {"Payée", "Payee", "Annulée"}:
        return
    tickets = db.query(KitchenTicketModel).filter(KitchenTicketModel.order_id == order_id).all()
    if not tickets:
        return
    previous_status = order.status
    statuses = {ticket.status for ticket in tickets}
    if statuses == {KitchenStatus.SERVIE}:
        order.status = "Livrée"
    elif statuses.issubset({KitchenStatus.PRETE, KitchenStatus.SERVIE}):
        order.status = "Prête"
    elif KitchenStatus.EN_PREPARATION in statuses:
        order.status = "En préparation"
    else:
        return

    if order.status == previous_status:
        return

    if order.status == "Prête":
        notify(
            db,
            restaurant_id=order.restaurant_id,
            role=Role.SERVEUR.value,
            title="Commande prête en cuisine",
            message=f"{order.order_number} est prête. Récupérez les plats et servez le client.",
            category="kitchen",
            link="dashboard",
        )
    elif order.status == "Livrée" and previous_status != "Livrée":
        notify(
            db,
            restaurant_id=order.restaurant_id,
            role=Role.SERVEUR.value,
            title="Commande servie en cuisine",
            message=f"{order.order_number} : tous les plats sont prêts. Vous pouvez demander le paiement.",
            category="order",
            link="dashboard",
        )


def mark_order_kitchen_tickets_served(db: Session, order_id: str) -> int:
    """Marque tous les tickets cuisine d'une commande comme servis (sync serveur -> cuisine)."""
    tickets = (
        db.query(KitchenTicketModel)
        .filter(
            KitchenTicketModel.order_id == order_id,
            KitchenTicketModel.status != KitchenStatus.SERVIE,
        )
        .all()
    )
    for ticket in tickets:
        ticket.status = KitchenStatus.SERVIE
    return len(tickets)
