import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "minimal_boot_ok", "db_url_exists": bool(os.getenv("DATABASE_URL"))}

@app.get("/")
def index():
    return {"message": "MailPilot Emergency Minimal Boot Active"}