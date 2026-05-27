from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import factories, reports, ws

app = FastAPI(title="Aegis Dashboard Backend", version="0.1.0")
settings = get_settings()
cors_allow_origins = [
    origin.strip()
    for origin in settings.cors_allow_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(factories.router)
app.include_router(reports.router)
app.include_router(ws.router)


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok"}
