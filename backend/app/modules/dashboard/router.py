from sqlalchemy import MetaData, Table, func, inspect, select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.branches.models import Branch
from app.modules.dashboard.schemas import AdminDashboardSummaryOut
from app.modules.permissions.models import Permission
from app.modules.users.models import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ORDER_TABLE_CANDIDATES = ("orders", "commandes", "restaurant_orders", "sales")
REVENUE_COLUMN_CANDIDATES = (
    "total_amount",
    "total",
    "amount",
    "grand_total",
    "net_amount",
    "paid_amount",
)


def read_orders_and_revenue(db: Session, restaurant_id: str) -> tuple[int, float]:
    """Lit les commandes si un module ventes existe deja, sinon retourne zero.

    Le projet n'a pas encore de module commandes persistant. Cette fonction rend
    le dashboard compatible avec une future table de ventes sans afficher de
    fausses donnees en attendant.
    """
    inspector = inspect(db.bind)
    existing_tables = set(inspector.get_table_names())
    table_name = next((name for name in ORDER_TABLE_CANDIDATES if name in existing_tables), None)
    if not table_name:
        return 0, 0.0

    metadata = MetaData()
    table = Table(table_name, metadata, autoload_with=db.bind)
    if "restaurant_id" not in table.c:
        return 0, 0.0

    filters = [table.c.restaurant_id == restaurant_id]
    orders_count = db.execute(select(func.count()).select_from(table).where(*filters)).scalar() or 0

    revenue_column_name = next((name for name in REVENUE_COLUMN_CANDIDATES if name in table.c), None)
    if not revenue_column_name:
        return int(orders_count), 0.0

    revenue = (
        db.execute(select(func.coalesce(func.sum(table.c[revenue_column_name]), 0)).where(*filters)).scalar()
        or 0
    )
    return int(orders_count), float(revenue)


@router.get("/admin-summary", response_model=AdminDashboardSummaryOut)
def admin_summary(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    restaurant_id = current_user.restaurant_id
    orders_count, revenue = read_orders_and_revenue(db, restaurant_id)
    active_branches = (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id)
        .filter(Branch.is_active.is_(True))
        .count()
    )
    users_query = db.query(User).filter(User.restaurant_id == restaurant_id)

    return AdminDashboardSummaryOut(
        revenue=revenue,
        orders_count=orders_count,
        restaurants_count=max(1, active_branches),
        users_count=users_query.count(),
        active_users_count=users_query.filter(User.is_active.is_(True)).count(),
    )
