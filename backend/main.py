from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from migrate import run_migrations
from frontend_static import mount_frontend
from middleware.auth import AuthMiddleware
from routers import api, auth, products

run_migrations()

app = FastAPI(title="TK Video Studio", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware)

app.include_router(auth.router)
app.include_router(api.router)
app.include_router(products.router)
mount_frontend(app)
