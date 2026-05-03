import os
import sys
import logging

# Critical Path Injection for Vercel/Production
# Ensures that 'backend' is recognized as a module root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes.email_routes import router as email_router

# Configure production logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mailpilot.main")

# Note: OAUTHLIB_INSECURE_TRANSPORT is now handled in gmail_service.py
# based on GMAIL_REDIRECT_URI for proper localhost/production detection

app = FastAPI(title="MailPilot AI API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8002", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal System Error", "detail": f"CRITICAL CRASH: {str(exc)}"},
    )

# Consolidated API Routes
app.include_router(email_router, prefix="/api")

@app.get("/health")
def health(request: Request):
    from app.services.gmail_service import TOKEN_PATH
    cookie_auth = bool(request.cookies.get("mailpilot_token"))
    file_auth = os.path.exists(TOKEN_PATH)
    return {
        "status": "ok", 
        "authenticated": cookie_auth or file_auth, 
        "version": "1.1.0",
        "db_type": "external" if os.getenv("DATABASE_URL") else "local"
    }

# Unified Frontend Serving
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
REACT_DIST = os.path.join(ROOT_DIR, "frontend-v2", "dist")
VANILLA_DIR = os.path.join(ROOT_DIR, "frontend")

# Serve Vanilla JS assets at /static (Legacy Support)
if os.path.exists(VANILLA_DIR):
    app.mount("/static", StaticFiles(directory=VANILLA_DIR), name="static")

# Serve React App (Primary Production Interface)
if os.path.exists(REACT_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(REACT_DIST, "assets")), name="assets")

    @app.get("/favicon.svg")
    def serve_favicon():
        return FileResponse(os.path.join(REACT_DIST, "favicon.svg"))

    @app.get("/")
    @app.get("/{full_path:path}")
    def serve_react_app(full_path: str = None):
        # Prevent API routes from being intercepted by SPA router
        if full_path and (full_path.startswith("api") or full_path.startswith("health") or full_path.startswith("static")):
             return JSONResponse(status_code=404, content={"error": "API Route Not Found"})
        
        index_path = os.path.join(REACT_DIST, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return JSONResponse(status_code=404, content={"error": "Frontend build not found."})
else:
    @app.get("/")
    def serve_vanilla():
        if os.path.exists(VANILLA_DIR):
            return FileResponse(os.path.join(VANILLA_DIR, "index.html"))
        return JSONResponse(status_code=404, content={"error": "No frontend found."})