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
# ─── Database Configuration ───
def get_db_url():
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
    

    return raw_url


DATABASE_URL = get_db_url()
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False, "timeout": 60}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Enable WAL mode for concurrent read/writes (SQLite only)
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Bug #CRITICAL: Global lock for database WRITES
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

class CategoryOverride(Base):
    __tablename__ = "category_overrides"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    item_id = Column(String, index=True)
    category = Column(String, index=True)
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

Base.metadata.create_all(bind=engine)
