# Create a virtual environment
echo "Make sure you have python 3.10 installed"
echo "Creating virtual environment..."
python3 -m virtualenv venv

# Activate the virtual environment
echo "Activating virtual environment..."
source ./venv/bin/activate

# Install libraries from requirements.txt 
echo "Installing libraries from requirements.txt..."
pip install -r requirements.txt

composio add notion
composio add slack

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