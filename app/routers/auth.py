from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, UserCreate, UserLogin, UserRead
from app.security import (
    get_current_user,
    hash_password,
    new_csrf_token,
    require_csrf,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    duplicate = db.scalar(
        select(User).where(
            (func.lower(User.email) == email) | (func.lower(User.username) == payload.username.lower())
        )
    )
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email or username already registered")
    user = User(
        username=payload.username,
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    request.session.clear()
    csrf_token = new_csrf_token()
    request.session.update({"user_id": user.id, "csrf_token": csrf_token})
    return AuthResponse(user=user, csrf_token=csrf_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, _user: User = Depends(get_current_user)):
    require_csrf(request)
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=AuthResponse)
def me(request: Request, user: User = Depends(get_current_user)):
    csrf_token = request.session.get("csrf_token")
    if not csrf_token:
        csrf_token = new_csrf_token()
        request.session["csrf_token"] = csrf_token
    return AuthResponse(user=user, csrf_token=csrf_token)