# Discord AI Agent

🤖 Meet our new AI made using [**composio**](https://www.composio.dev/) & [**crew AI**](https://docs.crewai.com/)! 🎉 This bot connects with your **Google Calendar**, making it a breeze to manage all your calendar activities right from _discord_. 💬🔗

<br />

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#-demo">Demo</a></li>
    <li><a href="#-features">Features</a></li>
    <li><a href="#-how-i-used-composio">How I Used Composio?</a></li>
    <li>
      <span>Getting Started</span>
      <ul>
        <li><a href="#-prerequisites">Prerequisites</a></li>
        <li><a href="#-steps-to-run">Steps to Run</a></li>
      </ul>
    </li>
    <li><a href="#%EF%B8%8F-project-structure">Project Structure</a></li>
    <li><a href="#-contributing">Contributing</a></li>
    <li><a href="#-acknowledgments">Acknowledgments<a/></li>
    <li><a href="#-license">License</a></li>
  </ol>
</details>

## 🎥 DEMO
[![demo video](https://img.youtube.com/vi/___DcDDQK-k/0.jpg)](https://www.youtube.com/watch?v=___DcDDQK-k)

## 📙 Features
You can scheduled events just by normal chatting with our bot and you can:

- **Create** events even by _adding someone via email, create google meeting room_ and all the neccessary features.
- **Find** upcoming events.
- **Update** & **Delete** existing events.
- **Create Quick** events.
- **Remove attendee** from an event

## 🤔 How I used composio?
**Composio** was very _crucial and reliable tool_ for making my project. It helped me to make my agentic tools for the agent **much more faster** and **in an easy way** acting like a **pipeline** between _agent_ and _google calendar_. It would really took me many more days if done without this 🔥.

## 🫳 Prerequisites
You should have

- Python 3.8 or higher
- GEMINI API KEY
- COMPOSIO API KEY
- Discord Bot Token
- And an [integration id](https://docs.composio.dev/api-reference/integrations/create-a-new-integration) from composio.

## 👣 Steps to Run
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

## 🏛️ Project structure

```bash
├── utils
    ├── calendar.py
    └── manage_events.py
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
├── main.py
├── requirements.txt
├── setup.sh
└── tools.py
```

## 🤗 Contributing
1. Fork the repository.
2. Create a new branch: `git checkout -b feature-name`.
3. Make your changes.
4. Push your branch: `git push origin feature-name`.
5. Create a pull request.

## ✍ Acknowledgments
This project couldn't be there if they didn't be there!
- [Composio](https://composio.dev/)
- [discord.py](https://discordpy.readthedocs.io/en/stable/)
- [crew AI](https://docs.crewai.com/)
- [Gemini](https://gemini.google.com/app)

Even something was gone wrong while making this project but composio team helped me to over come the issues and I am really thankful to it!

## 🧾 License
This project is licensed under the [MIT License](LICENSE).

