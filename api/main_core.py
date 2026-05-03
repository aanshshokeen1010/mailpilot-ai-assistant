import os
import sys
import logging

# ─── Consolidated Gateway Pathing ───
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Configure production logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mailpilot.main")

app = FastAPI(title="MailPilot AI API", version="1.6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Brain Mount ───
try:
    from bureau.routes.email_routes import router as email_router
    app.include_router(email_router, prefix="/api")
    ROUTER_STATUS = "active"
    ROUTER_ERROR = None
except Exception as e:
    import traceback
    ROUTER_STATUS = "neural_gap"
    ROUTER_ERROR = traceback.format_exc()
    logger.error(f"ROUTER INITIALIZATION FAILED:\n{ROUTER_ERROR}")

@app.get("/health")
def health(request: Request):
    try:
        from bureau.services.gmail_service import TOKEN_PATH
        from bureau import database as models
        is_ready = models.init_db_lazy()
        db_url = models.get_db_url()
        LAST_DB_ERROR = models.LAST_DB_ERROR
        
        cookie_auth = bool(request.cookies.get("mailpilot_token"))
        file_auth = os.path.exists(TOKEN_PATH)
        
        return {
            "status": "ok" if is_ready else "initializing", 
            "version": "1.6.0",
            "db_connected": is_ready,
            "db_error": str(LAST_DB_ERROR) if LAST_DB_ERROR else None,
            "router_status": ROUTER_STATUS,
            "router_error": ROUTER_ERROR,
            "authenticated": cookie_auth or file_auth
        }
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error_type": type(e).__name__,
            "error_message": str(e),
            "traceback": traceback.format_exc()
        }

# Simplified Frontend Serving
ROOT_DIR = os.path.dirname(BASE_DIR)
REACT_DIST = os.path.join(ROOT_DIR, "public")

@app.get("/favicon.svg")
def serve_favicon():
    return FileResponse(os.path.join(REACT_DIST, "favicon.svg"))

@app.get("/")
@app.get("/{full_path:path}")
def serve_react_app(full_path: str = None):
    # API routes are handled by rewrites, but this is a fallback
    if full_path and (full_path.startswith("api") or full_path.startswith("health")):
         return JSONResponse(status_code=404, content={"error": "API Route Not Found"})
    
    index_path = os.path.join(REACT_DIST, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(status_code=404, content={"error": "Frontend build not found."})
