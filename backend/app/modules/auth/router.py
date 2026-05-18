from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.schemas import LoginIn, TokenOut
from app.modules.users.models import User
from app.modules.users.schemas import UserPublic
from app.security import create_access_token, verify_password


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    """Authentifie par email ou username et retourne un bearer token."""
    login_value = payload.login.lower().strip()
    user = (
        db.query(User)
        .filter(or_(User.email == login_value, User.username == login_value))
        .one_or_none()
    )

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte desactive")

    return TokenOut(access_token=create_access_token(user.id), user=user)


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    """Retourne le profil et les permissions de l'utilisateur connecte."""
    return current_user
