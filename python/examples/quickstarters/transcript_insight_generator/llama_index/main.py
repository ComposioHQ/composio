import os
from altair import param
import dotenv
import time
from pytube import Channel
from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.readers.youtube_transcript import YoutubeTranscriptReader
from llama_index.llms.openai import OpenAI

# Load environment variables
dotenv.load_dotenv()

# Initialize the toolset and reader
toolset = ComposioToolSet()
loader = YoutubeTranscriptReader()

# Get tools for executing actions
tools = toolset.get_tools(actions=[Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL])

# Initialize OpenAI LLM
llm = OpenAI(model='gpt-4o')


# Dictionary to track the last processed video for each channel
last_processed_videos = {}

slack_channel = input('Enter the slack channel you want it to ping the message on:')
youtube_channel_id = input('Enter the name of the channel id (Channel id is not the same as channel name, for example: t3dotgg is the channel name and "UCbRP3c757lWg9M-U7TyEkXA" is the channel id) which you want to poll:')
# Function to get the latest video from a channel
def get_latest_video():
# Assuming the data is stored in a variable called polled_channel
    polled_channel = toolset.execute_action(
        action=Action.YOUTUBE_LIST_CHANNEL_VIDEOS,
        params={
            "channelId":youtube_channel_id, #You can change the youtube channel here, get the channel id of the youtube channel
            "maxResults":40
        },
    )
    # Extract the items
    items = polled_channel["data"]["response_data"]["items"]

    # Sort items by publish time in descending order
    sorted_items = sorted(items, key=lambda x: x["snippet"]["publishedAt"], reverse=True)

    # Get the latest video
    latest_video = sorted_items[0]

    # Extract the video URL
    latest_video_url = f"https://www.youtube.com/watch?v={latest_video['id']['videoId']}"

    print(f"The latest video URL is: {latest_video_url}")
    return latest_video_url


# Poll channels for new videos every 1 minute
while True:
    try:
        latest_url = get_latest_video()
        
        # Load transcript from the video link
        documents = loader.load_data(ytlinks=[latest_url])
        transcript = ''.join(doc.text for doc in documents)
        
        # Summarize the transcript
        summarized_text = llm.complete(f"Summarize this transcript: {transcript}")
        
        # Send the summarized text to Slack
        toolset.execute_action(
            Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
            {},
            text=f"Summarized video: {summarized_text}, Link: {latest_url} Ping on my {slack_channel} channel",
        )
        print(f"Message sent for video: {latest_url}")

    except Exception as e:
        print(f"Error occurred: {e}")
    
    # Wait for 1 minute before checking again
    interval = 60
    print(f'Checking again in {interval} seconds')
    time.sleep(interval)
