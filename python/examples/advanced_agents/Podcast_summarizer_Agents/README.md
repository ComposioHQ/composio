# Podcast_summarizer_Agents
Summarizing a whole podcast form youtube and send it as a slack message to a channel using composio and crewai.
Simply input the YouTube podcast URL and your preferred Slack channel—The Crew handles the rest, summarizing the content and delivering it seamlessly.
 ###### The below images is how the crew executes
<img width="1509" alt="test_run" src="https://github.com/siddartha-10/Podcast_summarizer_Agents/assets/107453857/c73485cd-0360-4088-818a-176f9c4d84b8">

###### This is the slack that crew send
<img width="1073" alt="Slack_message" src="https://github.com/siddartha-10/Podcast_summarizer_Agents/assets/107453857/3b1f9d09-5d6d-4e5a-8294-ad6d30a33bf7">

###### inputs for the above execution
```bash
youtube_url = https://www.youtube.com/watch?v=7T4-aEuGajI
slack_channel = "a-sumary-channel" (noticed a Typo).
```

# setup:-

##### clone the repository
```bash
 git clone https://github.com/siddartha-10/Podcast_summarizer_Agents.git
```

##### Install the packages
```bash
pip install -r requirements.txt
```

##### connecting composio with slack
```bash
https://docs.composio.dev/apps/slack
```

##### Time to spin up the application
```bash
streamlit run main.py
```

# Sample run Video

https://github.com/siddartha-10/Podcast_summarizer_Agents/assets/107453857/ff4b3ef6-4f9f-46fe-a533-8f03187863fa



