import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.database import Base, SessionLocal, engine
import app.modules.models  # noqa: F401
from app.modules.auth import router as auth
from app.modules.branches import router as branches
from app.modules.catalog import router as catalog
from app.modules.dashboard import router as dashboard
from app.modules.finance import router as finance
from app.modules.menu import routes as menu
from app.modules.orders import router as orders
from app.modules.permissions import router as permissions
from app.modules.platform import router as platform
from app.modules.restaurants import router as restaurants
from app.modules.permissions.models import Role
from app.modules.stock import router as stock
from app.modules.users.models import User
from app.modules.users import router as users
from app.security import hash_password

# Point d'entree FastAPI: assemble le middleware CORS, la creation de tables
# en developpement et les routeurs versionnes de l'API.
app = FastAPI(title="Restaurant SaaS API")
UPLOADS_DIR = os.getenv("UPLOADS_DIR", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    """Cree les tables au demarrage tant qu'Alembic n'est pas installe."""
    Base.metadata.create_all(bind=engine)
    ensure_restaurant_settings_columns()
    ensure_menu_category_columns()
    ensure_order_columns()
    seed_superadmin()


def ensure_menu_category_columns() -> None:
    """Ajoute les champs images des categories menu tant qu'Alembic n'est pas installe."""
    existing = {column["name"] for column in inspect(engine).get_columns("menu_categories")}
    columns = {
        "image_url": "VARCHAR(500) NULL",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE menu_categories ADD COLUMN {name} {definition}"))


def ensure_restaurant_settings_columns() -> None:
    """Ajoute les champs de parametrage restaurant tant qu'Alembic n'est pas installe."""
    existing = {column["name"] for column in inspect(engine).get_columns("restaurants")}
    columns = {
        "description": "TEXT NULL",
        "address": "VARCHAR(255) NULL",
        "city": "VARCHAR(120) NULL",
        "country": "VARCHAR(120) NULL",
        "postal_box": "VARCHAR(80) NULL",
        "phone": "VARCHAR(30) NULL",
        "whatsapp_phone": "VARCHAR(30) NULL",
        "email": "VARCHAR(191) NULL",
        "opening_hours": "VARCHAR(255) NULL",
        "is_open": "BOOLEAN NOT NULL DEFAULT TRUE",
        "payment_methods": "VARCHAR(255) NULL",
        "delivery_fee": "FLOAT NOT NULL DEFAULT 0",
        "website_url": "VARCHAR(500) NULL",
        "tax_id": "VARCHAR(100) NULL",
        "legal_name": "VARCHAR(191) NULL",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE restaurants ADD COLUMN {name} {definition}"))


def ensure_order_columns() -> None:
    """Ajoute les champs commandes/encaissement tant qu'Alembic n'est pas installe."""
    inspector = inspect(engine)
    if "customer_orders" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("customer_orders")}
    columns = {
        "discount_amount": "FLOAT NOT NULL DEFAULT 0",
        "delivery_fee": "FLOAT NOT NULL DEFAULT 0",
        "cancelled_at": "DATETIME NULL",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE customer_orders ADD COLUMN {name} {definition}"))


def seed_superadmin() -> None:
    """Cree le premier compte global permettant de se connecter et creer des restaurants."""
    email = os.getenv("SUPERADMIN_EMAIL", "superadmin@restaurant.test").lower().strip()
    username = os.getenv("SUPERADMIN_USERNAME", "superadmin").lower().strip()
    password = os.getenv("SUPERADMIN_PASSWORD", "Superadmin123!")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.role == Role.SUPERADMIN).first()
        if existing:
            return

        db.add(
            User(
                email=email,
                username=username,
                password_hash=hash_password(password),
                first_name=os.getenv("SUPERADMIN_FIRST_NAME", "Super"),
                last_name=os.getenv("SUPERADMIN_LAST_NAME", "Admin"),
                role=Role.SUPERADMIN,
                restaurant_id=None,
                is_owner=False,
            )
        )
        db.commit()
    finally:
        db.close()


@app.get("/")
async def root():
    return {"message": "Restaurant SaaS API Running"}


app.include_router(auth.router, prefix="/api/v1")
app.include_router(restaurants.router, prefix="/api/v1")
app.include_router(branches.router, prefix="/api/v1")
app.include_router(catalog.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(finance.router, prefix="/api/v1")
app.include_router(menu.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(permissions.router, prefix="/api/v1")
app.include_router(platform.router, prefix="/api/v1")
app.include_router(stock.router, prefix="/api/v1")
