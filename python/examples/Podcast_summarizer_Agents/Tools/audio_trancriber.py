from crewai_tools import tool
from pytube import YouTube
import whisper
@tool("Audio Transribe tool")
def audio_transcriber_tool(url):
    """
    Extracts audio and transcribe the audio from a YouTube video given its URL and summarizes it.

    Parameters:
    - url (str): The URL of the YouTube video from which audio will be extracted.

    Returns:
    str: A string containing:
        - The summarized version of the Transcribed Youtube URL
    """
    yt = YouTube(url)
    video = yt.streams.filter(only_audio=True).first()
    out_file = video.download()
    video_details = {
        "name": yt.title,
    }
    whisper_model = whisper.load_model("small")
    result = whisper_model.transcribe(out_file)
    return result["text"]