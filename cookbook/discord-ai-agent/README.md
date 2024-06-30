# Discord AI Agent

🤖 Meet our new AI made using [**composio**](https://www.composio.dev/) & [**crew AI**](https://docs.crewai.com/)! 🎉 This bot connects with your **Google Calendar**, making it a breeze to manage all your calendar activities right from _discord_. 💬🔗
<br />
<br />

## Features
You can scheduled events just by normal chatting with our bot and you can:

- **Create** events even by adding someone via email, create google meeting room and all the neccessary features.
- **Find** upcoming events.
- **Update** & **Delete** existing events.
- **Create Quick** events.
- **Remove attendee** from an event

## Prerequisites
You should have

- Python 3.8 or higher
- GEMINI API KEY
- COMPOSIO API KEY
- Discord Bot Token
- And an [integration id](https://docs.composio.dev/api-reference/integrations/create-a-new-integration) from composio.

## Steps to Run
**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `main.py`, `requirements.txt`, and `README.md` files are located. For example:
```shell
cd path/to/project/directory
```

### 1. Run the Setup File
Make the setup.sh Script Executable (if necessary):
On Linux or macOS, you might need to make the setup.sh script executable:
```shell
chmod +x setup.sh
```
Execute the setup.sh script to set up the environment, install dependencies, login to composio and 
add necessary tools:
```shell
./setup.sh
```
Now, Fill in the `.env` file with your secrets.

### 2. Run the python script
```shell
python3 main.py
```

