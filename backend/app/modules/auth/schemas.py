from pydantic import BaseModel, Field, validator

from app.modules.users.schemas import UserPublic
from app.security import validate_password_strength


class LoginIn(BaseModel):
    """Payload de connexion par email, username ou telephone."""

    login: str = Field(min_length=3, max_length=191)
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    """Token bearer et utilisateur connecte."""

    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class ForgotPasswordIn(BaseModel):
    """Demande de reinitialisation par email, username ou telephone."""

    login: str = Field(min_length=3, max_length=191)


class ForgotPasswordOut(BaseModel):
    """Reponse de demande de reinitialisation."""

    message: str
    reset_token: str | None = None


class ResetPasswordIn(BaseModel):
    """Payload de changement de mot de passe via token temporaire."""

    token: str = Field(min_length=20)
    password: str = Field(min_length=8, max_length=128)

    @validator("password")
    def password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)


class ChangePasswordIn(BaseModel):
    """Changement de mot de passe par l'utilisateur connecte (self-service)."""

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @validator("new_password")
    def new_password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)
