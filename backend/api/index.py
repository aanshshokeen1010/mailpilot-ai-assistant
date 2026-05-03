import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "survival_boot_ok"}

@app.get("/api/health")
def api_health():
    return {"status": "survival_boot_ok_via_api"}

@app.get("/")
def index():
    return {"message": "MailPilot Survival Mode Active"}