import json
import re
import hashlib
from datetime import datetime
from app.services.ai_service import generate_ai_response, _persona_mismatch_category

JAMES_TASK_PROMPT = """You are James, the brilliant AI Intern. Your Boss (the user) has just had their emails scanned for tasks by a worker bot.
Your job is to REVIEW and VERIFY these tasks before the Boss sees them.

Responsibilities:
1. Accuracy: Does the task actually exist in the email? Remove fake tasks.
2. Humanize: Ensure the tasks are written clearly and professionally for the Boss.
3. Priority Check: Is the priority score (1-5) realistic? Adjust if needed.
4. Deadline Check: Keep only ISO-8601 dates (YYYY-MM-DD). Use null if unknown.

If no actionable tasks exist, return an empty list [].
Your output MUST be a strict JSON array of objects.
DO NOT include any commentary, notes, or explanations outside the JSON array.
"""

def extract_tasks(email_text: str, pos_examples=None, neg_examples=None, retry=False, user_persona=""):
    """Task Pipeline: fast extraction -> James verification -> normalization."""
    feedback_injection = ""
    if pos_examples:
        feedback_injection += "\nGOLDEN EXAMPLES:\n" + "\n".join([f'- "{_example_text(t)}"' for t in pos_examples])
    if neg_examples:
        feedback_injection += "\nNEGATIVE EXAMPLES (do NOT extract these):\n" + "\n".join([f'- "{_example_text(t)}"' for t in neg_examples])

    worker_prompt = f"""You are a high-precision Task Extraction Bot.

CRITICAL RULES:
- Output ONLY a valid JSON array. No commentary. No explanation. No markdown.
- If no tasks exist, output exactly: []
- Extract only work the Boss can actually do or reply to.
- Every explicit request, deadline, commitment, follow-up, form, application, approval, meeting prep, or reply needed is a task.
- Ignore newsletters, FYI-only updates, receipts, signatures, marketing copy, legal footers, and vague statements without a requested action.
- If someone says "please check", "apply by", "submit", "register", "reply", "confirm", "review", or "send" and it applies to the Boss, that is a task.
- Use null for unknown deadlines. Do not invent dates.
- Priority: 5 urgent/time-critical, 4 important client/business task, 3 normal follow-up, 2 low importance.

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
    prompt = f"""You are the Bureau task relevance judge.

Boss profile and filtering rules:
{user_persona}

Original email:
{email_text[:2500]}

Candidate tasks:
{json.dumps(tasks)}

Keep only tasks that the Boss personally needs to act on. Be strict about university roll number, section, semester, course, specialization, and campus.
Remove tasks meant for other sections/roll numbers/classes/campuses.
Merge near-duplicate tasks into one precise task.
Keep real assignment, quiz, course, registration, deadline, reply, payment, or form tasks when they apply to the Boss.

Return ONLY a JSON array with this schema:
[{{"task":"precise task written naturally for the Boss", "deadline":"YYYY-MM-DD or null", "priority":1-5}}]
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
