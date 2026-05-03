import asyncio
from app.routes.email_routes import analyze_single, AnalyzeRequest
from fastapi import Request

async def main():
    class DummyRequest:
        def __init__(self):
            self.cookies = {}
    
    req = AnalyzeRequest(id="test1", snippet="Hello this is a test email.", retry=False)
    dummy = DummyRequest()
    
    result = await analyze_single(req, dummy)
    print("Result:", result)

if __name__ == "__main__":
    asyncio.run(main())
