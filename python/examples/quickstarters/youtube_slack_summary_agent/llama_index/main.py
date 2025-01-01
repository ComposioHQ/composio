import os
import dotenv
from composio_llamaindex import App, ComposioToolSet, Action, Trigger
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.readers.youtube_transcript import YoutubeTranscriptReader
loader = YoutubeTranscriptReader()
dotenv.load_dotenv()

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL])
listener = toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": Trigger.SLACK_RECEIVE_MESSAGE})
def handle_callback_function(event):
    try:
        print(event)
        payload= event.payload
        print(payload)
        link = payload['text'][1:-2]
        channel_id = payload['channel']
        print('channel id')
        documents = loader.load_data(
        ytlinks=[link])
        print(documents)
        transcript = ''
        for d in documents:
            transcript+=d.text
        print(transcript)
        llm = OpenAI(model='gpt-4o')
        summarized_text = llm.complete(f"Summarize this transcript: {transcript}")
        toolset.execute_action(
            Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
            {},
            text=f'message: {summarized_text}, channel: {channel_id}'
        )
        print('Message sent')
    except Exception as E:
        print("No youtube link found")


print("Listening")
listener.wait_forever()
