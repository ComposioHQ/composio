#!/bin/bash

# Function to install packages
install_packages() {
  pip install crewai composio-langchain langchain-community huggingface_hub python-dotenv langchain
}

# Create a virtual environment
python3 -m venv investment_env

# Activate the virtual environment based on the OS
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  # Linux or macOS
  source investment_env/bin/activate
  install_packages
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  # Windows
  investment_env\Scripts\activate
  install_packages
else
  echo "Unknown OS type: $OSTYPE"
  exit 1
fi

# Create a .env file if it doesn't exist and add a placeholder for the OpenAI API key
if [ ! -f .env ]; then
  echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
  echo ".env file created with placeholder for OpenAI API key."
else
  echo ".env file already exists."
fi

# Prompt the user to fill in the .env file
echo "Please update the .env file with your actual OpenAI API key before running the main script."

# Run Composio login command
echo "Please log in to Composio:"
composio login

# Add SERPAPI to Composio
composio add serpapi

echo "Setup complete. To activate the virtual environment, use the appropriate command for your OS:"
echo "Linux/macOS: source investment_env/bin/activate"
echo "Windows (Command Prompt): investment_env\\Scripts\\activate"
echo "Windows (PowerShell): .\\investment_env\\Scripts\\Activate.ps1"
echo "Then, you can run 'python main.py' to execute the script."
