from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from .models import TableModel, TableStatus
from .schemas import TableCreate, TableUpdate, TableResponse

router = APIRouter(
    prefix="/api/tables",
    tags=["Tables"]
)

# 1. CRÉER UNE TABLE
@router.post("", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
def create_table(restaurant_id: int, obj_in: TableCreate, db: Session = Depends(get_db)):
    # Vérifier si le numéro de table existe déjà pour ce restaurant
    existing_table = db.query(TableModel).filter(
        TableModel.restaurant_id == restaurant_id,
        TableModel.number == obj_in.number
    ).first()
    
    if existing_table:
        raise HTTPException(
            status_code=400, 
            detail=f"La table {obj_in.number} existe déjà dans ce restaurant."
        )

    db_table = TableModel(
        restaurant_id=restaurant_id,
        number=obj_in.number,
        capacity=obj_in.capacity,
        status=TableStatus.FREE
    )
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return db_table

# 2. LISTER LES TABLES D'UN RESTAURANT
@router.get("/restaurant/{restaurant_id}", response_model=List[TableResponse])
def get_restaurant_tables(restaurant_id: int, db: Session = Depends(get_db)):
    tables = db.query(TableModel).filter(TableModel.restaurant_id == restaurant_id).all()
    return tables

# 3. MODIFIER UNE TABLE (Changer le statut : FREE -> OCCUPIED)
@router.patch("/{table_id}", response_model=TableResponse)
def update_table_status(table_id: int, obj_in: TableUpdate, db: Session = Depends(get_db)):
    db_table = db.query(TableModel).filter(TableModel.id == table_id).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table introuvable.")

    # Mettre à jour uniquement les champs envoyés
    update_data = obj_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_table, field, value)

    db.commit()
    db.refresh(db_table)
    return db_table

# 4. SUPPRIMER UNE TABLE
@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(table_id: int, db: Session = Depends(get_db)):
    db_table = db.query(TableModel).filter(TableModel.id == table_id).first()
    if not db_table:
        raise HTTPException(status_code=404, detail="Table introuvable.")
    
    db.delete(db_table)
    db.commit()
    return None