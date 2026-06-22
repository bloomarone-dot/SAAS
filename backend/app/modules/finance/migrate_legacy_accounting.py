"""Migration controlee de l'ancien module finance vers la comptabilite.

Usage depuis le dossier backend:
    python -m app.modules.finance.migrate_legacy_accounting

Le script ne supprime aucune donnee historique. Il cree le plan comptable,
les journaux, la caisse par defaut et migre les anciennes lignes
`restaurant_expenses` vers `expenses` en brouillon. La validation reste une
action explicite afin de controler les ecritures comptables generees.
"""

from sqlalchemy import inspect, text

from app.database import SessionLocal
from app.modules.finance.models import Expense, ExpenseCategory, OperationStatus, PaymentStatus
from app.modules.finance.router import ensure_default_accounting, money
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User


def migrate_restaurant(db, restaurant_id: str) -> int:
    ensure_default_accounting(db, restaurant_id)
    inspector = inspect(db.bind)
    if "restaurant_expenses" not in inspector.get_table_names():
        return 0
    if db.query(Expense.id).filter(Expense.restaurant_id == restaurant_id).first():
        return 0
    categories = {
        category.name.lower(): category
        for category in db.query(ExpenseCategory).filter(ExpenseCategory.restaurant_id == restaurant_id).all()
    }
    rows = db.execute(
        text(
            """
            SELECT id, label, category, amount, reference, expense_date, created_by_id
            FROM restaurant_expenses
            WHERE restaurant_id = :restaurant_id AND is_active = TRUE
            """
        ),
        {"restaurant_id": restaurant_id},
    ).mappings().all()
    fallback_user_id = db.query(User.id).filter(User.restaurant_id == restaurant_id).order_by(User.created_at.asc()).scalar()
    if not fallback_user_id and rows:
        raise RuntimeError(f"Aucun utilisateur pour migrer les depenses du restaurant {restaurant_id}")
    migrated = 0
    for row in rows:
        category = categories.get(str(row["category"] or "Autres charges").lower())
        db.add(
            Expense(
                id=row["id"],
                restaurant_id=restaurant_id,
                expense_date=row["expense_date"],
                category_id=category.id if category else None,
                amount=money(row["amount"]),
                tax_amount=money(0),
                total_amount=money(row["amount"]),
                payment_status=PaymentStatus.PAID,
                description=row["label"],
                reference=row["reference"],
                status=OperationStatus.DRAFT,
                created_by=row["created_by_id"] or fallback_user_id,
            )
        )
        migrated += 1
    return migrated


def main() -> None:
    db = SessionLocal()
    try:
        total = 0
        for restaurant in db.query(Restaurant).all():
            total += migrate_restaurant(db, restaurant.id)
        db.commit()
        print(f"{total} anciennes depenses migrees en brouillon.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
