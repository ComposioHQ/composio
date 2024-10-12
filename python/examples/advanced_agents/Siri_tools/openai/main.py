import os
import json
import asyncio
import websockets
import sounddevice as sd
import numpy as np
import base64
from dotenv import load_dotenv
from openai import OpenAI
from composio_openai import Action, ComposioToolSet
from composio.client.collections import TriggerEventData
import logging
import time

logging.basicConfig(level=logging.INFO)

# Load environment variables
load_dotenv()

# Initialize clients
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Audio settings
SAMPLE_RATE = 24000
CHANNELS = 1

# OpenAI Realtime API URL
REALTIME_API_URL = (
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
)


# Maintain a single WebSocket connection
class RealtimeAgent:
    def __init__(self):
        self.ws = None
        self.tools = composio_toolset.get_realtime_tools(
            actions=[
                Action.GMAIL_SEND_EMAIL,
                Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
                Action.GMAIL_CREATE_EMAIL_DRAFT,
            ]
        )
        print(self.tools)
        self.audio_queue = asyncio.Queue()
        self.audio_playback_queue = asyncio.Queue()
        self.running = True
        self.loop = asyncio.get_event_loop()
        self.audio_buffer_size = 4096  # Increase buffer size
        self.last_audio_sent_time = 0

        # Initialize the audio output stream for smooth playback
        self.audio_output_stream = sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
        )
        self.audio_output_stream.start()

    async def connect(self):
        headers = {
            "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
            "OpenAI-Beta": "realtime=v1",
        }
        self.ws = await websockets.connect(REALTIME_API_URL, extra_headers=headers)

        # Configure the session
        await self.ws.send(
            json.dumps(
                {
                    "type": "session.update",
                    "session": {
                        "turn_detection": {"type": "server_vad"},
                        "tools": self.tools,
                    },
                }
            )
        )

        logging.info("WebSocket connection established.")

    async def send_context(self, context):
        if self.ws and not self.ws.closed:
            # Send the conversation item
            payload = {
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": context}],
                },
            }
            await self.ws.send(json.dumps(payload))
            logging.info(f"Sent context: {context}")

            # Send response.create to prompt the assistant to respond
            await self.ws.send(
                json.dumps(
                    {
                        "type": "response.create",
                        "response": {
                            "modalities": ["text", "audio"],
                            "tools": self.tools,
                            "instructions": (
                                "You are an AI assistant that helps the user manage emails and Slack messages. "
                                "You receive the user's Slack messages. Your job is to tell the user about the new messages "
                                "and ask if they want to respond. You can also respond to messages via functions if the user asks you for it."
                            ),
                        },
                    }
                )
            )
            logging.info("Sent response.create to prompt assistant's reply.")
        else:
            logging.warning("WebSocket is not connected. Cannot send context.")

    async def send_audio(self):
        accumulated_audio = b""
        while self.running:
            try:
                audio_data = await self.audio_queue.get()
                accumulated_audio += audio_data
                self.audio_queue.task_done()

                # Send when accumulated_audio reaches the buffer size or after a time threshold
                current_time = time.time()
                if (
                    len(accumulated_audio) >= self.audio_buffer_size
                    or (current_time - self.last_audio_sent_time) > 0.5
                ):
                    encoded_audio = base64.b64encode(accumulated_audio).decode("utf-8")
                    logging.info(
                        f"Sending accumulated audio data of size: {len(accumulated_audio)} bytes."
                    )
                    if self.ws.closed:
                        logging.warning("WebSocket is closed. Exiting send_audio.")
                        break
                    # Append the accumulated audio data
                    await self.ws.send(
                        json.dumps(
                            {
                                "type": "input_audio_buffer.append",
                                "audio": encoded_audio,
                            }
                        )
                    )
                    # Commit the audio buffer
                    await self.ws.send(
                        json.dumps({"type": "input_audio_buffer.commit"})
                    )
                    logging.info("Audio buffer committed.")
                    # Reset the accumulator
                    accumulated_audio = b""
                    self.last_audio_sent_time = current_time
            except Exception as e:
                logging.error(f"Exception in send_audio: {e}")
                self.running = False
                break

    def audio_callback(self, indata, frames, time_info, status):
        audio_bytes = indata.tobytes()
        if len(audio_bytes) == 0:
            logging.warning("Captured empty audio buffer.")
        else:
            # Optionally, you can log the size of the captured audio buffer
            pass
        asyncio.run_coroutine_threadsafe(self.audio_queue.put(audio_bytes), self.loop)

    async def play_audio(self, audio_chunk):
        # Add the audio_chunk to the playback queue
        await self.audio_playback_queue.put(audio_chunk)

    async def audio_playback_handler(self):
        while self.running:
            try:
                audio_chunk = await self.audio_playback_queue.get()
                # Correctly convert the audio_chunk to a NumPy array
                audio_array = np.frombuffer(audio_chunk, dtype=np.int16)
                # Reshape the array to match the expected shape (frames, channels)
                audio_array = np.reshape(audio_array, (-1, CHANNELS))
                # Write the audio data to the output stream
                self.audio_output_stream.write(audio_array)
                self.audio_playback_queue.task_done()
            except Exception as e:
                logging.error(f"Exception in audio_playback_handler: {e}")
                break

    async def receive_events(self):
        while self.running:
            try:
                response = await self.ws.recv()
                logging.info(f"Received event: {response}")
                event = json.loads(response)
                if event["type"] == "input_audio_buffer.speech_started":
                    logging.info("Speech detected by server VAD.")
                elif event["type"] == "input_audio_buffer.speech_stopped":
                    logging.info("End of speech detected by server VAD.")
                elif event["type"] == "response.audio.delta":
                    audio_chunk = base64.b64decode(event["delta"])
                    await self.play_audio(audio_chunk)
                elif event["type"] == "response.function_call_arguments.done":
                    function_call = event["function_call"]
                    await self.handle_function_call(function_call)
            except websockets.exceptions.ConnectionClosedError as e:
                logging.error(f"WebSocket connection closed: {e}")
                self.running = False
                break
            except Exception as e:
                logging.error(f"Exception in receive_events: {e}")
                self.running = False
                break

    async def handle_function_call(self, function_call):
        function_name = function_call["name"]
        arguments = json.loads(function_call["arguments"])

        # Handle the function call using Composio
        result = composio_toolset.handle_tool_call(function_name, arguments)

        # Send the function call output back to the conversation
        await self.ws.send(
            json.dumps(
                {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "name": function_name,
                        "output": json.dumps(result),
                    },
                }
            )
        )

        # Trigger a new response to continue the conversation
        await self.ws.send(
            json.dumps(
                {
                    "type": "response.create",
                    "response": {
                        "modalities": ["text", "audio"],
                        "tools": self.tools,
                        "instructions": (
                            "You are an AI assistant that helps the user manage emails and Slack messages. "
                            "You receive the user's Slack messages. Your job is to tell the user about the new messages "
                            "and ask if they want to respond. You can also respond to messages via functions if the user asks you for it."
                        ),
                    },
                }
            )
        )

    async def start(self):
        while True:
            try:
                self.audio_queue = asyncio.Queue()
                self.audio_playback_queue = asyncio.Queue()
                self.running = True
                await self.connect()
                # Start the audio input stream
                stream = sd.InputStream(
                    samplerate=SAMPLE_RATE,
                    channels=CHANNELS,
                    callback=self.audio_callback,
                    dtype="int16",  # Ensure PCM16 format
                )
                with stream:
                    tasks = [
                        asyncio.create_task(self.send_audio()),
                        asyncio.create_task(self.receive_events()),
                        asyncio.create_task(self.audio_playback_handler()),
                    ]
                    await asyncio.gather(*tasks)
            except Exception as e:
                logging.error(f"Exception in agent.start(): {e}")
            logging.info("WebSocket connection closed. Reconnecting in 5 seconds...")
            await asyncio.sleep(5)

    async def handle_event(self, context):
        logging.info(f"Received event context: {context}")
        await self.send_context(context)

    async def send_audio_message(self, audio_base64):
        if self.ws and not self.ws.closed:
            payload = {
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_audio", "audio": audio_base64}],
                },
            }
            await self.ws.send(json.dumps(payload))
            logging.info("Sent audio message.")
        else:
            logging.warning("WebSocket is not connected. Cannot send audio message.")


# Composio listener
listener = composio_toolset.create_trigger_listener()
agent = RealtimeAgent()


@listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
def handle_gmail_message(event: TriggerEventData):
    payload = event.payload
    subject = payload.get("subject", "")
    sender = payload.get("from", "")
    context = f"New email from {sender} with subject: {subject}"
    asyncio.run(agent.handle_event(context))


@listener.callback(filters={"trigger_name": "slack_receive_message"})
def handle_slack_message(event: TriggerEventData):
    payload = event.payload
    message = payload.get("text", "")
    channel_id = payload.get("channel", "")
    user_id = payload.get("user", "")
    print(f"New Slack message in channel {channel_id} from user {user_id}: {message}")
    context = (
        f"New Slack message in channel {channel_id} from user {user_id}: {message}"
    )
    asyncio.run(agent.handle_event(context))


async def main():
    logging.info("AI Agent started. Listening for Slack messages and Gmail emails...")
    # Run the agent and listener concurrently
    await asyncio.gather(agent.start(), asyncio.to_thread(listener.listen))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Program terminated by user.")
