# Competitor Researcher
> Fork and Clone this repository if needed!

## Introduction
This project uses Composio to automate the creation and management of competitor pages in Notion. 
It scrapes data from competitor websites and generates Notion pages under a specified parent page. 
If a page with the same name already exists, a unique identifier is added. 
This ensures that your competitor information in Notion is always up-to-date and well-organized.
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
python cookbook/examples/commit_agent/main.py
```
Your notion page should automatically be populated with the data.
