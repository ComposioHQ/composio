# Grok Game Builder Agent Example

This script demonstrates using the Grok-3 Mini model (via the OpenAI-compatible API) as an AI agent capable of developing games using Pygame. It leverages Composio tools for file operations (`FileTool`) and shell execution (`ShellTool`).

## Features

- Uses Grok-3 Mini for game development logic.
- Integrates Composio tools (`FileTool`, `ShellTool`) for agent actions.
- Develops Pygame applications based on user prompts.
- Saves generated game code to a file.
- Executes the generated game code.

## Setup

1.  **Run the setup script:**
    ```bash
    bash setup.sh
    ```
    This will:
    *   Create and activate a Python virtual environment (`~/.venvs/grok_game_builder`).
    *   Install the required Python packages from `requirements.txt`.
    *   Log you into Composio.
    *   Create a `.env` file (copying `.env.example` if it exists).

2.  **Configure Environment Variables:**
    Edit the `.env` file and add your XAI API key:
    ```dotenv
    XAI_API_KEY=your_xai_api_key_here
    ```

## Usage

1.  **Activate the virtual environment (if not already active):**
    ```bash
    source ~/.venvs/grok_game_builder/bin/activate
    ```

2.  **Run the script:**
    ```bash
    python grok-3-mini.py
    ```
    The script will prompt the Grok model to create a Flappy Bird game, save it to `flappy_bird.py`, and then attempt to run it using the ShellTool.

## Requirements

- Python 3
- An XAI API Key (set in the `.env` file)
- Composio Account (log in via `composio login` during setup)
- Dependencies listed in `requirements.txt`. 