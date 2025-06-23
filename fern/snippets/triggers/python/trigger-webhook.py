from fastapi import FastAPI, Request
from typing import Dict, Any
import uvicorn
import json

app = FastAPI(title="Webhook Demo")

@app.post("/webhook")
async def webhook_handler(request: Request):
    # Get the raw payload
    payload = await request.json()
    
    # Log the received webhook data
    print("Received webhook payload:")
    print(json.dumps(payload, indent=2))
    
    # Return a success response
    return {"status": "success", "message": "Webhook received"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

