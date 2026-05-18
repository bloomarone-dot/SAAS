import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine
import app.modules.models  # noqa: F401
from app.modules.auth import router as auth
from app.modules.branches import router as branches
from app.modules.restaurants import router as restaurants
from app.modules.shared.models import Role
from app.modules.users.models import User
from app.modules.users import router as users
from app.security import hash_password

# Point d'entree FastAPI: assemble le middleware CORS, la creation de tables
# en developpement et les routeurs versionnes de l'API.
app = FastAPI(title="Restaurant SaaS API")

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
    seed_superadmin()


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
app.include_router(users.router, prefix="/api/v1")
