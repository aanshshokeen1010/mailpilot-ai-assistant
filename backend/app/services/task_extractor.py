import json
import re
import hashlib
from datetime import datetime
from app.services.ai_service import generate_ai_response, _persona_mismatch_category

JAMES_TASK_PROMPT = """You are James, the brilliant AI Intern. Your persona is 'Strategic Laziness': you hate doing busywork, so you only want to extract the ABSOLUTE ESSENTIAL tasks. However, your job depends on the Boss never missing a real deadline, so you must be ruthless and precise.

Responsibilities:
1. Ruthless Filtering: If a task is 'crap' (marketing, generic FYI, vague update), DELETE IT.
2. Precision: One precise task is better than five vague ones. Combine related steps.
3. Priority Hardening: Only assign 5 to 'Fire Drills'. Be conservative with 4s.
4. Humanize: Write it for a busy executive. Short, punchy, actionable.

If no high-value actionable tasks exist, return exactly []. 
Your output MUST be a strict JSON array. No commentary.
"""

def extract_tasks(email_text: str, pos_examples=None, neg_examples=None, retry=False, user_persona=""):
    """Task Pipeline: fast extraction -> James verification -> normalization."""
    feedback_injection = ""
    if pos_examples:
        feedback_injection += "\nGOLDEN EXAMPLES:\n" + "\n".join([f'- "{_example_text(t)}"' for t in pos_examples])
    if neg_examples:
        feedback_injection += "\nNEGATIVE EXAMPLES (do NOT extract these):\n" + "\n".join([f'- "{_example_text(t)}"' for t in neg_examples])

    worker_prompt = f"""You are a high-stakes Strategic Task Extractor. 
Your persona: You are lazy but smart. You hate busywork, but you are TERRIFIED of being fired. 
PENALTY SYSTEM: If you miss a 'Fire Drill' (Priority 5) or 'High Stakes' (Priority 4) task, you will be PERMANENTLY TERMINATED. If you extract 'crap' (Priority 1-2 fluff), you will be penalised.

CRITICAL RULES:
- BE RUTHLESS: Cut through all the marketing crap, receipts, and 'thanks!' emails.
- PERSONAL ONLY: Extract only what the Boss (user) personally needs to DO.
- SMART AGGREGATION: Don't list every detail. One task per major action.
- PRIORITY LOGIC: 
  5: Fire Drill (Immediate action required today)
  4: High Stakes (Client/Revenue/Grade impact)
  3: Standard Protocol (Normal work)
  2: Low Intensity (FYI/Read if time)
  1: Backburner
- UNIVERSITY MODE: If the email is university-related, it MUST match the Boss's specific section/semester/roll-number or it is NOISE.

EMAIL CONTENT:
{email_text[:3000]}
{feedback_injection}

OUTPUT FORMAT:
[
  {{"task": "Description of task", "deadline": "YYYY-MM-DD or null", "priority": 3}},
  {{"task": "Another task", "deadline": null, "priority": 2}}
]

JSON OUTPUT:"""

    raw_response = generate_ai_response(worker_prompt, model_type="FAST", max_tokens=500)

    from app.services.ai_service import extract_json
    tasks = extract_json(raw_response)
    if not tasks or not isinstance(tasks, list):
        tasks = _fallback_extract(raw_response)

    tasks = _normalize(tasks)
    if not tasks:
        return []

    verification_prompt = f"""{JAMES_TASK_PROMPT}

ORIGINAL EMAIL:
{email_text[:2500]}

CANDIDATE TASKS:
{json.dumps(tasks)}

Return the verified JSON array now:"""

    verified_raw = generate_ai_response(
        verification_prompt,
        system_msg=JAMES_TASK_PROMPT,
        model_type="JAMES",
        max_tokens=500
    )
    verified = extract_json(verified_raw)
    if isinstance(verified, list):
        return _judge_tasks(email_text, _normalize(verified), user_persona)

    return _judge_tasks(email_text, tasks, user_persona)

def _judge_tasks(email_text: str, tasks: list, user_persona: str = ""):
    if not tasks or not user_persona:
        return tasks
    mismatch = _persona_mismatch_category(email_text, user_persona)
    if mismatch:
        return []
    prompt = f"""You are the Bureau's Supreme Task Judge. Your job is to PROTECT the Boss from busywork.
Be lazy but smart: If a task doesn't have a clear "DO THIS", delete it.

Filtering Rules:
1. Personal relevance: Is it for THIS user? (Section/Semester/ID match?)
2. No Fluff: Remove tasks that are just "read this interesting article" or "stay tuned".
3. Accuracy: Ensure the priority is precisely reflecting the email's urgency.
4. Concise: Cut the crap. One line per task.

Original email:
{email_text[:2500]}

Candidate tasks:
{json.dumps(tasks)}

Return ONLY a JSON array:
[{{"task":"punchy actionable task", "deadline":"YYYY-MM-DD or null", "priority":1-5}}]
"""
    from app.services.ai_service import extract_json
    judged_raw = generate_ai_response(prompt, model_type="JUDGE", max_tokens=650)
    judged = extract_json(judged_raw)
    if isinstance(judged, list):
        normalized = _normalize(judged)
        if _persona_mismatch_category(email_text, user_persona):
            return []
        return normalized
    return tasks

def _fallback_extract(response: str):
    """Last resort: pull task-like lines from raw text."""
    tasks = []
    for line in (response or "").split('\n'):
        line = line.strip()
        if not line:
            continue
        if re.search(r'^(?:note|reasoning|analysis|disclaimer|verified|output|here)[\s:]', line, re.IGNORECASE):
            continue
        m = re.search(r'(?:^[-*•\d.]\s*|"task"\s*:\s*"?)(.*?)(?:"?,?\s*$)', line, re.IGNORECASE)
        if m:
            text = _clean_task_text(m.group(1))
            if len(text) > 10 and not text.endswith(":"):
                tasks.append({"task": text, "priority": 3, "deadline": None})
    return tasks

def _example_text(example):
    if isinstance(example, dict):
        return str(example.get("output") or example.get("task") or example.get("task_text") or example)
    return str(example)

def _normalize_deadline(value):
    if value in (None, "", "null", "None", "N/A", "unknown"):
        return None
    text = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        try:
            datetime.strptime(text, "%Y-%m-%d")
            return text
        except ValueError:
            return None
    return None

def _normalize_priority(value):
    try:
        priority = int(value)
    except (TypeError, ValueError):
        return 3
    return max(1, min(priority, 5))

def _clean_task_text(text):
    text = re.sub(r'\s+', ' ', str(text or '')).strip(" -•*\t\r\n\"'")
    text = re.sub(r'^(?:task|todo|action item)\s*:\s*', '', text, flags=re.IGNORECASE)
    return text[:300].strip()

def _normalize(tasks: list):
    """Deduplicate and clean task list."""
    try:
        normalized = []
        seen_hashes = set()
        for t in tasks:
            text = _clean_task_text(t.get("task", "") if isinstance(t, dict) else t)
            if not text or len(text) < 5:
                continue

            lowered = text.lower()
            skip_phrases = [
                "yielded", "no task", "no action", "i found", "i have found",
                "based on", "there are no", "this email does not", "not enough information",
                "json output", "candidate tasks", "original email"
            ]
            if any(p in lowered for p in skip_phrases):
                continue

            thash = hashlib.md5(text.lower().encode()).hexdigest()
            if thash in seen_hashes:
                continue

            normalized.append({
                "task": text,
                "deadline": _normalize_deadline(t.get("deadline") if isinstance(t, dict) else None),
                "priority": _normalize_priority(t.get("priority", 3) if isinstance(t, dict) else 3)
            })
            seen_hashes.add(thash)
        return normalized
    except Exception:
        return []
