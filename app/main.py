import os
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker
from starlette.middleware.sessions import SessionMiddleware

from app.database import Base, build_engine
from app.routers import auth, dashboard, projects, tasks

load_dotenv()

TEMPLATE_DIR = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"


def create_app(engine: Engine | None = None) -> FastAPI:
    database_engine = engine or build_engine()
    session_factory = sessionmaker(bind=database_engine, autoflush=False, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        Base.metadata.create_all(bind=database_engine)
        yield

    application = FastAPI(title="TaskFlow API", version="1.0.0", lifespan=lifespan)
    application.state.session_factory = session_factory
    application.add_middleware(
        SessionMiddleware,
        secret_key=os.getenv("TASKFLOW_SESSION_SECRET") or secrets.token_urlsafe(32),
        session_cookie="taskflow_session",
        same_site="lax",
        https_only=os.getenv("TASKFLOW_HTTPS_ONLY", "false").lower() == "true",
    )

    @application.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        content_security_policy = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' "
            "https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
            "base-uri 'self'; form-action 'self'"
        )
        if request.url.path in {"/docs", "/redoc"}:
            content_security_policy = (
                "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
                "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
                "img-src 'self' data: https://fastapi.tiangolo.com; connect-src 'self'; "
                "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            )
        response.headers["Content-Security-Policy"] = content_security_policy
        return response

    application.include_router(auth.router)
    application.include_router(projects.router)
    application.include_router(tasks.router)
    application.include_router(dashboard.router)
    application.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")

    pages = {
        "/": "dashboard.html",
        "/login": "login.html",
        "/register": "register.html",
        "/projects": "projects.html",
        "/project": "project.html",
        "/tasks": "tasks.html",
        "/profile": "profile.html",
    }
    for path, filename in pages.items():
        def serve_page(page_filename=filename):
            return FileResponse(TEMPLATE_DIR / page_filename)

        application.add_api_route(
            path, serve_page, methods=["GET"], include_in_schema=False
        )
    return application


app = create_app()
application = app