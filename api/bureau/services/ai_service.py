import os
import asyncio
import json
import re
import logging
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
    "DEEP": "nvidia/nemotron-3-super-120b-a12b"
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
        roadmap = await asyncio.to_thread(generate_ai_response, prompt, COO_SYSTEM_PROMPT, 0.1, 800, "DEEP")
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
    try:
        model = MODELS.get(model_type, MODELS["FAST"])
        messages = []
        if system_msg:
            messages.append({"role": "system", "content": system_msg})
        messages.append({"role": "user", "content": prompt})
        
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"AI Bureau Error ({model_type}): {e}")
        return ""

def extract_json(text):
    """Robustly extracts JSON from AI output, stripping all conversational noise."""
    if not text: return None
    try:
        # Standard cleaning
        clean = text.strip()
        clean = re.sub(r'```(?:json)?\s*([\s\S]*?)```', r'\1', clean).strip()
        
        # Strategy 1: Arrays FIRST (task extractor needs this)
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

def _clean_summary_text(raw_text):
    """
    Last-resort cleaner: if the AI leaked its reasoning into the output,
    strip common preamble patterns and return just the useful part.
    """
    if not raw_text:
        return "Summary unavailable."
    
    # Common AI reasoning patterns that leak into output
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
        meaningful = [s for s in sentences if len(s.strip()) > 10]
        if meaningful:
            cleaned = meaningful[-1].strip().rstrip('.')
    
    # Remove leading quotes/colons
    cleaned = cleaned.lstrip(':').lstrip('"').rstrip('"').strip()
    
    # Truncation logic: Allow more for detailed summaries
    return cleaned[:800] if cleaned else "Summary unavailable."

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
        learning_context += f"\nBOSS PROFILE / ROLE: {user_persona}\n"
    if pos_examples:
        learning_context += "\nYOUR PREFERRED STYLE (Follow this):\n" + "\n".join([f"- Email: {ex['input'][:200]}\n  Summary: {ex['output']}" for ex in pos_examples])
    if neg_examples:
        learning_context += "\nAVOID THIS STYLE:\n" + "\n".join([f"- Email: {ex['input'][:200]}\n  Summary: {ex['output']}" for ex in neg_examples])

    # --- PHASE 1: The Fast Engine (Nano 8B) ---
    worker_system = (
        f"You are James, the AI Intern for the Bureau. "
        f"CRITICAL: Categorize this email into exactly one strategic bucket based on the Boss's specific profile.\n"
        f"You can use standard buckets like 'ACTION_REQUIRED', 'STRATEGIC_FYI', or 'FILTERED_NOISE', or create a custom one (e.g., 'URGENT_FINANCIAL', 'TEAM_LOGISTICS', 'PERSONAL_MATTER') if it better represents the email's intent.\n\n"
        f"{learning_context}\n\n"
        f"Output JSON format: {{'summary': '...', 'category': '...', 'james_note': 'A witty, specific, and personalized note for the Boss (user) starting with \"Boss, ...\"'}}"
    )
    worker_prompt = f"James, analyze this for the Boss ({user_identifier}):\n\n{email_content[:2500]}"
    
    raw_text = generate_ai_response(worker_prompt, system_msg=worker_system, model_type="FAST", max_tokens=600)
    raw_analysis = extract_json(raw_text) or {"summary": _clean_summary_text(raw_text), "category": "STRATEGIC_FYI", "james_note": "Boss, I've triage this one for you. Let me know if you need a deep dive!"}

    # --- PHASE 2: James (Mini 4B) Verification ---
    # TACTICAL OPTIMIZATION: On Vercel Hobby (10s limit), skip Phase 2 to prevent engine timeout.
    if IS_VERCEL and not retry:
        return {
            **raw_analysis,
            "james_note": raw_analysis.get("james_note", "Boss, triage complete. I'm on standby!"),
            "was_corrected": False,
            "engine": "Nano 8B"
        }
    james_prompt = f"""
Original Email Content:
{email_content[:1500]}

Initial Analyst Summary:
{json.dumps(raw_analysis)}

James, review this summary. It should be {length_hint}.
Humanize the tone, add your personal note for the boss.
CRITICAL RULE: The boss (user) owns the email '{user_identifier}'. Check the email signature. If the summary refers to the boss by their actual name in the third-person, rewrite it to use 'You/Your'.
"""
    james_response_text = generate_ai_response(james_prompt, system_msg=JAMES_SYSTEM_PROMPT, model_type="JAMES", max_tokens=500)
    james_final = extract_json(james_response_text)
    
    if james_final:
        return {**james_final, "engine": "Mini 4B"}
    
    # Fallback if James fails
    return {
        **raw_analysis,
        "james_note": "Everything looks standard here, boss.",
        "was_corrected": False,
        "engine": "Nano 8B"
    }

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

    # Step 2: James polishes the tone
    james_polish_prompt = (
        f"James, review this draft reply. Ensure it sounds natural, fits the '{tone}' tone perfectly, and is contextually accurate. "
        f"The author of the reply is the owner of '{user_identifier}'. "
        f"Check that the draft correctly uses first-person ('I', 'my') for the author. "
        f"Original Email for context: {email_content[:800]}\n\nDraft: {raw_draft}"
    )
    james_system = f"You are James the intern. Polish the provided email draft to match a {tone} tone. Output ONLY the polished draft text without any conversational preamble."
    
    return generate_ai_response(james_polish_prompt, system_msg=james_system, model_type="JAMES", max_tokens=1000)
