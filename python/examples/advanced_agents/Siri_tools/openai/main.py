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
import queue
import types

logging.basicConfig(level=logging.INFO)

# Load environment variables
load_dotenv()

# Initialize clients
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Audio settings
SAMPLE_RATE = 24000
CHANNELS = 1
CHUNK = 1024  # Frames per buffer

# OpenAI Realtime API URL
REALTIME_API_URL = (
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
)

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
        self.audio_input_queue = queue.Queue()
        self.audio_playback_queue = queue.Queue()
        self.running = True
        self.assistant_speaking = False
        self.state = "WAITING_FOR_ASSISTANT"  # Initial state

        # Variables to handle function calls
        self.function_call_arguments = ""
        self.current_function_call = None

        # Audio buffer size for sending
        self.audio_buffer_size = 4096  # Adjust as needed

        # Audio input and output streams
        self.audio_input_stream = None
        self.audio_output_stream = None

        # New additions
        self.response_done_received = False
        self.delay_after_speaking = 2.5  # Delay in seconds (adjust as needed)

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
                        "modalities": ["text", "audio"],
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "silence_duration_ms": 400,
                            "prefix_padding_ms": 300,
                        },
                        "tools": self.tools,
                        "input_audio_format": "pcm16",
                        "output_audio_format": "pcm16",
                        "voice": "shimmer",
                        "instructions": (
                            "You are an AI assistant that helps the user manage emails and Slack messages."
                            "Try to be REALLY FUNNY sometimes to add some twists to your replies."
                            "When a new message arrives tagged with the user's ID, you should inform the user by reading it out loud."
                            "Please avoid reading the user ID in your replies."
                            "If the user wants to respond, you should collect their response and use the appropriate function"
                            "to send their message back to Slack or Gmail. "
                            "If they ask you to create a reply, form a proper response meeting all the requirements and try to be funny."
                            "You have access to the following functions: 'SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_EMAIL_DRAFT'. "
                            "Use function calls to perform actions on behalf of the user."
                        ),
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
                                "When a new message arrives, you should inform the user by reading it out loud. "
                                "If the user wants to respond, you should collect their response and use the appropriate function "
                                "to send their message back to Slack or Gmail. "
                                "You have access to the following functions: 'SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_EMAIL_DRAFT'. "
                                "Use function calls to perform actions on behalf of the user."
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
                # Get audio data from the queue
                while not self.audio_input_queue.empty():
                    audio_data = self.audio_input_queue.get()
                    accumulated_audio += audio_data
                    self.audio_input_queue.task_done()
                    logging.debug(f"Accumulated audio data: {len(audio_data)} bytes.")

                if self.state == "USER_SPEAKING" and accumulated_audio:
                    if len(accumulated_audio) >= self.audio_buffer_size:
                        encoded_audio = base64.b64encode(accumulated_audio).decode(
                            "utf-8"
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
                        logging.info(
                            f"Sent {len(accumulated_audio)} bytes of audio data to assistant."
                        )
                        accumulated_audio = b""
                else:
                    # Not user's turn to speak, discard accumulated audio
                    if accumulated_audio:
                        logging.debug(
                            f"Discarding {len(accumulated_audio)} bytes of audio data."
                        )
                        accumulated_audio = b""
                await asyncio.sleep(0.01)  # Sleep a bit to prevent tight loop
            except Exception as e:
                logging.error(f"Exception in send_audio: {e}")
                self.running = False
                break

    def audio_input_callback(self, indata, frames, time_info, status):
        if self.state == "USER_SPEAKING":
            audio_bytes = indata.tobytes()
            self.audio_input_queue.put(audio_bytes)
            logging.debug(f"Captured audio data: {len(audio_bytes)} bytes.")
        return None

    async def play_audio(self, audio_chunk):
        self.audio_playback_queue.put(audio_chunk)
        logging.debug(f"Queued {len(audio_chunk)} bytes of audio for playback.")

    async def audio_playback_handler(self):
        while self.running:
            try:
                # Check if there's audio data to play
                if not self.audio_playback_queue.empty():
                    audio_chunk = self.audio_playback_queue.get()
                    audio_array = np.frombuffer(audio_chunk, dtype=np.int16)
                    audio_array = audio_array.reshape(-1, CHANNELS)
                    self.audio_output_stream.write(audio_array)
                    logging.debug(f"Played {len(audio_chunk)} bytes of audio.")
                    self.audio_playback_queue.task_done()
                else:
                    await asyncio.sleep(0.01)
            except Exception as e:
                logging.error(f"Exception in audio_playback_handler: {e}")
                break

    async def check_and_set_user_speaking(self):
        if not self.assistant_speaking and self.response_done_received:
            # Introduce a delay before transitioning
            await asyncio.sleep(self.delay_after_speaking)
            self.state = "USER_SPEAKING"
            logging.info("Ready to capture user input.")
            # Reset the flag for the next response
            self.response_done_received = False

    async def receive_events(self):
        while self.running:
            try:
                response = await self.ws.recv()
                logging.debug(f"Received event: {response}")
                event = json.loads(response)

                if event["type"] == "input_audio_buffer.speech_started":
                    logging.info("User started speaking.")
                    self.state = "USER_SPEAKING"

                elif event["type"] == "input_audio_buffer.speech_stopped":
                    logging.info("User stopped speaking.")
                    self.state = "WAITING_FOR_ASSISTANT"
                    # Commit the audio buffer after user stops speaking
                    await self.ws.send(
                        json.dumps({"type": "input_audio_buffer.commit"})
                    )
                    logging.info("Audio buffer committed after user stopped speaking.")

                elif event["type"] == "response.audio.start":
                    logging.info("Assistant started speaking.")
                    self.assistant_speaking = True
                    self.state = "ASSISTANT_SPEAKING"

                elif event["type"] == "response.audio.end":
                    logging.info("Assistant finished speaking.")
                    self.assistant_speaking = False
                    await self.check_and_set_user_speaking()

                elif event["type"] == "response.done":
                    logging.info("Assistant response complete.")
                    self.response_done_received = True
                    await self.check_and_set_user_speaking()

                elif event["type"] == "response.audio.delta":
                    audio_chunk = base64.b64decode(event["delta"])
                    await self.play_audio(audio_chunk)

                elif event["type"] == "response.output_item.added":
                    item = event.get("item", {})
                    if item.get("type") == "function_call":
                        # Handle function call initiation
                        self.current_function_call = {
                            "name": item.get("name"),
                            "call_id": item.get("call_id"),
                            "response_id": event.get("response_id"),
                            "item_id": event.get("item_id"),
                            "output_index": event.get("output_index"),
                        }
                        self.function_call_arguments = ""
                        logging.info(
                            f"Function call initiated: {self.current_function_call['name']}"
                        )

                elif event["type"] == "response.function_call_arguments.delta":
                    delta = event.get("delta", "")
                    self.function_call_arguments += delta
                    logging.debug(f"Accumulated function call arguments: {delta}")

                elif event["type"] == "response.function_call_arguments.done":
                    arguments_json = self.function_call_arguments
                    call_id = event.get("call_id")
                    function_call = {
                        "arguments": arguments_json,
                        "call_id": call_id,
                    }
                    await self.handle_function_call(function_call)
                    logging.info("Function call arguments received and handled.")
                    self.function_call_arguments = ""
                    self.current_function_call = None

                elif event["type"] == "error":
                    logging.error(f"Error from API: {event}")

            except websockets.exceptions.ConnectionClosedError as e:
                logging.error(f"WebSocket connection closed: {e}")
                self.running = False
                break
            except Exception as e:
                logging.error(f"Exception in receive_events: {e}")
                self.running = False
                break

    async def handle_function_call(self, function_call):
        if not self.current_function_call:
            logging.error("No current function call to handle.")
            return

        function_name = self.current_function_call.get("name")
        call_id = self.current_function_call.get("call_id")
        arguments_json = function_call["arguments"]

        # Parse the arguments
        try:
            arguments = json.loads(arguments_json)
        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse function call arguments: {e}")
            arguments = {}

        logging.info(
            f"Function call received: {function_name} with arguments {arguments}"
        )
        print(function_call)

        # Directly execute the action
        try:
            result = composio_toolset.execute_action(
                action=Action(value=function_name),
                params=arguments,
                entity_id=None,
            )
            logging.info(f"Function call result: {result}")
        except Exception as e:
            logging.error(f"Error handling function call: {e}")
            result = {"status": "error", "message": str(e)}

        # Send the function call output back to the assistant
        await self.ws.send(
            json.dumps(
                {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "name": function_name,
                        "output": json.dumps(result),
                    },
                }
            )
        )
        logging.info(f"Sent function call output for '{function_name}'.")

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
                            "When a new message arrives, you should inform the user by reading it out loud. "
                            "If the user wants to respond, you should collect their response and use the appropriate function "
                            "to send their message back to Slack or Gmail. "
                            "You have access to the following functions: 'SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_EMAIL_DRAFT'. "
                            "Use function calls to perform actions on behalf of the user."
                        ),
                    },
                }
            )
        )
        logging.info("Sent response.create to continue the conversation.")

    async def start(self):
        while True:
            try:
                self.audio_input_queue = queue.Queue()
                self.audio_playback_queue = queue.Queue()
                self.running = True
                self.assistant_speaking = False
                self.state = "WAITING_FOR_ASSISTANT"
                await self.connect()

                # Start the audio input and output streams
                self.audio_input_stream = sd.InputStream(
                    samplerate=SAMPLE_RATE,
                    channels=CHANNELS,
                    dtype="int16",
                    callback=self.audio_input_callback,
                    blocksize=CHUNK,
                )
                self.audio_output_stream = sd.OutputStream(
                    samplerate=SAMPLE_RATE,
                    channels=CHANNELS,
                    dtype="int16",
                    blocksize=CHUNK,
                )
                self.audio_input_stream.start()
                self.audio_output_stream.start()

                logging.info("Audio streams started.")

                tasks = [
                    asyncio.create_task(self.send_audio()),
                    asyncio.create_task(self.receive_events()),
                    asyncio.create_task(self.audio_playback_handler()),
                ]
                await asyncio.gather(*tasks)
            except Exception as e:
                logging.error(f"Exception in agent.start(): {e}")
            finally:
                # Clean up resources
                if self.audio_input_stream is not None:
                    self.audio_input_stream.stop()
                    self.audio_input_stream.close()
                    logging.info("Audio input stream closed.")
                if self.audio_output_stream is not None:
                    self.audio_output_stream.stop()
                    self.audio_output_stream.close()
                    logging.info("Audio output stream closed.")
                if self.ws is not None and not self.ws.closed:
                    await self.ws.close()
                    logging.info("WebSocket connection closed.")
                self.running = False
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

def get_slack_channel_name(channel_id):
    response = composio_toolset.execute_action(action=Action.SLACK_LIST_ALL_SLACK_TEAM_CHANNELS_WITH_VARIOUS_FILTERS, params={"limit": 1000})
    if response.get('data', {}).get('ok'):
        channels = response['data'].get('channels', [])
        for channel in channels:
            if channel.get('id') == channel_id:
                return channel.get('name')
    return channel_id

def get_slack_user_name(user_id):
    response = composio_toolset.execute_action(action=Action.SLACK_RETRIEVE_DETAILED_USER_INFORMATION, params={"user": user_id})
    if response.get('data', {}).get('ok'):
        return response['data'].get('user', {}).get('real_name')
    return user_id

def get_current_user_info():
    response = composio_toolset.execute_action(action=Action.SLACK_RETRIEVE_A_USER_S_IDENTITY_DETAILS, params={})
    if response.get('data', {}).get('ok'):
        return response['data'].get('user', {}).get('id')
    return None

@listener.callback(filters={"trigger_name": "slack_receive_message"})
def handle_slack_message(event: TriggerEventData):
    payload = event.payload
    message = payload.get("text", "")
    channel_id = payload.get("channel", "")
    user_id = payload.get("user", "")
    channel_name = get_slack_channel_name(channel_id)
    user_name = get_slack_user_name(user_id)
    if "U056ZFA33QD" not in message:
        return
    logging.info(
        f"New Slack message in channel {channel_name} from user {user_name}: {message}"
    )
    context = (
        f"New Slack message in channel {channel_name} from user {user_name}: {message}"
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
