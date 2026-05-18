"""Registre central des modeles SQLAlchemy.

Ce module force l'import des modeles de chaque domaine avant la creation des
tables ou le lancement des migrations.
"""

from app.modules.branches.models import Branch
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User, UserPermission

__all__ = ["Branch", "Restaurant", "User", "UserPermission"]

