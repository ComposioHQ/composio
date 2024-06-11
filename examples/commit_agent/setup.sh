#!/bin/bash

# Create a virtual environment
echo "Creating virtual environment..."
python3 -m venv ~/.venvs/commit_agent

# Activate the virtual environment
echo "Activating virtual environment..."
source ~/.venvs/commit_agent/bin/activate

# Install libraries from requirements.txt 
if [ -f "requirements.txt" ]; then
    echo "Installing libraries from requirements.txt..."
    pip install -r requirements.txt
else
    echo "Installing specified libraries..."
    pip install -U composio-crewai crewai flask langchain_openai python-dotenv
fi


# Login to your account
echo "Login to your Composio acount"
composio composio login

# Add trello tool
echo "Add Trello tool. Finish the flow"
composio add trello


# Copy env backup to .env file
if [ -f ".env.example" ]; then
    echo "Copying .env.example to .env..."
    cp .env.example .env
else
    echo "No .env.example file found. Creating a new .env file..."
    touch .env
fi

# Prompt user to fill the .env file
echo "Please fill in the .env file with the necessary environment variables."

echo "Setup completed successfully!"
