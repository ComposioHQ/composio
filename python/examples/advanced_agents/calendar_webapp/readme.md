# Calendar web app guide

This guide provides detailed steps to create a web app using which you can manage your google calendar

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
Execute the setup.sh script to set up the environment, install dependencies, login to composio and 
add necessary tools:
```shell
./setup.sh
```
Now, Fill in the .env file with your secrets.
### 2. Run the python script
```shell
streamlit run python/examples/advanced_agents/calendar_webapp/main.py
```



