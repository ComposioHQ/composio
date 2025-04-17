# Tweet Simulator Agent Guide

This guide provides detailed steps to create a Tweet Simulator Agent that leverages Llama 4 and Composio, featuring a web interface built with FastAPI. Ensure you have Python 3.10 or higher installed.


## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `backend_main.py`, `requirements.txt`, and `README.md` files are located. For example:
```sh
# Make sure you are in the root of the composio repository first
cd python/examples/advanced_agents/tweet-simulator/llama-4
```

### 1. Run the Setup File
Make the setup.sh Script Executable (if necessary):
On Linux or macOS, you might need to make the setup.sh script executable:
```shell
chmod +x setup.sh
```
Execute the setup.sh script to set up the environment and install dependencies. This will also activate the virtual environment (`~/.venvs/tweet_simulator`).
```shell
./setup.sh
```
Now, fill in the `.env` file with your secrets (like `GROQ_API_KEY`).

### 2. Activate Virtual Environment (if not already active)
If you open a new terminal, you'll need to activate the virtual environment created by the setup script:
```shell
source ~/.venvs/tweet_simulator/bin/activate
```

### 3. Run the FastAPI Application
Use `uvicorn` to run the `backend_main.py` script:
```shell
uvicorn backend_main:app --reload --port 8000
```
*   `--reload`: Enables auto-reloading when code changes are detected.
*   `--port 8000`: Specifies the port to run the application on.

### 4. Access the Application
Open your web browser and navigate to:
```
http://localhost:8000
```
You should see the Tweet Simulator interface. Enter a topic and watch the agents generate tweets!

