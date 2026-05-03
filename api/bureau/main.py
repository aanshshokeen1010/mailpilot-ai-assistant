import os
import sys
import logging

# Critical Path Injection for Vercel/Production
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Configure production logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mailpilot.main")

app = FastAPI(title="MailPilot AI API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Lazy Route Mounting ───
try:
    from app.routes.email_routes import router as email_router
    app.include_router(email_router, prefix="/api")
except Exception as e:
    logger.error(f"ROUTER INITIALIZATION FAILED: {e}")

@app.get("/health")
def health(request: Request):
    try:
        from app.services.gmail_service import TOKEN_PATH
        from app.models import init_db_lazy, get_db_url, LAST_DB_ERROR
        is_ready = init_db_lazy()
        db_url = get_db_url()
        cookie_auth = bool(request.cookies.get("mailpilot_token"))
        file_auth = os.path.exists(TOKEN_PATH)
        return {
            "status": "ok" if is_ready else "initialization_pending", 
            "authenticated": cookie_auth or file_auth, 
            "version": "1.1.0",
            "db_type": "external" if "sqlite" not in db_url else "local",
            "db_connected": is_ready,
            "db_error": LAST_DB_ERROR
        }
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error_type": type(e).__name__,
            "error_message": str(e),
            "traceback": traceback.format_exc()
        }

# Unified Frontend Serving
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
REACT_DIST = os.path.join(ROOT_DIR, "frontend-v2", "dist")

# Serve React App
if os.path.exists(REACT_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(REACT_DIST, "assets")), name="assets")

    @app.get("/favicon.svg")
    def serve_favicon():
        return FileResponse(os.path.join(REACT_DIST, "favicon.svg"))

    @app.get("/")
    @app.get("/{full_path:path}")
    def serve_react_app(full_path: str = None):
        if full_path and (full_path.startswith("api") or full_path.startswith("health")):
             return JSONResponse(status_code=404, content={"error": "API Route Not Found"})
        index_path = os.path.join(REACT_DIST, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return JSONResponse(status_code=404, content={"error": "Frontend build not found."})
else:
    @app.get("/")
    def no_frontend():
        return {"error": "No frontend found at " + REACT_DIST}