#!/bin/bash

# Create a virtual environment
echo "Creating virtual environment..."
python3 -m venv ~/.venvs/data_analyst || { echo "Failed to create virtual environment"; exit 1; }

# Activate the virtual environment
echo "Activating virtual environment..."
source ~/.venvs/data_analyst/bin/activate || { echo "Failed to activate virtual environment"; exit 1; }

# Install libraries from requirements.txt 
echo "Installing libraries from requirements.txt..."
pip install -r requirements.txt || { echo "Failed to install libraries"; exit 1; }

# Login to your account
echo "Login to your Composio account"
composio login || { echo "Failed to login to Composio"; exit 1; }

# Copy env backup to .env file
if [ -f ".env.example" ]; then
    echo "Copying .env.example to .env..."
    cp .env.example .env || { echo "Failed to copy .env.example to .env"; exit 1; }
else
    echo "No .env.example file found. Creating a new .env file..."
    touch .env || { echo "Failed to create .env file"; exit 1; }
fi

# Prompt user to fill the .env file
echo "Please fill in the .env file with the necessary environment variables."

echo "Setup completed successfully!"