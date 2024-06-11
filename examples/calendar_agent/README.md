# Calendar Agent
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
```
### 7. Run the python script
```shell
python cookbook/examples/commit_agent/main.py
```
Create a commit in the configured repo. The trello board should automatically be updates!
