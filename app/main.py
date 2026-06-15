# -*- coding: utf-8 -*-
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users, audit
from app.api.v1.router_orders import router as orders_router
from app.api.v1.router_applications import router as applications_router
from app.api.v1.router_images import router as images_router
from app.api.v1.router_warehouse import router as warehouse_router


app = FastAPI(
    title="LaserCut Core",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(auth.router)
app.include_router(users.router, tags=["Users"])  # ✅ Убрали prefix
app.include_router(audit.router, tags=["Audit"])  # ✅ Убрали prefix
app.include_router(orders_router)
app.include_router(applications_router, prefix="/api/v1")
app.include_router(images_router, prefix="/api/v1")
app.include_router(warehouse_router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)