# PostgreSQL Agent Guide

This guide provides steps to create a PostgreSQL agent that leverages Langchain, Composio, and ChatGPT to execute PostgreSQL queries and document them. Ensure you have Python 3.8 or higher installed.

## Steps to Run

1. Navigate to this Project Directory:
   ```sh
   cd python/examples/postgres_agent/
   ```

2. Run the Setup File:
   Make the setup.sh script executable (if necessary):
   ```shell
   chmod +x setup.sh
   ```
   Execute the setup.sh script:
   ```shell
   ./setup.sh
   ```
   Fill in the `.env` file with your secrets, including PostgreSQL connection details.

3. Run the Python Script:
   ```shell
   python main.py
   ```

Your PostgreSQL operations should be performed as described by the script, with queries executed and results logged to a file.

Note: Make sure you have PostgreSQL installed and running, and that the user has the necessary permissions to create databases and tables.