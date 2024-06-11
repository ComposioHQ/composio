# Calendar Agent
> Fork and Clone this repository if needed!

## Introduction
This project is an example which uses Composio to seamlessly convert your to-do lists into Google Calendar events. 
It automatically schedules tasks with specified labels and times, ensuring your calendar is always up-to-date and organized.

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
Execute the setup.sh script to set up the environment, install dependencies and login to Composio:
```shell
./setup.sh
```
Now, Fill in the .env file with your secrets.

### 2. Run the python script
```shell
python cookbook/examples/calendar_agent/main.py
```
A new event has been added to our Google calendar!
