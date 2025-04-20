#!/bin/bash

# Create a virtual environment
echo "Creating virtual environment..."
python3 -m venv venvs/document_rag

# Activate the virtual environment
echo "Activating virtual environment..."
source venvs/document_rag/bin/activate

# Install libraries from requirements.txt 
echo "Installing libraries from requirements.txt..."
pip install -r requirements.txt

# Create .env file for OpenAI API key
echo "Creating .env file..."
touch .env

# Add OpenAI API key prompt to .env
echo "Adding OpenAI API key prompt to .env file..."
echo "# Add your OpenAI API key below" > .env
echo "OPENAI_API_KEY=" >> .env

echo "Adding COMPOSIO API key prompt to .env file..."
echo "# Add your COMPOSIO API key below" > .env
echo "COMPOSIO_API_KEY=" >> .env

echo "Please add your OpenAI API key to the .env file"
echo "Setup completed successfully!"