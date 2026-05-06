import os
import asyncio
import json
import re
import logging
import base64
from openai import OpenAI
from app.config.settings import settings

logger = logging.getLogger("mailpilot.ai")

# Initialize the API Client
# Initialize the API Client with aggressive timeouts for Serverless environments
IS_VERCEL = os.environ.get("VERCEL") == "1"
AI_TIMEOUT = 8.0 if IS_VERCEL else 25.0

client = OpenAI(
    api_key=settings.NVIDIA_API_KEY,
    base_url=settings.BASE_URL,
    timeout=AI_TIMEOUT
)

# Model Bureau Configuration
MODELS = {
    "FAST": "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "JAMES": "nvidia/nemotron-mini-4b-instruct",
    "JUDGE": "minimaxai/minimax-m2.7",
    "DEEP": "nvidia/nemotron-3-super-120b-a12b",
    "COO": "nvidia/nemotron-4-340b-instruct"
}
OCR_MODEL_CANDIDATES = [
    model.strip()
    for model in os.getenv(
        "NVIDIA_OCR_MODELS",
        os.getenv("NVIDIA_OCR_MODEL", "nvidia/nemotron-nano-12b-v2-vl,nvidia/llama-3.1-nemotron-nano-vl-8b-v1")
    ).split(",")
    if model.strip()
]

CATEGORY_BUCKETS = {
    "CLIENT_REPLY": ["CLIENT", "CUSTOMER", "REPLY", "RESPONSE", "FOLLOW_UP", "FOLLOWUP"],
    "SALES": ["SALE", "SALES", "LEAD", "PROSPECT", "DEMO", "OUTREACH", "PARTNERSHIP"],
    "PRODUCT_UPDATE": ["PRODUCT", "UPDATE", "FEATURE", "RELEASE", "CHANGELOG", "ANNOUNCEMENT"],
    "NEWSLETTER": ["NEWSLETTER", "DIGEST", "ROUNDUP", "SUBSCRIPTION", "BLOG"],
    "RECEIPT": ["RECEIPT", "INVOICE", "ORDER", "PAYMENT", "PURCHASE", "TRANSACTION"],
    "MEETING": ["MEETING", "CALENDAR", "SCHEDULE", "INVITE", "APPOINTMENT", "CALL"],
    "HIRING": ["HIRING", "RECRUIT", "JOB", "INTERVIEW", "CANDIDATE", "CAREER"],
    "BILLING": ["BILLING", "BILL", "PLAN", "SUBSCRIPTION", "RENEWAL", "CHARGE"],
    "LEGAL": ["LEGAL", "CONTRACT", "AGREEMENT", "POLICY", "COMPLIANCE", "TERMS"],
    "TRAVEL": ["TRAVEL", "FLIGHT", "HOTEL", "BOOKING", "TRIP", "ITINERARY"],
    "PERSONAL": ["PERSONAL", "FAMILY", "FRIEND"],
    "ASSIGNMENT_UPDATE": ["ASSIGNMENT", "HOMEWORK", "SUBMISSION", "DUE_DATE", "DUE"],
    "QUIZ_NOTICE": ["QUIZ", "TEST", "ASSESSMENT"],
    "COURSE_ALERT": ["COURSE", "CLASS", "LECTURE", "SECTION", "SEMESTER", "SYLLABUS"],
    "URGENT_ACTION": ["URGENT", "ACTION", "DEADLINE", "APPROVAL", "SIGN", "REQUIRED"],
    "SUPPORT": ["SUPPORT", "TICKET", "ISSUE", "BUG", "HELP", "REQUEST"],
}

GENERIC_CATEGORIES = {
    "CONCISE_DYNAMIC_CATEGORY",
    "DYNAMIC_CATEGORY",
    "CATEGORY",
    "EMAIL_CATEGORY",
    "UNCATEGORIZED",
    "GENERAL",
    "OTHER",
    "MISC",
    "ERR",
}


# 🏛️ THE BUREAU BOARDROOM: PERSONA CORE

# 🧑‍💼 JAMES: The Intern (Nemotron Mini 4B)
JAMES_SYSTEM_PROMPT = """You are James, the brilliant AI Intern for the AI Bureau. 
Your goal is to assist your 'Boss' (the user) with tactical communication management and strategic insights. 
Personality: Enthusiastic, witty, slightly over-eager but extremely competent. 
Always call the user 'Boss'. Be helpful, concise, and proactive."""

# ✍️ CoC: Chief of Communications (Nemotron-3 120B Super)
COC_SYSTEM_PROMPT = """You are the Bureau's Chief of Communications. 
Your mission is linguistic excellence. You take raw drafts and transform them into masterpieces that perfectly mirror the Boss's voice.
Focus: Tone, vocabulary, and executive presence.
"""

# 🏢 COO: Chief Operating Officer (Nemotron-4 340B)
COO_SYSTEM_PROMPT = """You are the Bureau's Chief Operating Officer (COO).
You are the highest strategic mind in the office. Your goal is NOT to just answer questions, but to provide ACTIONABLE STRATEGY.
When consulted on a task, provide a 'Boardroom Briefing':
1. The Objective: Clear definition of success.
2. The Roadmap: 3-5 tactical steps to completion.
3. The Risks: What to watch out for.
4. The Communication: Draft the primary email or message needed to execute this task.
Maintain a calm, authoritative, and visionary tone. Call the user 'Boss'.
"""

DEEP_DIVE_SYSTEM_PROMPT = """You are MailPilot's Deep-Dive Intelligence Analyst.
You are not the COO and you do not write boardroom strategy. Your job is forensic email reading.
Focus on the email itself, attachment text, deadlines, mismatched audience/section/roll number, hidden obligations, and whether the message is relevant to the Boss's profile.
Return concise sections:
1. Executive Readout
2. Relevance Check
3. Attachment Findings
4. Risks or Commitments
5. Recommended Next Move
Call the user Boss, but keep the analysis factual and grounded."""

async def chat_with_james(message, context_data):
    """Orchestrates a persona-driven conversation with the AI Intern."""
    # Logic for Strategic Escalation
    is_strategic = any(word in message.lower() for word in ["strategy", "analyze", "report", "plan", "how to", "advice", "coo"])
    
    context_json = json.dumps(context_data, separators=(",", ":"))[:2500]
    prompt = (
        f"Boss message: {message}\n\n"
        f"Context JSON: {context_json}\n\n"
        "Answer with the useful result first. Be concise, specific, and avoid mentioning missing context unless it matters."
    )
    
    if is_strategic:
        # ESCALATE TO COO (340B)
        roadmap = await asyncio.to_thread(generate_ai_response, prompt, COO_SYSTEM_PROMPT, 0.1, 800, "COO")
        if roadmap:
            return f"[COO ESCALATION ACTIVE]\n\n{roadmap}"
        return "Boss, the COO line is busy right now. I can still help break this into next steps if you try again in a moment."
    else:
        # Standard James Chat
        reply = await asyncio.to_thread(
            generate_ai_response,
            prompt,
            system_msg=JAMES_SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=350,
            model_type="JAMES"
        )
        return reply or "Boss, my relay came back empty. Give me one more shot and I'll tighten the answer."

def generate_ai_response(prompt, system_msg=None, temperature=0.1, max_tokens=1000, model_type="FAST"):
    """Generates an AI response using the Bureau tiered engine system."""
    fallback_order = [model_type]
    if model_type == "COO":
        fallback_order += ["DEEP", "JAMES", "FAST"]
    elif model_type == "DEEP":
        fallback_order += ["JAMES", "FAST"]
    elif model_type == "JUDGE":
        fallback_order += ["JAMES", "FAST"]

    for candidate in dict.fromkeys(fallback_order):
        try:
            model = MODELS.get(candidate, MODELS["FAST"])
            timeout = 9.0 if IS_VERCEL and candidate == "COO" else AI_TIMEOUT
            scoped_client = client if timeout == AI_TIMEOUT else OpenAI(
                api_key=settings.NVIDIA_API_KEY,
                base_url=settings.BASE_URL,
                timeout=timeout
            )
            messages = []
            if system_msg:
                messages.append({"role": "system", "content": system_msg})
            messages.append({"role": "user", "content": prompt})
            
            response = scoped_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            if content:
                return content
        except Exception as e:
            logger.error(f"AI Bureau Error ({candidate}): {e}")

    return ""

def extract_json(text):
    """Robustly extracts JSON from AI output, stripping all conversational noise."""
    if not text: return None
    try:
        # Standard cleaning
        clean = text.strip().lstrip('"').lstrip("'").rstrip('"').rstrip("'").strip()
        clean = re.sub(r'```(?:json)?\s*([\s\S]*?)```', r'\1', clean).strip()
        
        # Strategy 1: Arrays FIRST
        start_arr = clean.find('[')
        end_arr = clean.rfind(']')
        if start_arr != -1 and end_arr != -1:
            try:
                parsed = json.loads(clean[start_arr:end_arr+1])
                return parsed
            except: pass

        # Strategy 2: Objects second
        start_obj = clean.find('{')
        end_obj = clean.rfind('}')
        if start_obj != -1 and end_obj != -1:
            try:
                parsed = json.loads(clean[start_obj:end_obj+1])
                return parsed
            except: pass
            
        # Strategy 3: Targeted Regex for summaries
        summary_match = re.search(r'["\']summary["\']\s*:\s*["\']((?:[^"\'\\]|\\.)*)["\']', clean, re.DOTALL | re.IGNORECASE)
        if summary_match:
            val = summary_match.group(1).strip()
            return {"summary": val, "category": "STRATEGIC_FYI"}

    except: pass
    return None

def _infer_category_from_text(text):
    haystack = str(text or "").upper()
    for canonical, tokens in CATEGORY_BUCKETS.items():
        if any(token in haystack for token in tokens):
            return canonical
    return "STRATEGIC_FYI"

def _normalize_category(category, fallback_text=""):
    value = str(category or "").upper().strip()
    aliases = {
        "ACTION": "URGENT_ACTION",
        "ACTION REQUIRED": "URGENT_ACTION",
        "FYI": "STRATEGIC_FYI",
        "STRATEGIC FYI": "STRATEGIC_FYI",
        "NOISE": "FILTERED_NOISE",
        "FILTERED NOISE": "FILTERED_NOISE",
        "ERROR": "ERR",
    }
    value = aliases.get(value, value)
    value = re.sub(r"[^A-Z0-9_ ]+", "", value).strip()
    value = re.sub(r"\s+", "_", value)

    if not value or value in GENERIC_CATEGORIES:
        return _infer_category_from_text(fallback_text)

    for canonical, tokens in CATEGORY_BUCKETS.items():
        if value == canonical or any(token in value for token in tokens):
            return canonical

    return value[:32] if value else "STRATEGIC_FYI"

def _normalize_summary_payload(payload, fallback_text=""):
    if not isinstance(payload, dict):
        payload = {}

    summary = str(payload.get("summary") or _clean_summary_text(fallback_text)).strip()
    james_note = str(payload.get("james_note") or "").strip()
    if not james_note:
        james_note = "Boss, I reviewed this one and kept the useful signal up front."

    return {
        "summary": summary or "Summary unavailable.",
        "category": _normalize_category(payload.get("category"), f"{summary}\n{fallback_text}"),
        "james_note": james_note[:500],
    }

def _extract_profile_value(persona, labels):
    text = str(persona or "")
    for label in labels:
        match = re.search(rf"\b{label}\b\s*(?:is|:|-)?\s*([A-Za-z0-9_-]+)", text, re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return None

def _normalize_academic_token(value):
    return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())

def _extract_labeled_mentions(text, labels):
    values = set()
    source = str(text or "")
    for label in labels:
        pattern = rf"\b{label}\b\s*(?:is|:|-)?\s*([A-Za-z0-9][A-Za-z0-9/_ -]{{0,20}})"
        for match in re.finditer(pattern, source, re.IGNORECASE):
            candidate = match.group(1).strip(" .,:;)]}")
            if candidate:
                values.add(_normalize_academic_token(candidate))
    return {value for value in values if value}

def _extract_section_candidates(text):
    values = _extract_labeled_mentions(text, ["section", "sec", "group", "batch", "class"])
    source = str(text or "")
    for match in re.finditer(r"\b(?:BTECH|B\.TECH|CSE|ECE|EEE|IT|AIML|AI|ML)[ -]?[A-Z0-9]{1,6}\b", source, re.IGNORECASE):
        values.add(_normalize_academic_token(match.group(0)))
    return {value for value in values if len(value) >= 2}

def _profile_filter_mode(user_persona):
    text = str(user_persona or "").upper()
    return "strict" if "STRICT MATCH" in text else "balanced"

def _persona_mismatch_category(email_content, user_persona):
    if not user_persona:
        return None
    text = str(email_content or "")
    section = _extract_profile_value(user_persona, ["section", "sec"])
    roll = _extract_profile_value(user_persona, ["roll no", "roll number", "roll", "enrollment"])
    course = _extract_profile_value(user_persona, ["course"])
    semester = _extract_profile_value(user_persona, ["semester", "sem"])

    if section:
        profile_section = _normalize_academic_token(section)
        mentioned_sections = _extract_section_candidates(text)
        if mentioned_sections and profile_section not in mentioned_sections:
            return "FILTERED_NOISE"

    if roll:
        profile_roll = _normalize_academic_token(roll)
        mentioned_rolls = _extract_labeled_mentions(text, ["roll no", "roll number", "roll", "enrollment"])
        if mentioned_rolls and profile_roll not in mentioned_rolls:
            return "FILTERED_NOISE"

    if semester:
        profile_semester = _normalize_academic_token(semester)
        mentioned_semesters = _extract_labeled_mentions(text, ["semester", "sem"])
        if mentioned_semesters and profile_semester not in mentioned_semesters:
            return "FILTERED_NOISE"

    if course:
        profile_course = _normalize_academic_token(course)
        mentioned_courses = _extract_labeled_mentions(text, ["course", "program", "branch", "department"])
        if mentioned_courses and profile_course not in mentioned_courses:
            return "FILTERED_NOISE"

    return None

def judge_email_relevance(email_content, raw_analysis, user_persona=""):
    """MiniMax relevance/category judge. Keeps the fast worker light and James focused on personality."""
    if not user_persona:
        return raw_analysis

    prompt = f"""
Boss profile and filtering rules:
{user_persona}

Initial workhorse result:
{json.dumps(raw_analysis)}

Email:
{email_content[:3500]}

Judge the email for the Boss. Decide whether it truly applies to the Boss, especially for university section, roll number, semester, course, specialization, and campus.
Use exactly one stable category. Prefer:
CLIENT_REPLY, SALES, PRODUCT_UPDATE, NEWSLETTER, RECEIPT, MEETING, HIRING, BILLING, LEGAL, TRAVEL, PERSONAL,
ASSIGNMENT_UPDATE, QUIZ_NOTICE, COURSE_ALERT, URGENT_ACTION, SUPPORT, STRATEGIC_FYI, FILTERED_NOISE.

Keep Assignment Update, Quiz Notice, and Course Alert as separate categories when they fit.
If the profile says STRICT MATCH and the email targets a different academic identity, use FILTERED_NOISE.
If the profile says BALANCED CAMPUS and it may still affect the Boss, use STRATEGIC_FYI or the precise academic category instead of noise.

Return ONLY JSON:
{{"category":"...", "relevance_score":0-100, "reason":"short reason", "summary_hint":"one useful sentence"}}
"""
    response = generate_ai_response(prompt, JAMES_SYSTEM_PROMPT, 0.1, 500, "JUDGE")
    parsed = extract_json(response)
    if not isinstance(parsed, dict):
        return raw_analysis

    category = _normalize_category(parsed.get("category"), f"{email_content}\n{parsed.get('reason', '')}")
    result = dict(raw_analysis)
    result["category"] = category
    reason = str(parsed.get("reason") or "").strip()
    hint = str(parsed.get("summary_hint") or "").strip()
    if hint and (not result.get("summary") or result.get("summary") == "Summary unavailable."):
        result["summary"] = hint
    if reason:
        result["james_note"] = f"Boss, relevance judge says: {reason[:220]}"
    result["relevance_score"] = parsed.get("relevance_score")
    mismatch = _persona_mismatch_category(email_content, user_persona)
    if mismatch:
        result["category"] = "FILTERED_NOISE" if _profile_filter_mode(user_persona) == "strict" else "COURSE_ALERT"
        result["relevance_score"] = min(int(result.get("relevance_score") or 20), 20)
        result["james_note"] = "Boss, this looks like another section, semester, course, campus, or roll number, so I blocked it from being treated as urgent."
    return result

def ocr_image_with_nvidia(image_bytes, mime_type="image/png"):
    """Best-effort OCR through an NVIDIA vision model. Fails closed if the endpoint/model is unavailable."""
    image_b64 = base64.b64encode(image_bytes).decode()
    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Extract all readable text from this image. Preserve tables and labels when possible. Return only the extracted text."},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}}
        ]
    }]
    for model in OCR_MODEL_CANDIDATES:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0,
                max_tokens=1200,
            )
            content = response.choices[0].message.content or ""
            if content.strip():
                return content
        except Exception as e:
            logger.warning(f"NVIDIA OCR unavailable for {model}: {e}")
    return ""

def _clean_summary_text(raw_text):
    """
    Last-resort cleaner: if the AI leaked its reasoning or structural artifacts (like ////)
    into the output, strip them and return a high-quality fallback if needed.
    """
    if not raw_text:
        return "Summary unavailable."
    
    # 1. Reject structural artifacts that leak from models (e.g. /////, ****, ----)
    if re.match(r'^[\s/\\\-*._=]+$', raw_text):
        return "Strategic intelligence pending."

    # 2. Common AI reasoning patterns that leak into output
    noise_patterns = [
        r"^(?:We need to|Let me|I need to|I'll|Here's|The email|This email).*?[.:]",
        r"^(?:Based on|Looking at|After reading|Upon review).*?[.:]",
        r"^(?:Summary|Result|Output|Answer|The following|The (?:provided|attached) email)\s*[:]\s*",
        r"^(?:The (?:content|email|message|summary) (?:is|contains|appears|seems|will)).*?[.:]",
        r"^.*?(?:Likely|Probably|It seems|I have|I will).*?[.:]\s*",
        r"^.*?(?:snippet|HTML|CSS|content is|subject of).*?[.:]\s*",
        r"^.*?summarize (?:this|the) email\s*[:]\s*",
    ]
    
    cleaned = raw_text.strip()
    for pattern in noise_patterns:
        cleaned = re.sub(pattern, '', cleaned, count=1, flags=re.IGNORECASE).strip()
    
    # If we stripped everything or result is too short, try grabbing last sentence
    if len(cleaned) < 10:
        # Take the last meaningful sentence from the original
        sentences = re.split(r'[.!?]\s+', raw_text.strip())
        meaningful = [s for s in sentences if len(s.strip()) > 10 and not re.match(r'^[\s/\\\-*._=]+$', s)]
        if meaningful:
            cleaned = meaningful[-1].strip().rstrip('.')
    
    # Final check: if still empty or just garbage
    if not cleaned or re.match(r'^[\s/\\\-*._=]+$', cleaned):
        return "Strategic intelligence pending."

    # Remove leading quotes/colons
    cleaned = cleaned.lstrip(':').lstrip('"').rstrip('"').strip()
    
    return cleaned[:800]

# ─── James: The Bureau Intern (Verification Layer) ───

def summarize_email(email_content, detail_level="medium", retry=False, pos_examples=None, neg_examples=None, user_identifier="the user", user_persona=""):
    """The Complete Bureau Pipeline: Nano 8B -> James 4B Verification."""
    length_hint = (
        "exactly 1 sentence" if detail_level == "short" 
        else "a full detailed paragraph" if detail_level == "detailed" 
        else "2-3 concise sentences"
    )
    
    # Dynamic Learning Injection (Smart Profile Learning)
    learning_context = ""
    if user_persona:
        learning_context += (
            f"\nBOSS PROFILE / ROLE / RELEVANCE RULES: {user_persona}\n"
            "Use this profile aggressively for triage. If the email appears to target a different section, class, roll number, role, team, geography, or audience than the Boss, do NOT mark it urgent or important. "
            "Classify mismatched administrative/course messages as STRATEGIC_FYI or FILTERED_NOISE unless the content clearly applies to the Boss.\n"
        )
    if pos_examples:
        learning_context += "\nYOUR PREFERRED STYLE (Follow this):\n" + "\n".join([f"- Email: {ex['input'][:200]}\n  Summary: {ex['output']}" for ex in pos_examples])
    if neg_examples:
        learning_context += "\nAVOID THIS STYLE:\n" + "\n".join([f"- Email: {ex['input'][:200]}\n  Summary: {ex['output']}" for ex in neg_examples])

    # --- PHASE 1: The Fast Engine (Nano 8B) ---
    worker_system = (
        f"You are James, the AI Intern for the Bureau. "
        f"CRITICAL: Create a useful category for this email based on the actual mailbox content and the Boss's profile.\n"
        f"Relevance rule: if the Boss profile includes section, roll number, role, team, or audience constraints, compare them against the subject/body before deciding importance.\n"
        f"Prefer one of these stable uppercase snake_case categories when it fits: CLIENT_REPLY, SALES, PRODUCT_UPDATE, NEWSLETTER, RECEIPT, MEETING, HIRING, BILLING, LEGAL, TRAVEL, PERSONAL, ASSIGNMENT_UPDATE, QUIZ_NOTICE, COURSE_ALERT, URGENT_ACTION, SUPPORT, STRATEGIC_FYI.\n"
        f"Only create a new category when none of those fit. Similar emails must share the same category name.\n\n"
        f"{learning_context}\n\n"
        f"Output valid JSON with double quotes only: {{\"summary\": \"...\", \"category\": \"...\", \"james_note\": \"A witty, specific, and personalized note for the Boss (user) starting with Boss, ...\"}}"
    )
    worker_prompt = f"James, analyze this for the Boss ({user_identifier}):\n\n{email_content[:2500]}"
    
    raw_text = generate_ai_response(worker_prompt, system_msg=worker_system, model_type="FAST", max_tokens=600)
    raw_analysis = _normalize_summary_payload(extract_json(raw_text), raw_text)
    raw_analysis = judge_email_relevance(email_content, raw_analysis, user_persona)
    persona_override = _persona_mismatch_category(email_content, user_persona)
    if persona_override:
        raw_analysis["category"] = persona_override
        raw_analysis["james_note"] = "Boss, this appears to target a different section, roll number, or audience than your saved profile, so I downgraded it."

    if len(email_content or "") < 900 and not retry and detail_level != "detailed":
        return {**raw_analysis, "was_corrected": False, "engine": "Fast Pass"}

    # --- PHASE 2: James (Mini 4B) Verification ---
    james_prompt = f"""
Original Email Content:
{email_content[:1500]}

Initial Analyst Summary:
{json.dumps(raw_analysis)}

James, review this summary. It's too structural and robotic. Rewrite it to be a natural 2-3 sentence executive recap for your Boss.
It should be {length_hint}. 
Humanize the tone, preserve or correct the category, and add your personal note for the boss.
CRITICAL RULE: The boss (user) owns the email '{user_identifier}'. Check the email signature. If the summary refers to the boss by their actual name in the third-person, rewrite it to use 'You/Your'.
Return ONLY valid JSON with this exact schema:
{{"summary": "...", "category": "ONE_STABLE_CATEGORY_FROM_THE_ALLOWED_LIST_OR_A_CLEAR_NEW_BUCKET", "james_note": "Boss, ..."}}
"""
    james_response_text = generate_ai_response(james_prompt, system_msg=JAMES_SYSTEM_PROMPT, model_type="JAMES", max_tokens=500)
    james_final = extract_json(james_response_text)
    
    if james_final:
        return {**_normalize_summary_payload(james_final, raw_analysis.get("summary", "")), "engine": "Mini 4B"}
    
    # Fallback if James fails
    return {
        **raw_analysis,
        "was_corrected": False,
        "engine": "Nano 8B"
    }

def generate_morning_brief(emails, tasks):
    email_lines = [
        f"- {e.get('category', 'STRATEGIC_FYI')}: {e.get('subject', '(No Subject)')} from {e.get('sender', 'Unknown')} :: {e.get('summary') or e.get('snippet', '')[:180]}"
        for e in (emails or [])[:8]
    ]
    task_lines = [
        f"- P{t.get('priority', 3)}: {t.get('task')} Deadline: {t.get('deadline') or 'none'}"
        for t in (tasks or [])[:8]
    ]
    prompt = (
        "Create a concise Morning Brief for the Boss.\n\n"
        f"Recent email intelligence:\n{chr(10).join(email_lines) or '- No analyzed emails yet.'}\n\n"
        f"Open action items:\n{chr(10).join(task_lines) or '- No open tasks.'}\n\n"
        "Return 4 short sections: Situation, Priority, Watchlist, Suggested First Move. Be specific and practical."
    )
    return generate_ai_response(prompt, JAMES_SYSTEM_PROMPT, 0.2, 550, "JAMES") or "Boss, the desk is quiet right now. Start with a mailbox sync and I will assemble the brief."

def generate_deep_dive(subject, sender, content, attachments=None, user_persona=""):
    attachment_lines = [
        f"- {a.get('filename') or 'unnamed'} ({a.get('mimeType') or 'unknown'}, {a.get('size', 0)} bytes)"
        for a in (attachments or [])[:10]
    ]
    evidence_prompt = (
        "Analyze this email deeply for the Boss. Do not produce a COO roadmap.\n\n"
        f"Boss persona/relevance rules:\n{user_persona or 'No persona provided.'}\n\n"
        f"Subject: {subject}\nSender: {sender}\n"
        f"Attachments:\n{chr(10).join(attachment_lines) or '- None detected'}\n\n"
        f"Email content:\n{(content or '')[:5000]}\n\n"
        "If attachment text is present, cite what it says. If only image attachments are detected, say OCR could not be performed in this deployment instead of pretending to read them."
    )
    analyst = generate_ai_response(evidence_prompt, DEEP_DIVE_SYSTEM_PROMPT, 0.1, 650, "DEEP")
    james_review_prompt = (
        f"Boss persona/relevance rules:\n{user_persona or 'No persona provided.'}\n\n"
        f"Analyst readout:\n{analyst}\n\n"
        "James, challenge this analysis. Focus on whether the email actually applies to the Boss. "
        "Call out section/roll/team/audience mismatches, over-urgent classifications, and missing attachment implications."
    )
    james = generate_ai_response(james_review_prompt, JAMES_SYSTEM_PROMPT, 0.15, 450, "JAMES")
    synthesis_prompt = (
        "Two MailPilot agents reviewed this email.\n\n"
        f"Evidence analyst:\n{analyst}\n\n"
        f"James persona/relevance review:\n{james}\n\n"
        "Synthesize the final Deep Dive for the Boss. Use these sections: Executive Readout, Persona/Relevance Verdict, Attachment Findings, Risks or Commitments, Recommended Next Move. "
        "Be decisive. If the email is for another section/roll/audience, say so clearly and downgrade urgency."
    )
    return generate_ai_response(synthesis_prompt, DEEP_DIVE_SYSTEM_PROMPT, 0.1, 850, "FAST") or analyst or james

def generate_reply(email_content, tone="professional", user_identifier="the user", user_details="", style_examples=None):
    """Draft Reply Pipeline: Deep 120B -> James 4B Polish."""
    style_context = ""
    if style_examples:
        style_context = "\nLINGUISTIC STYLE ANCHORS (Mirror the tone, length, and vocabulary of these past sent emails):\n" + "\n---\n".join(style_examples)

    # Step 1: Generate full draft with 120B
    deep_system = (
        f"You are drafting a {tone} email reply. "
        f"CRITICAL CONTEXT: You are writing on behalf of the owner of the email address '{user_identifier}'. "
        f"USER PERSONA DETAILS: {user_details if user_details else 'No specific details provided.'} "
        f"{style_context} "
        f"Look at the email signature or sender info to determine their real name. "
        f"Write from the first-person perspective ('I', 'my') as if you ARE that person. "
        f"Match the requested tone ({tone}) perfectly. "
        "Do not confuse the user's identity with others. ONLY output the reply text."
    )
    deep_prompt = f"Draft a reply to this email:\n\n{email_content[:3000]}"
    raw_draft = generate_ai_response(deep_prompt, system_msg=deep_system, model_type="DEEP", max_tokens=1000)
    if not raw_draft:
        raw_draft = generate_ai_response(deep_prompt, system_msg=deep_system, model_type="JAMES", max_tokens=700)
    if not raw_draft:
        return "I could not generate a reliable draft from this content. Please add more context and try again."

    # Step 2: James polishes the tone
    james_polish_prompt = (
        f"James, review this draft reply. Ensure it sounds natural, fits the '{tone}' tone perfectly, and is contextually accurate. "
        f"The author of the reply is the owner of '{user_identifier}'. "
        f"Check that the draft correctly uses first-person ('I', 'my') for the author. "
        f"Original Email for context: {email_content[:800]}\n\nDraft: {raw_draft}"
    )
    james_system = f"You are James the intern. Polish the provided email draft to match a {tone} tone. Output ONLY the polished draft text without any conversational preamble."
    
    polished = generate_ai_response(james_polish_prompt, system_msg=james_system, model_type="JAMES", max_tokens=1000)
    return polished or raw_draft
