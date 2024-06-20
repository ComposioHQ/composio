#!/bin/bash

# Create a virtual environment named sqlagent
echo "Creating virtual environment..."
python3 -m venv sqlagent

# Activate the virtual environment
echo "Activating virtual environment..."
source sqlagent/bin/activate

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

# Prompt the user to enter the OPENAI_API_KEY
read -p "Enter your OPENAI_API_KEY: " OPENAI_API_KEY

# Update the .env file with the entered OPENAI_API_KEY
sed -i "s/^OPENAI_API_KEY=.*$/OPENAI_API_KEY=$OPENAI_API_KEY/" .env

echo "OPENAI_API_KEY has been set in the .env file"

echo "Please fill in the .env file with any other necessary environment variables."

echo "Setup completed successfully!"
