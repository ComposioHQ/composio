import os
import json
import asyncio
import websockets
import sounddevice as sd
import numpy as np
import base64
from dotenv import load_dotenv
from composio_openai import Action, App, ComposioToolSet
from openai import OpenAI
from composio.client.collections import TriggerEventData

load_dotenv()

# Initialize clients and toolsets
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Audio settings
SAMPLE_RATE = 24000
CHANNELS = 1

# OpenAI Realtime API URL
REALTIME_API_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"

async def connect_to_realtime_api():
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
        "OpenAI-Beta": "realtime=v1",
    }
    return await websockets.connect(REALTIME_API_URL, extra_headers=headers)

async def send_audio(ws):
    def callback(indata, frames, time, status):
        audio_bytes = indata.tobytes()
        encoded_audio = base64.b64encode(audio_bytes).decode('utf-8')
        asyncio.run_coroutine_threadsafe(ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": encoded_audio
        })), asyncio.get_event_loop())

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, callback=callback):
        while True:
            await asyncio.sleep(0.1)
            await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))

async def play_audio(audio_chunk):
    sd.play(np.frombuffer(audio_chunk, dtype=np.int16), SAMPLE_RATE)
    sd.wait()

async def receive_events(ws):
    while True:
        response = await ws.recv()
        event = json.loads(response)

        if event["type"] == "response.audio.delta":
            audio_chunk = base64.b64decode(event["delta"])
            await play_audio(audio_chunk)
        elif event["type"] == "input_audio_buffer.speech_started":
            print("User started speaking.")
        elif event["type"] == "input_audio_buffer.speech_stopped":
            print("User stopped speaking.")

async def handle_realtime_conversation(context):
    ws = await connect_to_realtime_api()
    
    await ws.send(json.dumps({
        "type": "session.update",
        "session": {
            "turn_detection": {
                "type": "server_vad"
            },
        }
    }))

    await ws.send(json.dumps({
        "type": "input_text.append",
        "text": context
    }))

    tasks = [
        asyncio.create_task(send_audio(ws)),
        asyncio.create_task(receive_events(ws))
    ]

    await asyncio.gather(*tasks)

# Composio listener
listener = composio_toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def handle_slack_message(event: TriggerEventData):
    payload = event.payload
    message = payload.get("text", "")
    channel_id = payload.get("channel", "")
    
    context = f"New Slack message in channel {channel_id}: {message}"
    asyncio.run(handle_realtime_conversation(context))

@listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
def handle_gmail_message(event: TriggerEventData):
    payload = event.payload
    subject = payload.get("subject", "")
    sender = payload.get("from", "")
    
    context = f"New email from {sender} with subject: {subject}"
    asyncio.run(handle_realtime_conversation(context))

def execute_action(action, params):
    composio_toolset.execute_action(action=action, params=params)

# Main function to start the listener
def main():
    print("AI Agent started. Listening for Slack messages and Gmail emails...")
    listener.listen()

if __name__ == "__main__":
    main()

