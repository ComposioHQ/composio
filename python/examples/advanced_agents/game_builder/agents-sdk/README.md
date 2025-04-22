# AI Game Builder Agent

This project uses an AI agent powered by OpenAI's GPT-4.1 and Composio tools to design and create simple games using the `pygame` library in Python.

## Setup

1.  **Prerequisites**: Ensure you have Python 3.10 installed.
2.  **Clone the repository** (if you haven't already).
3.  **Navigate to the directory**:
    ```bash
    cd python/examples/advanced_agents/game_builder/agents-sdk
    ```
4.  **Run the setup script**: This will create a virtual environment, install dependencies, and set up your `.env` file.
    ```bash
    bash setup.sh
    ```
    *Note: You might need to make the script executable first: `chmod +x setup.sh`*
5.  **Configure Environment Variables**: Open the `.env` file created by the setup script and add your API keys:
    ```dotenv
    OPENAI_API_KEY=your_openai_api_key
    COMPOSIO_API_KEY=your_composio_api_key # Optional, depending on tools used
    ```
6.  **Activate the virtual environment**:
    ```bash
    source .venv/bin/activate
    ```

## Usage

Run the main script and follow the prompts:

```bash
python3.10 main.py
```

The script will ask you what kind of game you want to build. The AI agent will then attempt to generate the Python code for the game using `pygame` and execute it.