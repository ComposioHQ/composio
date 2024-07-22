# Reddit Agent
> Fork and Clone this repository if needed!


## Introduction
This is an example which uses Composio to automate the filter and comment action of Reddit.


## Steps to Run
**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `main.py`, `requirements.txt`, `.env.example` and `README.md` files are located. For example:
```shell
cd path/to/project/directory
```

### 1. Run the Setup File
Make the setup.sh Script Executable (if necessary):
On Linux or macOS, you might need to make the setup.sh script executable:
```shell
chmod +x setup.sh
```
Execute the setup.sh script to set up the environment, install dependencies, login to composio:
```shell
./setup.sh
```
Now, Fill in the `.env` file with your secrets.
### 2. Run the python script
```shell
python cookbook/examples/commit_agent/main.py
```
Your notion page should automatically be populated with the data.

