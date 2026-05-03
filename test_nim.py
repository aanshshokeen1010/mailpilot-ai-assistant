import os
import sys
from openai import OpenAI

# We need the API key from the environment or settings.
# Let's import the settings.
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from app.config.settings import settings

client = OpenAI(
    api_key=settings.NVIDIA_API_KEY,
    base_url=settings.BASE_URL,
    timeout=25.0
)

models = [
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "nvidia/nemotron-mini-4b-instruct",
    "nvidia/nemotron-3-super-120b-a12b"
]

for model in models:
    try:
        print(f"Testing {model}...")
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Say hello."}],
            max_tokens=10
        )
        print(f"SUCCESS {model}: {response.choices[0].message.content.strip()}")
    except Exception as e:
        print(f"ERROR {model}: {e}")
