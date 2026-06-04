import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


# Configuration MySQL par variables d'environnement. DATABASE_URL reste prioritaire
# pour faciliter les tests locaux ou une future configuration Docker/CI.
MYSQL_USER = os.getenv("MYSQL_USER", "restaurant_user")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "restaurant_password")
MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "restaurant_saas")

DEFAULT_DATABASE_URL = (
    f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@"
    f"{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}?charset=utf8mb4"
)

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

# SQLite n'accepte pas les connexions partagees entre threads par defaut.
# Ce parametre n'est applique que pour les tests locaux en SQLite.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Fournit une session SQLAlchemy par requete FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
