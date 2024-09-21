from Podcast_Summarizer_AI_Agent import PodSumCrew
import streamlit as st

st.set_page_config(page_title="Podcast Summary App", layout="centered")

def run():
    st.title("Podcast Summary App")

    podcast_url = st.text_input("Enter the URL of the Podcast you want to summarize")
    slack_channel = st.text_input("Enter the Slack channel name")

    if st.button("Summarize Podcast"):
        if podcast_url and slack_channel:
            inputs = {'youtube_url': podcast_url, "slack_channel": slack_channel}
            result = PodSumCrew().crew().kickoff(inputs=inputs)
            st.write(result)
        else:
            st.write("podcast_url or slack channel is empty")

if __name__ == "__main__":
    run()