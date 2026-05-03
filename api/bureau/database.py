import os
import threading
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Improved Pathing for Production (Vercel/Local)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_VERCEL = os.environ.get("VERCEL") == "1"
# For SQLite, absolute path is critical to avoid "Database not found" errors
DB_PATH = os.path.join("/tmp" if IS_VERCEL else BASE_DIR, "mailpilot.db")
# Support for external DB (Postgres/Supabase/Neon) for Vercel Persistence
# ─── Lazy Engine Initialization ───
_engine = None
_SessionLocal = None
_final_db_url = None

def get_db_url():
    global _final_db_url
    if _final_db_url: return _final_db_url
    
    raw_url = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)
        
    # Handle special characters in password
    if "://" in raw_url and "@" in raw_url.split("://")[1]:
        try:
            from urllib.parse import quote_plus
            protocol, rest = raw_url.split("://", 1)
            auth, host_db = rest.rsplit("@", 1)
            if ":" in auth:
                user, password = auth.split(":", 1)
                if "%" not in password:
                    auth = f"{user}:{quote_plus(password)}"
            raw_url = f"{protocol}://{auth}@{host_db}"
        except: pass

    # SSL Enforcement
    if raw_url.startswith("postgresql") and "sslmode" not in raw_url:
        separator = "&" if "?" in raw_url else "?"
        raw_url += f"{separator}sslmode=require"
        
    _final_db_url = raw_url
    return _final_db_url

def get_engine():
    global _engine
    if _engine is None:
        url = get_db_url()
        args = {}
        if url.startswith("sqlite"):
            args = {"check_same_thread": False, "timeout": 60}
        _engine = create_engine(url, connect_args=args)
    return _engine

def get_session():
    global _SessionLocal
    if _SessionLocal is None:
        engine = get_engine()
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return _SessionLocal()

# Legacy Compatibility Bridge (Prevents crash if older service modules try to import it)
def SessionLocal():
    return get_session()

DATABASE_READY = None
LAST_DB_ERROR = None
def init_db_lazy():
    global DATABASE_READY, LAST_DB_ERROR
    if DATABASE_READY is not None: return DATABASE_READY
    
    try:
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
        DATABASE_READY = True
        LAST_DB_ERROR = None
    except Exception as e:
        import logging
        LAST_DB_ERROR = str(e)
        logging.getLogger("mailpilot.models").error(f"DATABASE CONNECTION FAILED: {e}")
        DATABASE_READY = False
    return DATABASE_READY
Base = declarative_base()

# Bug #CRITICAL: Global lock for database WRITES
# This ensures that even with high concurrency, we don't hit "database is locked" errors
db_write_lock = threading.Lock()

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True) # Binding tasks to specific accounts
    message_id = Column(String, index=True) # Source email reference
    task_hash = Column(String, index=True)  
    task_text = Column(String, index=True)
    deadline = Column(String, nullable=True)
    priority = Column(Integer, default=3)
    completed = Column(Boolean, default=False)
    archived = Column(Boolean, default=False) # Persistent deletion
    source_snippet = Column(String, nullable=True) # Context for feedback learning
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class StyleReference(Base):
    __tablename__ = "style_references"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True) # Scope settings to user
    key = Column(String, index=True)        # Key is unique PER user, handled in logic
    value = Column(String)

class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    item_id = Column(String, index=True)
    is_positive = Column(Boolean)
    snippet = Column(String)
    summary = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class TaskFeedback(Base):
    __tablename__ = "task_feedbacks"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    item_id = Column(String, index=True)
    is_positive = Column(Boolean)
    task_text = Column(String)
    snippet = Column(String, nullable=True) # Context for the extraction
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

# Note: Schema initialization is now called lazily via init_db_lazy()
