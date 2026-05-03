import json
import re
import hashlib
from app.services.ai_service import generate_ai_response, MODELS

JAMES_TASK_PROMPT = """You are James, the brilliant AI Intern. Your Boss (the user) has just had their emails scanned for tasks by a worker bot.
Your job is to REVIEW and VERIFY these tasks before the Boss sees them.

Responsibilities:
1. Accuracy: Does the task actually exist in the email? Remove 'fake' tasks.
2. Humanize: Ensure the tasks are written clearly and professionally for the Boss.
3. Priority Check: Is the priority score (1-5) realistic? Adjust if needed.
4. Deadline Check: Ensure dates are in ISO-8601 (YYYY-MM-DD) format.

If no actionable tasks exist, return an empty list [].
Your output MUST be a strict JSON array of objects. 
DO NOT include any commentary, notes, or explanations outside the JSON array.
"""

def extract_tasks(email_text: str, pos_examples=None, neg_examples=None, retry=False):
    """The James-Led Task Pipeline: Nano 8B (Fast Extraction) -> JSON Parse."""
    
    feedback_injection = ""
    if pos_examples:
        feedback_injection += "\nGOLDEN EXAMPLES:\n" + "\n".join([f'- "{t}"' for t in pos_examples])
    if neg_examples:
        feedback_injection += "\nNEGATIVE EXAMPLES (do NOT extract these):\n" + "\n".join([f'- "{t}"' for t in neg_examples])

    # PHASE 1: Fast Extraction — JSON-only enforced
    worker_prompt = f"""You are a high-precision Task Extraction Bot.

CRITICAL RULES:
- Output ONLY a valid JSON array. No commentary. No explanation. No markdown.
- If no tasks exist, output exactly: []
- Every actionable request, deadline, or follow-up is a task.
- If someone says "please check", "apply by", "submit", "register", "reply" — that is a task.

EMAIL CONTENT:
{email_text[:3000]}
{feedback_injection}

OUTPUT FORMAT (strictly follow this):
[
  {{"task": "Description of task", "deadline": "YYYY-MM-DD or null", "priority": 3}},
  {{"task": "Another task", "deadline": null, "priority": 2}}
]

JSON OUTPUT:"""

    raw_response = generate_ai_response(worker_prompt, model_type="FAST")
    
    # Parse JSON from response
    from app.services.ai_service import extract_json
    tasks = extract_json(raw_response)
    
    # Aggressive fallback if JSON parse fails
    if not tasks or not isinstance(tasks, list):
        tasks = _fallback_extract(raw_response)

    # Normalize and deduplicate
    return _normalize(tasks)


def _fallback_extract(response: str):
    """Last resort: pull task-like lines from raw text."""
    tasks = []
    lines = response.split('\n')
    for line in lines:
        line = line.strip()
        if not line: continue
        if re.search(r'^(?:note|reasoning|analysis|disclaimer|verified|output|here)[\s:]', line, re.IGNORECASE):
            continue
        m = re.search(r'(?:^[-*•\d.]\s*|"task"\s*:\s*"?)(.*?)(?:"?,?\s*$)', line, re.IGNORECASE)
        if m:
            text = m.group(1).strip().strip('"').strip("'").strip("*").strip(",")
            if len(text) > 10 and not text.endswith(":"):
                tasks.append({"task": text, "priority": 3, "deadline": None})
    return tasks


def _normalize(tasks: list):
    """Deduplicate and clean task list."""
    try:
        normalized = []
        seen_hashes = set()
        for t in tasks:
            text = t.get("task", "").strip() if isinstance(t, dict) else str(t).strip()
            if not text or len(text) < 5: continue
            
            # Filter AI meta-commentary that slipped through
            skip_phrases = ["yielded", "no task", "no action", "i found", "i have found", 
                          "based on", "the email", "there are no", "this email"]
            if any(p in text.lower() for p in skip_phrases): continue
            
            thash = hashlib.md5(text.lower().encode()).hexdigest()
            if thash not in seen_hashes:
                normalized.append({
                    "task": text,
                    "deadline": t.get("deadline") if isinstance(t, dict) else None,
                    "priority": t.get("priority", 3) if isinstance(t, dict) else 3
                })
                seen_hashes.add(thash)
        return normalized
    except:
        return []
