import asyncio
from contextlib import suppress
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
from app.modules.notifications import router as notifications
from app.modules.orders import router as orders
from app.modules.permissions import router as permissions
from app.modules.platform import router as platform
from app.modules.restaurants import router as restaurants
from app.modules.permissions.models import Role
from app.modules.branches.models import Branch
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.restaurants.models import Restaurant
from app.modules.stock import router as stock
from app.modules.users.models import User
from app.modules.users import router as users
from app.security import hash_password
from app.modules.kitchen.router import router as kitchen_router
from app.modules.payments import router as payments
from app.modules.payments.service import reconciliation_loop

# Point d'entree FastAPI: assemble le middleware CORS, la creation de tables
# en developpement et les routeurs versionnes de l'API.
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() in {"production", "prod"}

# En production, la documentation interactive et le schema OpenAPI sont coupes
# pour ne pas exposer la cartographie complete de l'API.
app = FastAPI(
    title="Restaurant SaaS API",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)
UPLOADS_DIR = os.getenv("UPLOADS_DIR", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.include_router(tables_router)
app.include_router(kitchen_router)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,"
    "http://localhost:5178,"
    "http://127.0.0.1:5173,"
    "http://127.0.0.1:5178"
)
DEFAULT_DEV_CORS_REGEX = r"https?://([a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(:[0-9]+)?"


def get_cors_origins() -> list[str]:
    """Lit les origines frontend autorisees depuis CORS_ALLOWED_ORIGINS."""
    raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def get_cors_origin_regex() -> str | None:
    """Autorise les hotes locaux/IP en developpement sans casser la prod."""
    configured = os.getenv("CORS_ALLOW_ORIGIN_REGEX")
    if configured:
        return configured
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment in {"production", "prod"}:
        return None
    return DEFAULT_DEV_CORS_REGEX


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=get_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    """Ajoute les en-tetes de securite de base sur chaque reponse."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-XSS-Protection", "0")
    if IS_PRODUCTION:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response


@app.on_event("startup")
def create_tables() -> None:
    """Cree les tables au demarrage tant qu'Alembic n'est pas installe."""
    Base.metadata.create_all(bind=engine)
    ensure_restaurant_settings_columns()
    ensure_table_columns()
    ensure_menu_category_columns()
    ensure_menu_item_columns()
    ensure_order_columns()
    ensure_stock_columns()
    ensure_finance_columns()
    ensure_user_columns()
    ensure_payment_transactions_table()
    ensure_performance_indexes()
    ensure_french_status_values()
    seed_superadmin()
    seed_demo_restaurant()


@app.on_event("startup")
async def start_payment_reconciliation() -> None:
    app.state.payment_reconciliation_task = asyncio.create_task(reconciliation_loop())


@app.on_event("shutdown")
async def stop_payment_reconciliation() -> None:
    task = getattr(app.state, "payment_reconciliation_task", None)
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


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


def ensure_table_columns() -> None:
    """Ajoute les champs d'archivage des tables restaurant."""
    inspector = inspect(engine)
    if "restaurant_tables" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("restaurant_tables")}
    columns = {
        "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
        "room": "VARCHAR(80) NOT NULL DEFAULT 'Rez-de-chaussée'",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE restaurant_tables ADD COLUMN {name} {definition}"))


def ensure_menu_item_columns() -> None:
    """Ajoute les champs de classification caisse sur la carte vendable."""
    inspector = inspect(engine)
    if "menu_items" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("menu_items")}
    columns = {
        "sale_channel": "VARCHAR(20) NOT NULL DEFAULT 'REPAS'",
        "cost_per_dish": "FLOAT NOT NULL DEFAULT 0",
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
        "nui": "VARCHAR(100) NULL",
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
        "cashier_id": "VARCHAR(36) NULL",
        "party_size": "INTEGER NOT NULL DEFAULT 1",
        "payment_status": "VARCHAR(40) NOT NULL DEFAULT 'En attente'",
        "transaction_id": "VARCHAR(100) NULL",
        "payment_locked": "BOOLEAN NOT NULL DEFAULT FALSE",
        "payment_previous_status": "VARCHAR(40) NULL",
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
        "stock_item_id": "VARCHAR(36) NULL",
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
        "cmup_current": "FLOAT NOT NULL DEFAULT 0",
        "packaging_sale_price": "FLOAT NOT NULL DEFAULT 0",
        "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
        "sale_margin_rate": "FLOAT NOT NULL DEFAULT 0",
        "created_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "updated_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if missing:
        with engine.begin() as connection:
            for name, definition in missing:
                connection.execute(text(f"ALTER TABLE stock_items ADD COLUMN {name} {definition}"))
            connection.execute(text("UPDATE stock_items SET cmup_current = purchase_price WHERE cmup_current = 0"))

    if engine.dialect.name == "mysql":
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE stock_items MODIFY COLUMN product_type VARCHAR(30) NOT NULL DEFAULT 'INGREDIENT'"))

    if "stock_movements" in inspector.get_table_names():
        existing_movements = {column["name"] for column in inspector.get_columns("stock_movements")}
        movement_columns = {
            "cost_center_id": "VARCHAR(36) NULL",
            "lot_id": "VARCHAR(36) NULL",
            "value": "FLOAT NOT NULL DEFAULT 0",
            "valuation_delta": "FLOAT NOT NULL DEFAULT 0",
            "reference": "VARCHAR(120) NULL",
        }
        missing_movement = [(name, definition) for name, definition in movement_columns.items() if name not in existing_movements]
        if missing_movement:
            with engine.begin() as connection:
                for name, definition in missing_movement:
                    connection.execute(text(f"ALTER TABLE stock_movements ADD COLUMN {name} {definition}"))

    if "stock_damages" in inspector.get_table_names():
        existing_damages = {column["name"] for column in inspector.get_columns("stock_damages")}
        damage_columns = {
            "cost_center_id": "VARCHAR(36) NULL",
            "lot_id": "VARCHAR(36) NULL",
            "cmup_applied": "FLOAT NOT NULL DEFAULT 0",
            "created_by_id": "VARCHAR(36) NULL",
        }
        missing_damage = [(name, definition) for name, definition in damage_columns.items() if name not in existing_damages]
        if missing_damage:
            with engine.begin() as connection:
                for name, definition in missing_damage:
                    connection.execute(text(f"ALTER TABLE stock_damages ADD COLUMN {name} {definition}"))

    if "stock_recipe_ingredients" in inspector.get_table_names():
        existing_recipe = {column["name"] for column in inspector.get_columns("stock_recipe_ingredients")}
        if "is_active" not in existing_recipe:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE stock_recipe_ingredients ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))


def ensure_finance_columns() -> None:
    """Ajoute les champs d'archivage finance sans attendre Alembic."""
    inspector = inspect(engine)
    if "restaurant_expenses" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("restaurant_expenses")}
    columns = {
        "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    if not missing:
        return

    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE restaurant_expenses ADD COLUMN {name} {definition}"))


def ensure_payment_transactions_table() -> None:
    """Cree et complete la table des transactions Mobile Money."""
    from app.modules.payments.models import PaymentTransaction  # noqa: F401
    Base.metadata.create_all(bind=engine, tables=[PaymentTransaction.__table__])
    inspector = inspect(engine)
    existing = {column["name"] for column in inspector.get_columns("payment_transactions")}
    columns = {
        "active_order_key": "VARCHAR(36) NULL",
        "aggregator_fee": "FLOAT NULL",
        "bloomar_commission": "FLOAT NULL",
        "restaurant_net": "FLOAT NULL",
        "raw_webhook": "TEXT NULL",
        "webhook_received_at": "DATETIME NULL",
        "completed_at": "DATETIME NULL",
        "last_reconciled_at": "DATETIME NULL",
        "reconciliation_status": "VARCHAR(30) NULL",
    }
    missing = [(name, definition) for name, definition in columns.items() if name not in existing]
    with engine.begin() as connection:
        for name, definition in missing:
            connection.execute(text(f"ALTER TABLE payment_transactions ADD COLUMN {name} {definition}"))

    indexes = {index["name"] for index in inspect(engine).get_indexes("payment_transactions")}
    constraints = {
        constraint.get("name")
        for constraint in inspect(engine).get_unique_constraints("payment_transactions")
    }
    if "uq_payment_active_order" not in indexes | constraints:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX uq_payment_active_order "
                    "ON payment_transactions (active_order_key)"
                )
            )


def ensure_user_columns() -> None:
    """Assouplit les champs utilisateur recents sans attendre Alembic."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("users")}
    if "token_version" not in existing:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
            )

    if engine.dialect.name != "mysql":
        return

    email_column = next(
        (column for column in inspector.get_columns("users") if column["name"] == "email"),
        None,
    )
    if email_column and not email_column.get("nullable", True):
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users MODIFY COLUMN email VARCHAR(191) NULL"))


def ensure_performance_indexes() -> None:
    """Ajoute les index composites utiles aux vues temps reel et rapports."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    index_specs = {
        "customer_orders": [
            ("idx_orders_restaurant_created", ("restaurant_id", "created_at")),
            ("idx_orders_restaurant_updated", ("restaurant_id", "updated_at")),
            ("idx_orders_restaurant_status", ("restaurant_id", "status")),
            ("idx_orders_restaurant_table_status", ("restaurant_id", "table_id", "status")),
        ],
        "customer_order_items": [
            ("idx_order_items_menu_order", ("menu_item_id", "order_id")),
        ],
        "restaurant_tables": [
            ("idx_tables_restaurant_number", ("restaurant_id", "number")),
        ],
        "kitchen_tickets": [
            ("idx_kitchen_order_status", ("order_id", "status")),
            ("idx_kitchen_status_created", ("status", "created_at")),
        ],
        "stock_items": [
            ("idx_stock_items_restaurant_created", ("restaurant_id", "created_at")),
            ("idx_stock_items_restaurant_type", ("restaurant_id", "product_type")),
            ("idx_stock_items_restaurant_active", ("restaurant_id", "is_active")),
        ],
        "stock_movements": [
            ("idx_stock_movements_restaurant_created", ("restaurant_id", "created_at")),
            ("idx_stock_movements_restaurant_type", ("restaurant_id", "movement_type")),
            ("idx_stock_movements_item_center", ("item_id", "cost_center_id")),
            ("idx_stock_movements_lot", ("lot_id",)),
        ],
        "stock_damages": [
            ("idx_stock_damages_restaurant_created", ("restaurant_id", "created_at")),
            ("idx_stock_damages_reason", ("restaurant_id", "reason")),
            ("idx_stock_damages_center", ("cost_center_id",)),
        ],
        "stock_lots": [
            ("idx_stock_lots_item_center_fifo", ("item_id", "cost_center_id", "entry_date")),
            ("idx_stock_lots_expiration", ("restaurant_id", "expiration_date")),
            ("idx_stock_lots_available", ("restaurant_id", "available_quantity")),
        ],
        "stock_cost_centers": [
            ("idx_stock_cost_centers_restaurant_code", ("restaurant_id", "code")),
        ],
        "stock_item_packagings": [
            ("idx_stock_packaging_menu", ("restaurant_id", "menu_item_id")),
            ("idx_stock_packaging_item", ("packaging_item_id",)),
        ],
        "stock_inventories": [
            ("idx_stock_inventories_restaurant_status", ("restaurant_id", "status")),
        ],
        "stock_inventory_lines": [
            ("idx_stock_inventory_lines_inventory", ("inventory_id",)),
            ("idx_stock_inventory_lines_item_center", ("item_id", "cost_center_id")),
        ],
        "stock_recipe_ingredients": [
            ("idx_recipe_restaurant_menu", ("restaurant_id", "menu_item_id")),
        ],
        "audit_logs": [
            ("idx_audit_restaurant_created", ("restaurant_id", "created_at")),
            ("idx_audit_restaurant_action", ("restaurant_id", "action")),
        ],
        "users": [
            ("idx_users_restaurant_active", ("restaurant_id", "is_active")),
            ("idx_users_restaurant_branch", ("restaurant_id", "branch_id")),
        ],
    }

    with engine.begin() as connection:
        for table_name, indexes in index_specs.items():
            if table_name not in tables:
                continue
            existing_indexes = {index["name"] for index in inspector.get_indexes(table_name)}
            for index_name, columns in indexes:
                if index_name in existing_indexes:
                    continue
                column_sql = ", ".join(columns)
                if engine.dialect.name == "mysql":
                    connection.execute(text(f"CREATE INDEX {index_name} ON {table_name} ({column_sql})"))
                else:
                    connection.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_sql})"))


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
    environment = os.getenv("ENVIRONMENT", "development").lower()
    email = os.getenv("SUPERADMIN_EMAIL", "superadmin@restaurant.test").lower().strip()
    username = os.getenv("SUPERADMIN_USERNAME", "superadmin").lower().strip()
    password = os.getenv("SUPERADMIN_PASSWORD", "Superadmin123!")
    if environment in {"production", "prod"} and (
        email == "superadmin@restaurant.test" or username == "superadmin" or password == "Superadmin123!"
    ):
        raise RuntimeError("SUPERADMIN_* defaults are not allowed in production")

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


def seed_demo_restaurant() -> None:
    """Cree une vitrine commandable en developpement pour le slug public /main."""
    environment = os.getenv("ENVIRONMENT", "development").lower()
    should_seed = os.getenv("SEED_DEMO_RESTAURANT", "true").lower() == "true"
    if environment in {"production", "prod"} or not should_seed:
        return

    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.slug == "main").one_or_none()
        if not restaurant:
            restaurant = Restaurant(
                name="Le Bon Coin",
                slug="main",
                logo_url="/logo.jpeg",
                description="Fast-food et plats frais disponibles en livraison ou a emporter.",
                address="Avenue principale",
                city="Douala",
                country="Cameroun",
                phone="+237 6 99 99 99",
                whatsapp_phone="+237699999999",
                email="contact@leboncoin.test",
                opening_hours="Lun-Dim 09:00-22:00",
                is_open=True,
                payment_methods="Paiement a la livraison, Orange Money, MTN Mobile Money",
                delivery_fee=500,
                primary_color="#ff1f17",
                secondary_color="#05080d",
                currency="XAF",
                timezone="Africa/Douala",
            )
            db.add(restaurant)
            db.flush()

        branch = (
            db.query(Branch)
            .filter(Branch.restaurant_id == restaurant.id, Branch.name == "Siege")
            .one_or_none()
        )
        if not branch:
            branch = Branch(
                restaurant_id=restaurant.id,
                name="Siege",
                city="Douala",
                address="Avenue principale",
                phone=restaurant.phone,
            )
            db.add(branch)
            db.flush()

        owner_username = os.getenv("DEMO_ADMIN_USERNAME", "admin").lower().strip()
        owner_email = os.getenv("DEMO_ADMIN_EMAIL", "admin@leboncoin.test").lower().strip()
        owner_password = os.getenv("DEMO_ADMIN_PASSWORD", "Admin123!")
        owner = (
            db.query(User)
            .filter(User.restaurant_id == restaurant.id, User.role == Role.ADMIN, User.is_owner.is_(True))
            .first()
        )
        owner_login_exists = (
            db.query(User)
            .filter((User.username == owner_username) | (User.email == owner_email))
            .first()
        )
        if not owner and not owner_login_exists:
            owner = User(
                email=owner_email,
                username=owner_username,
                password_hash=hash_password(owner_password),
                first_name="Admin",
                last_name="Restaurant",
                phone=restaurant.phone,
                role=Role.ADMIN,
                restaurant_id=restaurant.id,
                branch_id=branch.id,
                is_owner=True,
            )
            db.add(owner)
            db.flush()
            restaurant.owner_id = owner.id
        elif owner and restaurant.owner_id != owner.id:
            restaurant.owner_id = owner.id

        existing_categories = db.query(MenuCategory).filter(MenuCategory.restaurant_id == restaurant.id).count()
        if existing_categories == 0:
            category_specs = [
                ("Burgers", "Burgers maison", "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1200&auto=format&fit=crop"),
                ("Pizzas", "Pizzas chaudes", "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=1200&auto=format&fit=crop"),
                ("Boissons", "Boissons fraiches", "https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=1000&auto=format&fit=crop"),
            ]
            categories = {}
            for name, description, image_url in category_specs:
                category = MenuCategory(
                    restaurant_id=restaurant.id,
                    name=name,
                    description=description,
                    image_url=image_url,
                    is_active=True,
                )
                db.add(category)
                db.flush()
                categories[name] = category

            dishes = [
                ("Cheese Burger", "Steak hache, fromage, salade, tomate et sauce maison.", 4500, "Burgers", "REPAS", "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1200&auto=format&fit=crop"),
                ("Pizza Margherita", "Sauce tomate, mozzarella et basilic frais.", 6500, "Pizzas", "REPAS", "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=1200&auto=format&fit=crop"),
                ("Jus naturel", "Cocktail de fruits de saison prepare a la commande.", 1500, "Boissons", "BOISSON", "https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=1000&auto=format&fit=crop"),
            ]
            for name, description, price, category_name, sale_channel, image_url in dishes:
                db.add(
                    MenuItem(
                        restaurant_id=restaurant.id,
                        category_id=categories[category_name].id,
                        name=name,
                        description=description,
                        price=price,
                        sale_channel=sale_channel,
                        image_url=image_url,
                        is_available=True,
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
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(stock.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
