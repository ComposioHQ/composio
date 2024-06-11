# Commit Agent
> Fork and Clone this repository if needed!

## Introduction
This project is an example which uses Composio to help you keep your GitHub repository and Trello board in sync. 
It automatically creates Trello cards for TODO comments and commit messages from your GitHub patches, ensuring your tasks are always 
up-to-date and organized.

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
Now, Fill in the .env file with your secrets.
### 2. Retrieve Trello Board List
Go to your trello board, add `.json` to the end of the url. Search the corresponding list ids for the boards. Use this in your `.env` file.
### 3. Expose your local server to the internet using ngrok
```shell
ngrok <port_number>
```
Retrieve the ngrok url from here. Use it in the nest step.
### 4. Setup and Configure triggers
> Triggers are a set of predefined conditions. When these conditions are met, a webhook is triggered which has some sort of payload. 
```shell
# Set CallBack URL 
composio triggers callbacks set "https://<ngrok-url>/webhook"

# Enable Trigger
composio triggers enable github_commit_event
```
### 5. Run the python script
```shell
python cookbook/examples/commit_agent/main.py
```
Create a commit in the configured repo. The trello board should automatically be updated!
