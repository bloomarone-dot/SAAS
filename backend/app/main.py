import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from app.modules.tables.router import router as tables_router

from app.database import Base, SessionLocal, engine
import app.modules.models  # noqa: F401
from app.modules.auth import router as auth
from app.modules.audit import router as audit
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
from app.modules.kitchen.router import router as kitchen_router

# Point d'entree FastAPI: assemble le middleware CORS, la creation de tables
# en developpement et les routeurs versionnes de l'API.
app = FastAPI(title="Restaurant SaaS API")
UPLOADS_DIR = os.getenv("UPLOADS_DIR", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.include_router(tables_router)
app.include_router(kitchen_router)

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
    ensure_menu_item_columns()
    ensure_order_columns()
    ensure_stock_columns()
    ensure_french_status_values()
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


def ensure_menu_item_columns() -> None:
    """Ajoute les champs de classification caisse sur la carte vendable."""
    inspector = inspect(engine)
    if "menu_items" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("menu_items")}
    columns = {
        "sale_channel": "VARCHAR(20) NOT NULL DEFAULT 'REPAS'",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE menu_items ADD COLUMN {name} {definition}"))


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
        "branch_id": "VARCHAR(36) NULL",
        "discount_amount": "FLOAT NOT NULL DEFAULT 0",
        "delivery_fee": "FLOAT NOT NULL DEFAULT 0",
        "cancelled_at": "DATETIME NULL",
        "table_id": "INTEGER NULL",
        "server_id": "VARCHAR(36) NULL",
        "party_size": "INTEGER NOT NULL DEFAULT 1",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if missing:
        with engine.begin() as connection:
            for name, definition in missing:
                connection.execute(text(f"ALTER TABLE customer_orders ADD COLUMN {name} {definition}"))

    if "customer_order_items" not in inspector.get_table_names():
        return
    existing_item_columns = {column["name"] for column in inspector.get_columns("customer_order_items")}
    item_columns = {
        "sale_channel": "VARCHAR(20) NOT NULL DEFAULT 'REPAS'",
    }
    missing_item_columns = [
        (name, definition)
        for name, definition in item_columns.items()
        if name not in existing_item_columns
    ]
    if not missing_item_columns:
        return
    with engine.begin() as connection:
        for name, definition in missing_item_columns:
            connection.execute(text(f"ALTER TABLE customer_order_items ADD COLUMN {name} {definition}"))
        connection.execute(
            text(
                """
                UPDATE customer_order_items coi
                JOIN menu_items mi ON mi.id = coi.menu_item_id
                SET coi.sale_channel = COALESCE(mi.sale_channel, 'REPAS')
                """
            )
        )


def ensure_stock_columns() -> None:
    """Ajoute les champs stock recents sans attendre une migration Alembic."""
    inspector = inspect(engine)
    if "stock_items" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("stock_items")}
    columns = {
        "product_type": "VARCHAR(30) NOT NULL DEFAULT 'INGREDIENT'",
        "unit": "VARCHAR(30) NOT NULL DEFAULT 'Unité'",
        "quantity": "FLOAT NOT NULL DEFAULT 0",
        "kitchen_quantity": "FLOAT NOT NULL DEFAULT 0",
        "drink_quantity": "FLOAT NOT NULL DEFAULT 0",
        "alert_threshold": "FLOAT NOT NULL DEFAULT 0",
        "purchase_price": "FLOAT NOT NULL DEFAULT 0",
        "sale_margin_rate": "FLOAT NOT NULL DEFAULT 0",
        "created_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "updated_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE stock_items ADD COLUMN {name} {definition}"))


def ensure_french_status_values() -> None:
    """Migre les anciens statuts techniques tables/cuisine vers des valeurs francaises."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    is_mysql = engine.dialect.name == "mysql"

    with engine.begin() as connection:
        if "restaurant_tables" in tables:
            table_status_needs_enum_update = (
                is_mysql and "Libre" not in read_mysql_column_type(connection, "restaurant_tables", "status")
            )
            if table_status_needs_enum_update:
                connection.execute(text("ALTER TABLE restaurant_tables MODIFY COLUMN status VARCHAR(40) NOT NULL"))
            connection.execute(
                text(
                    """
                    UPDATE restaurant_tables
                    SET status = CASE status
                        WHEN 'FREE' THEN 'Libre'
                        WHEN 'OCCUPIED' THEN 'Occupée'
                        WHEN 'RESERVED' THEN 'Réservée'
                        ELSE status
                    END
                    """
                )
            )
            if table_status_needs_enum_update:
                connection.execute(
                    text(
                        "ALTER TABLE restaurant_tables "
                        "MODIFY COLUMN status ENUM('Libre','Occupée','Réservée') NOT NULL DEFAULT 'Libre'"
                    )
                )

        if "kitchen_tickets" in tables:
            kitchen_status_needs_enum_update = (
                is_mysql and "En attente" not in read_mysql_column_type(connection, "kitchen_tickets", "status")
            )
            if kitchen_status_needs_enum_update:
                connection.execute(text("ALTER TABLE kitchen_tickets MODIFY COLUMN status VARCHAR(40) NOT NULL"))
            connection.execute(
                text(
                    """
                    UPDATE kitchen_tickets
                    SET status = CASE status
                        WHEN 'PENDING' THEN 'En attente'
                        WHEN 'COOKING' THEN 'En préparation'
                        WHEN 'READY' THEN 'Prête'
                        WHEN 'SERVED' THEN 'Servie'
                        ELSE status
                    END
                    """
                )
            )
            if kitchen_status_needs_enum_update:
                connection.execute(
                    text(
                        "ALTER TABLE kitchen_tickets "
                        "MODIFY COLUMN status ENUM('En attente','En préparation','Prête','Servie') "
                        "NOT NULL DEFAULT 'En attente'"
                    )
                )


def read_mysql_column_type(connection, table_name: str, column_name: str) -> str:
    """Retourne la definition d'une colonne MySQL pour limiter les ALTER repetes."""
    row = connection.execute(text(f"SHOW COLUMNS FROM {table_name} LIKE '{column_name}'")).mappings().first()
    return str(row["Type"]) if row else ""


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
app.include_router(audit.router, prefix="/api/v1")
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
