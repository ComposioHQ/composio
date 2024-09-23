#!/bin/bash

# Create a virtual environment named postgresagent
echo "Creating virtual environment..."
python3 -m venv postgresagent

# Activate the virtual environment
echo "Activating virtual environment..."
source postgresagent/bin/activate

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

# Create the PostgreSQL database and table
echo "Creating PostgreSQL database and table..."
DB_NAME="exampledb"
TABLE_NAME="orders"

# Connect to PostgreSQL and create the database and table
psql -U postgres -c "CREATE DATABASE $DB_NAME;"
psql -U postgres -d $DB_NAME -c "CREATE TABLE IF NOT EXISTS $TABLE_NAME (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    order_date DATE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL
);"

# Insert sample data
psql -U postgres -d $DB_NAME -c "INSERT INTO $TABLE_NAME (customer_id, order_date, total_amount)
SELECT
    floor(random() * 1000 + 1)::int,
    current_date - (random() * 365)::int,
    (random() * 1000)::decimal(10,2)
FROM generate_series(1, 100000);"

echo "PostgreSQL database and table created successfully with sample data!"

echo "Setup completed successfully!"