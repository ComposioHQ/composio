## 🤖🧩 Using Composio With AG2

Integrate Composio with AG2 (formerly AutoGen) so your agents can use external tools like GitHub.

### Goal

- **Star a repository on GitHub** using natural language commands through an AG2 agent.

### Installation and Setup

AG2 v0.11 requires Python >= 3.10, < 3.14.

```bash
# Install Composio AG2 package and AG2 with OpenAI support
pip install composio-ag2 "ag2[openai]"

# Option A: use an AG2 config file (path)
export OAI_CONFIG_LIST="OAI_CONFIG_LIST.json"

# Option B: use an AG2 config JSON string directly
# export OAI_CONFIG_LIST='[{"model":"gpt-5","api_key":"YOUR_API_KEY","api_type":"openai"}]'

# Option C: set your OpenAI key directly
export OPENAI_API_KEY="YOUR_API_KEY"

# Authenticate Composio
export COMPOSIO_API_KEY="YOUR_COMPOSIO_KEY"
# or: composio login

# Connect your GitHub account
composio-cli add github
```

### Run the demo

```bash
python ag2_demo.py
```
