# Commit Agent

## Introduction
This project is an example which uses composio to help you keep your GitHub repository and Trello board in sync. 
It automatically creates Trello cards for TODO comments and commit messages from your GitHub patches, ensuring your tasks are always 
up-to-date and organized.

## Steps to Run
### 1. Create a virtual environment
```shell
python3 -m venv ~/.venvs/commit_agent
source ~/.venvs/commit_agent/bin/activate
```
### 2. Install libraries
```shell
pip install -U composio-crewai crewai flask langchain_openai
```
### 3. Expose your local server to the internet using ngrok
```shell
ngrok <port_number>
```
### 4. Setup and Configure triggers
```
# Set CallBack URL 
composio triggers callbacks set "https://<ngrok-url>/webhook"

# Enable Trigger
composio triggers enable github_commit_event
```
