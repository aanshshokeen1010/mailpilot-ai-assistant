import hashlib
import logging
from sqlalchemy import or_
from app.models import get_session, Task, Setting, TaskFeedback, db_write_lock, init_db_lazy

# Configure logging for production diagnostics
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mailpilot.store")

def get_db():
    init_db_lazy()
    db = get_session()
    try:
        yield db
    finally:
        db.close()

def _hash_task(task_text, user_email):
    # Hash now includes user_email to allow same task for different users
    return hashlib.sha256(f"{user_email}:{task_text.lower().strip()}".encode('utf-8')).hexdigest()

def save_tasks(tasks: list, user_email: str, message_id: str = None, source_snippet: str = None):
    """
    Saves a list of tasks with context and priority. 
    Implements Global Deduplication to prevent duplicates across sync cycles.
    """
    if not user_email or not tasks: return []
    user_email = user_email.lower().strip()
    
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        saved_ids = []
        try:
            for t in tasks:
                text = t.get("task", "") if isinstance(t, dict) else str(t)
                deadline = t.get("deadline") if isinstance(t, dict) else None
                priority = t.get("priority", 3) if isinstance(t, dict) else 3
                
                if not text.strip(): continue

                # Global Deduplication Hash
                task_hash = hashlib.md5(f"{user_email}:{text.strip().lower()}".encode()).hexdigest()
                
                # Check for existing record
                existing = db.query(Task).filter(Task.user_email == user_email, Task.task_hash == task_hash).first()
                if existing:
                    logger.info(f"Duplicate suppressed: {text[:40]}...")
                    saved_ids.append(existing.id)
                    continue

                new_task = Task(
                    user_email=user_email,
                    message_id=message_id,
                    task_text=text,
                    task_hash=task_hash,
                    deadline=deadline,
                    priority=priority,
                    source_snippet=source_snippet
                )
                db.add(new_task)
                db.commit()
                db.refresh(new_task)
                saved_ids.append(new_task.id)
            # Return the full list of saved task objects for immediate UI rendering
            final_tasks = []
            for tid in saved_ids:
                t = db.query(Task).get(tid)
                if t:
                    final_tasks.append({
                        "id": t.id,
                        "task": t.task_text,
                        "deadline": t.deadline,
                        "priority": t.priority,
                        "completed": t.completed,
                        "message_id": t.message_id
                    })
            return final_tasks
        except Exception as e:
            db.rollback()
            logger.error(f"Critical DB Write Error in save_tasks: {e}")
            return []
        finally:
            db.close()

def get_tasks(user_email: str = None):
    user_email = (user_email or "").lower().strip()
    init_db_lazy()
    db = get_session()
    try:
        # Fetch active, non-archived tasks using case-insensitive matching for legacy support
        tasks = db.query(Task).filter(
            Task.user_email.ilike(user_email),
            or_(Task.archived == False, Task.archived.is_(None))
        ).order_by(Task.id.desc()).all()
        logger.info(f"Retrieved {len(tasks)} tasks for {user_email}")
        
        # Fetch feedbacks to map them to tasks
        feedbacks = db.query(TaskFeedback).filter(TaskFeedback.user_email == user_email).all()
        fb_map = {str(fb.item_id): ("positive" if fb.is_positive else "negative") for fb in feedbacks}

        result = []
        for t in tasks:
            result.append({
                "id": t.id, 
                "task": t.task_text, 
                "deadline": t.deadline, 
                "priority": t.priority,
                "completed": t.completed, 
                "message_id": t.message_id,
                "userFeedback": fb_map.get(str(t.id))
            })
        
        logger.info(f"Returning {len(result)} mapped tasks to frontend")
        return result
    except Exception as e:
        logger.error(f"CRITICAL: Error fetching tasks for {user_email}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return []
    finally:
        db.close()

def mark_task_complete(task_id: int, user_email: str):
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            task = db.query(Task).filter(Task.id == task_id, Task.user_email == user_email).first()
            if task:
                task.completed = True
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            logger.error(f"Error marking task {task_id} complete: {e}")
            return False
        finally:
            db.close()

def delete_task(task_id: int, user_email: str = None):
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            query = db.query(Task).filter(Task.id == task_id)
            if user_email:
                query = query.filter(Task.user_email == user_email)
            task = query.first()
            if task:
                task.archived = True # Use tombstone to prevent re-extraction
                db.commit()
                return True
            return False
        except Exception as e:
            db.rollback()
            logger.error(f"Error archiving task {task_id}: {e}")
            return False
        finally:
            db.close()

from functools import lru_cache

@lru_cache(maxsize=1024)
def get_setting(user_email: str, key: str, default_value: str = None):
    if not user_email: return default_value
    init_db_lazy()
    db = get_session()
    try:
        setting = db.query(Setting).filter(Setting.user_email == user_email, Setting.key == key).first()
        return setting.value if setting else default_value
    except Exception as e:
        logger.error(f"Error fetching setting {key} for {user_email}: {e}")
        return default_value
    finally:
        db.close()

def set_setting(user_email: str, key: str, value: str):
    if not user_email: return
    # Invalidate cache on write
    get_setting.cache_clear()
    
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            setting = db.query(Setting).filter(Setting.user_email == user_email, Setting.key == key).first()
            if setting:
                setting.value = str(value)
            else:
                db.add(Setting(user_email=user_email, key=key, value=str(value)))
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error saving setting {key} for {user_email}: {e}")
        finally:
            db.close()

def clear_all_tasks(user_email: str = None):
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            query = db.query(Task)
            if user_email:
                query = query.filter(Task.user_email == user_email)
            query.delete()
            db.commit()
            logger.info(f"Tasks cleared for {user_email or 'all users'}.")
        except Exception as e:
            db.rollback()
            logger.error(f"Error clearing tasks: {e}")
        finally:
            db.close()

from app.models import Feedback

def save_feedback(user_email: str, is_positive: bool, snippet: str, summary: str, item_id: str):
    if not user_email or not snippet: return False
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            # Toggle logic
            existing = db.query(Feedback).filter(Feedback.user_email == user_email, Feedback.item_id == item_id).first()
            if existing:
                if existing.is_positive == is_positive:
                    db.delete(existing)
                    db.commit()
                    return "toggled_off"
                else:
                    db.delete(existing)
            
            db.add(Feedback(user_email=user_email, item_id=item_id, is_positive=is_positive, snippet=snippet, summary=summary))
            db.commit()
            return "toggled_on"
        except Exception as e:
            db.rollback()
            logger.error(f"Error saving feedback: {e}")
            return False
        finally:
            db.close()

def get_feedback_examples(user_email: str, limit: int = 5):
    """Returns pairs of (snippet, summary) for the AI to learn from."""
    if not user_email: return [], []
    init_db_lazy()
    db = get_session()
    try:
        positive = db.query(Feedback).filter(Feedback.user_email == user_email, Feedback.is_positive == True).order_by(Feedback.id.desc()).limit(limit).all()
        negative = db.query(Feedback).filter(Feedback.user_email == user_email, Feedback.is_positive == False).order_by(Feedback.id.desc()).limit(limit).all()
        # Return full context pairs
        pos = [{"input": f.snippet, "output": f.summary} for f in positive]
        neg = [{"input": f.snippet, "output": f.summary} for f in negative]
        return pos, neg
    except Exception as e:
        logger.error(f"Error fetching feedback examples: {e}")
        return [], []
    finally:
        db.close()

from app.models import TaskFeedback

def save_task_feedback(user_email: str, is_positive: bool, task_id: int):
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            task = db.query(Task).filter(Task.id == task_id, Task.user_email == user_email).first()
            if not task:
                return False
            
            task_text = task.task_text
            snippet = task.source_snippet
            item_id = str(task_id)
            
            existing = db.query(TaskFeedback).filter(TaskFeedback.user_email == user_email, TaskFeedback.item_id == item_id).first()
            if existing:
                if existing.is_positive == is_positive:
                    db.delete(existing)
                    db.commit()
                    return "toggled_off"
                else:
                    db.delete(existing)

            db.add(TaskFeedback(user_email=user_email, item_id=item_id, is_positive=is_positive, task_text=task_text, snippet=snippet))
            db.commit()
            return "toggled_on"
        except Exception as e:
            db.rollback()
            logger.error(f"Error saving task feedback: {e}")
            return False
        finally:
            db.close()

def get_task_feedback_examples(user_email: str, limit: int = 5):
    """Returns full context pairs (email_snippet, task_text) for extraction learning."""
    if not user_email: return [], []
    init_db_lazy()
    db = get_session()
    try:
        positive = db.query(TaskFeedback).filter(TaskFeedback.user_email == user_email, TaskFeedback.is_positive == True).order_by(TaskFeedback.id.desc()).limit(limit).all()
        negative = db.query(TaskFeedback).filter(TaskFeedback.user_email == user_email, TaskFeedback.is_positive == False).order_by(TaskFeedback.id.desc()).limit(limit).all()
        pos = [{"input": f.snippet or "", "output": f.task_text} for f in positive]
        neg = [{"input": f.snippet or "", "output": f.task_text} for f in negative]
        return pos, neg
    except Exception as e:
        logger.error(f"Error fetching task feedback examples: {e}")
        return [], []
    finally:
        db.close()

def add_style_reference(user_email: str, content: str):
    if not user_email or not content: return
    from app.models import StyleReference
    init_db_lazy()
    with db_write_lock:
        db = get_session()
        try:
            new_ref = StyleReference(user_email=user_email, content=content[:2000]) # Limit length
            db.add(new_ref)
            db.flush() # Get ID for the maintenance check
            
            # Maintenance: Keep only last 20 styles for this user
            recent_ids_query = db.query(StyleReference.id).filter(StyleReference.user_email == user_email).order_by(StyleReference.id.desc()).limit(20).all()
            recent_ids = [r[0] for r in recent_ids_query]
            
            db.query(StyleReference).filter(
                StyleReference.user_email == user_email, 
                StyleReference.id.notin_(recent_ids)
            ).delete(synchronize_session=False)
            
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error saving style reference: {e}")
        finally:
            db.close()

def get_style_examples(user_email: str, limit: int = 5):
    init_db_lazy()
    db = get_session()
    try:
        from app.models import StyleReference
        refs = db.query(StyleReference).filter(StyleReference.user_email == user_email).order_by(StyleReference.id.desc()).limit(limit).all()
        return [r.content for r in refs]
    except Exception as e:
        logger.error(f"Error fetching style examples: {e}")
        return []
    finally:
        db.close()
