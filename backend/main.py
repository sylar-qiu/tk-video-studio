from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from migrate import run_migrations
from routers import api, products

run_migrations()

app = FastAPI(title="TK Video Studio", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router)
app.include_router(products.router)


@app.get("/")
def root():
    return {"service": "tk-video-studio", "docs": "/docs"}
