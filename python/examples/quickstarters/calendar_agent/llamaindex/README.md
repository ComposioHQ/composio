# Calendar Agent
> Fork and Clone this repository if needed!

## Introduction
This project is an example which uses Composio to seamlessly convert your to-do lists into Google Calendar events. 
It automatically schedules tasks with specified labels and times, ensuring your calendar is always up-to-date and organized.

## How it Works
### 1. Setup and Initialization
* Import packages, Load environment variables.
* Initialize the language model, Define Composio tools. We are using Google Calendar tool, So that our agent can execute actions using this tool.
* Retrieve Data and time and format them appropriately for scheduling.
### 2. Creating and Configuring the Agent
* Define a string todo with the tasks to be scheduled.
* Create the Agent with the role of "Google Calendar Agent", Provide the agent with a goal and backstory, emphasizing its responsibility to interact with Google Calendar APIs.
* Pass the tools obtained from ComposioToolSet and the initialized language model (llm) to the agent.
### 3. Defining the Task and Executing the Agent
* Task is instantiated with a description that includes the to-do list, current date, and timezone.
* Call `task.execute()` to have the agent carry out the task using the provided tools and language model. 
## Steps to Run
**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `main.py`, `requirements.txt`, and `README.md` files are located. For example:
```shell
cd path/to/project/directory
```

### 1. Run the Setup File
Make the setup.sh Script Executable (if necessary):
On Linux or macOS, you might need to make the setup.sh script executable:
```shell
chmod +x setup.sh
```
Execute the setup.sh script to set up the environment, install dependencies, login to composio and 
add necessary tools:
```shell
./setup.sh
```
Now, Fill in the .env file with your secrets.

### 2. Run the python script
```shell
python python/examples/quickstarters/calendar_agent/llamaindex/main.py
```
A new event has been added to our Google calendar!
