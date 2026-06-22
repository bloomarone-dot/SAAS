"""Migration controlee de l'ancien stock vers le modele par mouvements.

Usage depuis la racine backend:
    python -m app.modules.stock.migrate_legacy_stock

Le script ne supprime aucune table historique. Il copie les anciens
`stock_items` vers `products` avec les memes ids, puis cree des mouvements
ENTRY valides dans les depots par defaut. Les anciennes quantites sans depot
precis sont envoyees vers Magasin principal.
"""

from app.database import SessionLocal
from app.modules.restaurants.models import Restaurant
from app.modules.stock.router import ensure_default_data


def main() -> None:
    db = SessionLocal()
    try:
        for restaurant in db.query(Restaurant).all():
            ensure_default_data(db, restaurant.id)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
