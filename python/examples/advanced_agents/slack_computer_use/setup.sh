#!/bin/bash

echo "Setting up Slack Computer Control Agent..."

# Create virtual environment
echo "Creating virtual environment..."
python3.10 -m venv venv
source venv/bin/activate

# Install dependencies
echo "Installing required packages..."
pip3.10 install -r requirements.txt

composio add slack
composio triggers enable SLACK_RECEIVE_MESSAGE

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOL
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

EOL
    echo ".env file created. Please fill in your API keys and tokens."
else
    echo ".env file already exists."
fi

# Make the script executable
chmod +x slack_to_computer.py

echo "Setup complete! Please:"
echo "1. Fill in your API keys in the .env file"
echo "2. Run 'python slack_to_computer.py' to start the agent" 