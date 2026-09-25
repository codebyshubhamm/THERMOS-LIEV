"""THERMOS FastAPI entrypoint: graceful startup/shutdown, scheduler optional, security hardened."""
from __future__ import annotations

from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import (
    alerts,
    analytics,
    demo,
    events,
    fires,
    health,
    internal,
    investigator,
    legacy,
    prediction,
    review,
    system,
)
from app.core.config import get_settings
from app.core.logging import get_logger, setup_logging
from app.db.database import Base, engine

log = get_logger("main")
scheduler: BackgroundScheduler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global scheduler
    s = get_settings()
    setup_logging(s.LOG_LEVEL)
    log.info("Starting %s %s env=%s", s.APP_NAME, s.APP_VERSION, s.ENVIRONMENT)
    # 2-3. connect + verify DB (create tables if needed; Alembic used for prod migrations)
    Base.metadata.create_all(bind=engine)
    log.info("Database ready (postgres=%s)", s.is_postgres)
    # 4. load ML model once
    try:
        from app.ml import model_loader
        model_loader.load_artifacts()
        log.info("ML model loaded")
    except Exception as e:  # noqa: BLE001
        log.error("ML model failed to load: %s (API still starts, /predict will 503)", e)
    # 6. optional scheduler
    if s.ENABLE_SCHEDULER and s.active_firms_key:
        try:
            from app.workers.firms_ingestion import poll_once
            scheduler = BackgroundScheduler()
            scheduler.add_job(poll_once, "interval", minutes=s.FIRMS_POLL_INTERVAL_MIN,
                              kwargs={"data_mode": "live"})
            scheduler.start()
            log.info("FIRMS scheduler started every %s min", s.FIRMS_POLL_INTERVAL_MIN)
        except Exception as e:  # noqa: BLE001
            log.warning("Scheduler failed to start: %s", e)
    else:
        log.info("Scheduler disabled (ENABLE_SCHEDULER=%s, active_firms_key_configured=%s)",
                 s.ENABLE_SCHEDULER, bool(s.active_firms_key))
    yield
    # 84. graceful shutdown
    if scheduler:
        scheduler.shutdown(wait=False)
    engine.dispose()
    log.info("Shutdown complete")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=s.APP_NAME, version=s.APP_VERSION, lifespan=lifespan)

    # 1. CORS with explicit allowlist (rejects wildcard in production)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # 2. Production Security Headers Middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):  # noqa: ANN001, ANN202
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        if s.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
        return response

    # 3. Global Exception Handler: masks internal details from client responses
    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):  # noqa: ANN001, ANN202
        log.exception("Unhandled error on %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An internal server error occurred.",
                    "details": {},
                }
            },
        )

    for r in (
        health.router,
        fires.router,
        events.router,
        prediction.router,
        analytics.router,
        alerts.router,
        investigator.router,
        review.router,
        system.router,
        demo.router,
        legacy.router,
        internal.router,
    ):
        app.include_router(r, prefix="/api")

    try:
        from ai.api_router import router as ai_router
        app.include_router(ai_router, prefix="/api")
    except Exception as e:
        log.warning("Optional ai_router not loaded: %s", e)

    return app


app = create_app()
