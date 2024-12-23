# Content Writing Agent Guide

This guide provides detailed steps to create a Content Writing Agent that leverages Composio, agentic frameworks such as LlamaIndex and Groq to create a complete content writing and posting pipeline. Ensure you have Python 3.8 or higher installed.


## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `main.py`, `requirements.txt`, and `README.md` files are located. For example:
```sh
cd path/to/project/directory
```

### 1. Run the Setup File
Make the setup.sh Script Executable (if necessary):
On Linux or macOS, you might need to make the setup.sh script executable:
```shell
chmod +x setup.sh
```
Execute the setup.sh script to set up the environment and install dependencies:
```shell
./setup.sh
```
Now, fill in the `.env` file with your secrets.

### 2. Run the Python Script
```shell
python cookbook/python-examples/advanced_agents/content_writing_agent/llamaindex/main.py
```

