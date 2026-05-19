from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.permissions.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role
from app.modules.shared.models import new_id


class User(Base):
    """Compte utilisateur rattache a un restaurant et optionnellement a une branche."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(191), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    role: Mapped[Role] = mapped_column(Enum(Role), nullable=False)
    restaurant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True)
    branch_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("branches.id"), index=True)
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    restaurant = relationship("Restaurant", back_populates="users", foreign_keys=[restaurant_id])
    branch = relationship("Branch", back_populates="users")
    created_by = relationship("User", remote_side=[id], foreign_keys=[created_by_id])
    permission_grants = relationship(
        "UserPermission",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserPermission.user_id",
    )

    @property
    def permissions(self) -> list[Permission]:
        """Retourne les droits effectifs: role, owner et permissions accordees."""
        if self.role == Role.SUPERADMIN or self.is_owner:
            return sorted(Permission, key=lambda permission: permission.value)

        granted = {grant.permission for grant in self.permission_grants}
        granted.update(ROLE_DEFAULT_PERMISSIONS.get(self.role, set()))
        return sorted(granted, key=lambda permission: permission.value)

    @property
    def explicit_permissions(self) -> list[Permission]:
        """Retourne uniquement les droits accordes directement a l'utilisateur."""
        return sorted(
            {grant.permission for grant in self.permission_grants},
            key=lambda permission: permission.value,
        )


class UserPermission(Base):
    """Permission explicite accordee a un utilisateur du restaurant."""

    __tablename__ = "user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "permission", name="uq_user_permission"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    permission: Mapped[Permission] = mapped_column(Enum(Permission), nullable=False)
    granted_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="permission_grants", foreign_keys=[user_id])
    granted_by = relationship("User", foreign_keys=[granted_by_id])
