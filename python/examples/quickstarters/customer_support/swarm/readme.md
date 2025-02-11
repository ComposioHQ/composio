# Customer Support Agent
> Fork and Clone this repository if needed!

## Introduction
This project uses Composio to build a Customer Support Agent, It searches for your answers, while recording the status of your query and if it was unresolved raises an issue for your team.

Built with Composio and Swarm


## 👣 Steps to Run
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
Now, Fill in the `.env` file with your secrets.

### 2. Run the python script
```shell
python python/examples/quickstarters/customer_support/swarm/main.py
```
