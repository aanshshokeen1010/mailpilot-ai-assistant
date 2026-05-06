import os
import logging
import pickle
import base64
import json
import re
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials as GoogleCredentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.auth.exceptions import RefreshError
from email.mime.text import MIMEText

import time
import hmac
import hashlib
from app.config.settings import settings

logger = logging.getLogger("mailpilot.gmail")

# Allow OAuth on localhost without HTTPS
if os.getenv("GMAIL_REDIRECT_URI", "").startswith("http://localhost") or not os.getenv("GMAIL_REDIRECT_URI"):
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

# Path Resolution
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(BASE_DIR, "config")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "credentials.json")
IS_VERCEL = os.environ.get("VERCEL") == "1"
WRITABLE_DIR = "/tmp" if IS_VERCEL else CONFIG_DIR
TOKEN_PATH = os.path.join(WRITABLE_DIR, "token.pickle")

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify", 
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]

class AuthRequiredError(Exception): pass

# ─── Cookie-based Credential Helpers ───

def serialize_creds(creds, user_email=None):
    """Convert Google credentials to a JSON dict for cookie storage."""
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else list(SCOPES),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
        "user_email": user_email,
        "exp": int(time.time()) + (7 * 24 * 60 * 60) # 7-day session validity
    }

def deserialize_creds(data):
    """Reconstruct Google credentials from a dict."""
    from datetime import datetime
    creds = GoogleCredentials(
        token=data.get("token"), refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"), client_secret=data.get("client_secret"),
        scopes=data.get("scopes", SCOPES)
    )
    if data.get("expiry"):
        try: creds.expiry = datetime.fromisoformat(data["expiry"]).replace(tzinfo=None)
        except: pass
    return creds

def creds_to_cookie(creds, user_email=None):
    """Serializes credentials and adds a cryptographic signature to prevent tampering."""
    payload = base64.urlsafe_b64encode(json.dumps(serialize_creds(creds, user_email)).encode()).decode()
    
    # Create HMAC signature
    signature = hmac.new(
        settings.SESSION_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload}.{signature}"

def creds_from_cookie(cookie_value):
    """Verifies and deserializes credentials from a signed cookie."""
    if not cookie_value: return None
    try:
        if '.' not in cookie_value:
            return None
            
        payload, signature = cookie_value.split('.', 1)
        
        # Verify signature
        expected_sig = hmac.new(
            settings.SESSION_SECRET.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            logger.error("SECURITY ALERT: Session cookie signature mismatch! Tampering attempt detected.")
            return None

        # Root Cause Fix: Handle missing padding in Base64 payload
        missing_padding = len(payload) % 4
        if missing_padding:
            payload += '=' * (4 - missing_padding)
            
        data = json.loads(base64.urlsafe_b64decode(payload).decode())
        
        # Verify Session Expiration
        if "exp" in data and time.time() > data["exp"]:
            logger.warning(f"Session expired for {data.get('user_email')}")
            return None
            
        return deserialize_creds(data)
    except Exception as e:
        logger.error(f"Cookie validation failed: {e}")
        return None

# ─── Email Body Parsing ───

def safe_b64decode(data):
    if not data: return ""
    missing_padding = len(data) % 4
    if missing_padding: data += '=' * (4 - missing_padding)
    try: return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
    except: return ""

def clean_body_text(text):
    """
    Strips HTML, CSS, tracking URLs, and technical boilerplate to give AI high-signal text.
    Optimized for high-throughput AI processing.
    """
    if not text: return ""
    
    # 1. Pre-process: Strip Style and Script blocks
    text = re.sub(r'<(style|script)[^>]*>.*?</\1>', '', text, flags=re.DOTALL | re.IGNORECASE)
    
    # 2. Strip tracking URLs (collapses long marketing URLs to avoid token bloat)
    # Replaces long URLs (>100 chars) with [Link]
    text = re.sub(r'https?://[^\s]{100,}', '[Link]', text)
    
    # 3. Robust HTML Tag Stripping (handles nested > in attributes)
    text = re.sub(r'<[^>]*>', ' ', text)
    
    # 4. Clean HTML Entities
    import html
    text = html.unescape(text)
    
    # 5. Remove common boilerplate noise
    noise = [
        r"privacy policy", r"terms of (?:service|use)", r"view in browser", 
        r"unsubscribe", r"click here to", r"all rights reserved"
    ]
    for pattern in noise:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        
    # 6. Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def extract_body(payload, depth=0):
    """
    Root Cause Fix: Prioritizes plain text and cleans HTML at the source.
    """
    if depth > 10: return ""
    
    # Priority 1: Find plain text parts
    parts = payload.get('parts', [])
    if parts:
        # First pass: look for plain text
        for part in parts:
            if part.get('mimeType') == 'text/plain':
                data = part.get('body', {}).get('data', '')
                if data: return safe_b64decode(data)
        
        # Second pass: look for HTML and clean it if no plain text exists
        for part in parts:
            if part.get('mimeType') == 'text/html':
                data = part.get('body', {}).get('data', '')
                if data: return clean_body_text(safe_b64decode(data))
        
        # Recursive pass for nested parts
        body = ""
        for part in parts:
            body += extract_body(part, depth + 1)
        return body
    
    # Handle non-multipart messages
    mime_type = payload.get('mimeType')
    data = payload.get('body', {}).get('data', '')
    if not data: return ""
    
    decoded = safe_b64decode(data)
    if mime_type == 'text/html':
        return clean_body_text(decoded)
    return decoded

# ─── Authentication ───

def authenticate_gmail(creds_cookie=None):
    """
    Authenticate via cookie. 
    Returns: (credentials, was_refreshed)
    """
    creds = None
    was_refreshed = False
    if creds_cookie:
        creds = creds_from_cookie(creds_cookie)
    
    if not creds: raise AuthRequiredError("Authentication required (Session expired)")
    
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(GoogleAuthRequest())
                was_refreshed = True
                logger.info("James: Refreshed Google OAuth token successfully.")
            except RefreshError:
                raise AuthRequiredError("Session refresh failed")
        else:
            raise AuthRequiredError("Authentication required")
    return creds, was_refreshed

def _get_redirect_uri():
    uri = os.getenv("GMAIL_REDIRECT_URI")
    if not uri: return "http://localhost:8002/api/oauth2callback"
    if not uri.endswith("/api/oauth2callback"):
        return f"{uri.rstrip('/')}/api/oauth2callback"
    return uri

def _load_client_config(redirect_uri):
    client_id = os.getenv("GMAIL_CLIENT_ID")
    client_secret = os.getenv("GMAIL_CLIENT_SECRET")
    if client_id and client_secret:
        return {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        }

    with open(CREDENTIALS_PATH, 'r') as f:
        client_config = json.load(f)
    ct = "web" if "web" in client_config else "installed"
    if "redirect_uris" not in client_config[ct]:
        client_config[ct]["redirect_uris"] = [redirect_uri]
    return client_config

def get_auth_url():
    if not (os.getenv("GMAIL_CLIENT_ID") and os.getenv("GMAIL_CLIENT_SECRET")) and not os.path.exists(CREDENTIALS_PATH):
        raise Exception(f"Missing credentials.json at {CREDENTIALS_PATH}")
    redirect_uri = _get_redirect_uri()
    client_config = _load_client_config(redirect_uri)
    flow = Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)
    auth_url, state = flow.authorization_url(prompt='consent', access_type='offline')
    # Return verifier so frontend can store it (avoids /tmp dependency on Vercel)
    return {"auth_url": auth_url, "state": state, "code_verifier": flow.code_verifier}

def exchange_code(code, state=None, code_verifier=None):
    """Exchange auth code for credentials. Returns the credentials object."""
    if not (os.getenv("GMAIL_CLIENT_ID") and os.getenv("GMAIL_CLIENT_SECRET")) and not os.path.exists(CREDENTIALS_PATH):
        raise Exception("Missing credentials")
    redirect_uri = _get_redirect_uri()
    client_config = _load_client_config(redirect_uri)
    flow = Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)
    flow.code_verifier = code_verifier
    flow.fetch_token(code=code)
    # Save to file as fallback for local dev
    try:
        with open(TOKEN_PATH, 'wb') as f: pickle.dump(flow.credentials, f)
    except Exception as e:
        logger.warning(f"Could not save token to file (expected on Vercel): {e}")
    return flow.credentials

# ─── Gmail Operations ───

def get_emails(creds_cookie=None):
    from app.services.task_store import get_setting # Break circular import
    creds, was_refreshed = authenticate_gmail(creds_cookie)
    
    # Extract user_email from the signed cookie securely
    user_email = None
    if creds_cookie and '.' in creds_cookie:
        try:
            payload = creds_cookie.split('.')[0]
            data = json.loads(base64.urlsafe_b64decode(payload).decode())
            user_email = data.get("user_email")
        except: pass

    service = build('gmail', 'v1', credentials=creds)
    try:
        limit = int(get_setting(user_email, "fetch_limit", "10"))
    except: limit = 10
    
    priority = get_setting(user_email, "fetch_priority", "all")
    query = "is:unread" if priority == "unread" else "is:important" if priority == "important" else ""
    
    try:
        # THREAD-AWARE FETCHING: Fetch threads instead of individual messages
        results = service.users().threads().list(userId='me', maxResults=limit, q=query).execute()
        threads = results.get('threads', [])
    except Exception as e:
        logger.error(f"Gmail API Thread List Error: {e}")
        return []

    if not threads: return []
    
    email_list = []
    
    def thread_callback(request_id, response, exception):
        if exception: 
            logger.error(f"Batch Thread Error: {exception}")
            return
        if not response or 'messages' not in response: return
        
        # Pick the LATEST message in the thread for strategic analysis
        latest_msg = response['messages'][-1]
        payload = latest_msg.get('payload', {})
        headers = payload.get('headers', [])
        
        try:
            email_list.append({
                "id": latest_msg['id'],
                "threadId": response['id'],
                "subject": next((h['value'] for h in headers if h['name'] == 'Subject'), "(No Subject)"),
                "sender": next((h['value'] for h in headers if h['name'] == 'From'), "Unknown"),
                "snippet": extract_body(payload)[:3000] or latest_msg.get('snippet', ''),
                "labels": latest_msg.get('labelIds', []),
                "internalDate": latest_msg.get('internalDate')
            })
        except Exception as e:
            logger.error(f"Failed to process thread message: {e}")
            
    # Execute batch request for full thread details
    batch = service.new_batch_http_request(callback=thread_callback)
    for thread in threads:
        batch.add(service.users().threads().get(userId='me', id=thread['id']))
    batch.execute()
    
    # Sort by date descending
    email_list.sort(key=lambda x: int(x.get('internalDate', 0)), reverse=True)
    return email_list

def send_email_direct(to, subject, body, creds_cookie=None):
    creds, was_refreshed = authenticate_gmail(creds_cookie)
    service = build("gmail", "v1", credentials=creds)
    message = MIMEText(body)
    message['to'] = to.split('<')[1].split('>')[0].strip() if '<' in to else to
    message['subject'] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return service.users().messages().send(userId="me", body={'raw': raw}).execute()

def get_user_info(service):
    try:
        # Get basic Gmail profile
        profile = service.users().getProfile(userId='me').execute()
        email = profile.get('emailAddress')
        messages_total = profile.get('messagesTotal')
        
        # Get extended profile (Name & Picture) using the userinfo endpoint
        # This requires the userinfo.profile scope
        user_info = {"email": email, "messages_total": messages_total, "name": None, "picture": None}
        
        try:
            # Using the discovery service to call the userinfo endpoint
            # Alternatively, we can use the people API if preferred, but userinfo is simpler for just name/pic
            userinfo_service = build('oauth2', 'v2', credentials=service._http.credentials)
            info = userinfo_service.userinfo().get().execute()
            user_info["name"] = info.get("name")
            user_info["picture"] = info.get("picture")
        except Exception as e:
            logger.warning(f"Could not fetch extended profile: {e}")
            
        return user_info
    except Exception as e:
        logger.error(f"Failed to fetch user info: {e}")
        return None

def archive_thread(thread_id: str, creds_cookie: str = None):
    """
    Tactical Archive: Removes the 'INBOX' label from a thread, effectively archiving it.
    """
    creds, was_refreshed = authenticate_gmail(creds_cookie)
    service = build("gmail", "v1", credentials=creds)
    try:
        service.users().threads().modify(
            userId='me', 
            id=thread_id, 
            body={'removeLabelIds': ['INBOX']}
        ).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to archive thread {thread_id}: {e}")
        return False

def get_gmail_service(creds_cookie=None):
    creds, was_refreshed = authenticate_gmail(creds_cookie)
    return build("gmail", "v1", credentials=creds)
