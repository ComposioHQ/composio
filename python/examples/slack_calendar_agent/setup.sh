#!/bin/bash

# Check if Poetry is installed
if ! command -v poetry &> /dev/null
then
    echo "Poetry could not be found, installing..."
    # Install Poetry
    curl -sSL https://install.python-poetry.org | python3 -
    echo "Poetry has been installed."
else
    echo "Poetry is already installed."
fi

# Initialize the environment and install dependencies from pyproject.toml
echo "Installing dependencies..."
poetry install

# Login to your account
echo "Login to your Composio account"
poetry run composio login

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