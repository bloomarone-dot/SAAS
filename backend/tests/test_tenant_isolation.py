"""Test d'intégration de l'isolation multi-tenant via `tenant_get_or_404`.

Utilise une base SQLite en mémoire (pas de dépendance à MySQL ni au startup de
l'app). Vérifie qu'une entité d'un autre tenant n'est jamais accessible.
"""
import unittest

from fastapi import HTTPException
from sqlalchemy import Column, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.tenancy import tenant_get_or_404

Base = declarative_base()


class Widget(Base):
    __tablename__ = "widgets"
    id = Column(String(36), primary_key=True)
    restaurant_id = Column(String(36), nullable=False)


class TenantIsolationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        session = self.Session()
        session.add_all(
            [
                Widget(id="w1", restaurant_id="resto-A"),
                Widget(id="w2", restaurant_id="resto-B"),
            ]
        )
        session.commit()
        session.close()

    def test_same_tenant_returns_object(self):
        session = self.Session()
        obj = tenant_get_or_404(session, Widget, "w1", "resto-A")
        self.assertEqual(obj.id, "w1")
        session.close()

    def test_cross_tenant_access_is_404(self):
        # w1 appartient à resto-A : un utilisateur de resto-B ne doit pas y accéder.
        session = self.Session()
        with self.assertRaises(HTTPException) as ctx:
            tenant_get_or_404(session, Widget, "w1", "resto-B")
        self.assertEqual(ctx.exception.status_code, 404)
        session.close()

    def test_missing_entity_is_404(self):
        session = self.Session()
        with self.assertRaises(HTTPException) as ctx:
            tenant_get_or_404(session, Widget, "inconnu", "resto-A")
        self.assertEqual(ctx.exception.status_code, 404)
        session.close()


if __name__ == "__main__":
    unittest.main()
