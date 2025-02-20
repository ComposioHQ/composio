#!/bin/bash

echo "Creating virtual environment..."
python3 -m venv loan_agent

# Activate the virtual environment
echo "Activating virtual environment..."
source loan_agent/bin/activate

# Install libraries from requirements.txt 
echo "Installing libraries from requirements.txt..."
pip install -r requirements.txt

# Copy env backup to .env file
if [ -f ".env.example" ]; then
    echo "Copying .env.example to .env..."
    cp .env.example .env
else
    echo "No .env.example file found. Creating a new .env file..."
    touch .env
fi

echo "Authenticating with Composio..."
composio add googledocs
# Prompt the user to enter the GEMINI_API_KEY
read -p "Enter your GEMINI API KEY: " GEMINI_API_KEY

# Update the .env file with the entered GEMINI_API_KEY
sed -i "s/^GEMINI_API_KEY=.*$/GEMINI_API_KEY=$GEMINI_API_KEY/" .env

echo "GEMINI_API_KEY has been set in the .env file"

echo "Please fill in the .env file with any other necessary environment variables."

echo "Setup completed successfully!"
