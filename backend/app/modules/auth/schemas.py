from pydantic import BaseModel, Field

from app.modules.users.schemas import UserPublic


class LoginIn(BaseModel):
    """Payload de connexion par email ou username."""

    login: str = Field(min_length=3, max_length=191)
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    """Token bearer et utilisateur connecte."""

    access_token: str
    token_type: str = "bearer"
    user: UserPublic

