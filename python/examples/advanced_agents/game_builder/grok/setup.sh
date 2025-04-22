#!/bin/bash

# Create a virtual environment
echo "Creating virtual environment..."
python3 -m venv ~/.venvs/grok_game_builder 

# Activate the virtual environment
echo "Activating virtual environment..."
source ~/.venvs/grok_game_builder/bin/activate

# Install libraries from requirements.txt 
echo "Installing libraries from requirements.txt..."
pip install -r requirements.txt

# Log in to Composio
composio login

# Copy env example to .env file or create empty .env
if [ -f ".env.example" ]; then
    echo "Copying .env.example to .env..."
    cp .env.example .env
elif [ ! -f ".env" ]; then
    echo "No .env.example found. Creating a new empty .env file..."
    touch .env
fi

# Prompt user to fill the .env file
echo "Please fill in the .env file with the necessary environment variables (e.g., XAI_API_KEY)."

echo "Setup completed successfully!" 