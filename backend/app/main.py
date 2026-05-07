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

app = FastAPI(title="MailPilot AI API", version="2.1.1")

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

def _health_payload(request: Request):
    from app.services.gmail_service import TOKEN_PATH
    cookie_val = request.cookies.get("mailpilot_token")
    cookie_auth = bool(cookie_val)
    file_auth = False if os.getenv("VERCEL") == "1" else os.path.exists(TOKEN_PATH)
    
    authenticated = cookie_auth or file_auth
    user_email = None

    # Fast path: extract user_email from the signed cookie without any Google API call.
    # The cookie already caches the email set during login/oauth2callback.
    if cookie_val:
        try:
            import json, base64, hmac, hashlib
            from app.config.settings import settings as app_settings
            if '.' in cookie_val:
                payload, signature = cookie_val.split('.', 1)
                expected = hmac.new(app_settings.SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
                if hmac.compare_digest(signature, expected):
                    missing = len(payload) % 4
                    if missing:
                        payload += '=' * (4 - missing)
                    data = json.loads(base64.urlsafe_b64decode(payload).decode())
                    user_email = data.get('user_email')
        except:
            pass

    return {
        "status": "ok", 
        "authenticated": authenticated, 
        "user_email": user_email,
        "version": "2.1.1",
        "db_type": "external" if os.getenv("DATABASE_URL") else "local"
    }

@app.get("/health")
def health(request: Request):
    return _health_payload(request)

@app.get("/api/health")
def api_health(request: Request):
    return _health_payload(request)

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
