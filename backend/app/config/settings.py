import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
    BASE_URL = "https://integrate.api.nvidia.com/v1"
    SESSION_SECRET = os.getenv("SESSION_SECRET")

    def __init__(self):
        if not self.SESSION_SECRET:
            # Fallback for development and initial deployment stabilization
            self.SESSION_SECRET = os.getenv("SECRET_KEY", "mailpilot-dev-secret-keep-it-safe-12345")
            if os.getenv("VERCEL") == "1":
                print("CRITICAL WARNING: SESSION_SECRET is not set. Using insecure fallback.")

settings = Settings()
