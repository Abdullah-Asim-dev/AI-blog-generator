from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import router as api_router

app = FastAPI(title="LuminaWrite AI Core Engine Gateway")

# CORS Access Policies Configuration Layer
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Global handshake allow karne ke liye wild-card configuration
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core V1 router integration mapping
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"message": "LuminaWrite AI Core Core Kernel is Running Successfully!"}
