from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from .models import KitchenTicketModel, KitchenStatus
from .schemas import KitchenTicketCreate, KitchenTicketUpdateStatus, KitchenTicketResponse

router = APIRouter(
    prefix="/kitchen",
    tags=["Kitchen / Cuisine"]
)

# 1. ENVOYER UN PLAT EN CUISINE (Appelé automatiquement quand le POS valide une commande)
@router.post("/ticket", response_model=KitchenTicketResponse, status_code=status.HTTP_201_CREATED)
def create_kitchen_ticket(obj_in: KitchenTicketCreate, db: Session = Depends(get_db)):
    db_ticket = KitchenTicketModel(
        order_id=obj_in.order_id,
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
def get_active_kitchen_tickets(db: Session = Depends(get_db)):
    tickets = db.query(KitchenTicketModel).filter(
        KitchenTicketModel.status != KitchenStatus.SERVIE
    ).order_by(KitchenTicketModel.created_at.asc()).all()
    return tickets

# 3. METTRE À JOUR LE STATUT D'UN PLAT (En attente -> En préparation -> Prête -> Servie)
@router.patch("/ticket/{ticket_id}/status", response_model=KitchenTicketResponse)
def update_ticket_status(ticket_id: int, obj_in: KitchenTicketUpdateStatus, db: Session = Depends(get_db)):
    db_ticket = db.query(KitchenTicketModel).filter(KitchenTicketModel.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket de cuisine introuvable.")

    db_ticket.status = obj_in.status
    db.commit()
    db.refresh(db_ticket)
    return db_ticket
