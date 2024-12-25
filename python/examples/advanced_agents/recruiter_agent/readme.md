# Recruiter Agent

This guide offers comprehensive instructions for creating a Recruiter Agent that utilizes Composio and agentic frameworks like LlamaIndex and ChatGPT. This agent is designed to effectively identify candidates for your business and compile all candidate data into a spreadsheet.

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
python cookbook/python-examples/advanced_agents/recruiter_agent/main.py
```
