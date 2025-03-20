#!/bin/bash

echo "Setting up Security Analysis Agent..."

# Create virtual environment
echo "Creating virtual environment..."
python3.10 -m venv venv
source venv/bin/activate

# Install dependencies
echo "Installing required packages..."
pip3.10 install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOL
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Composio Configuration
COMPOSIO_API_KEY=your_composio_api_key_here
EOL
    echo ".env file created. Please fill in your API keys."
else
    echo ".env file already exists."
fi

# Make the script executable
chmod +x main.py

echo "Setup complete! Please:"
echo "1. Fill in your API keys in the .env file"
echo "2. Run 'python main.py' to start the security analysis" 