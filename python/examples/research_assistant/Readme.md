# Research Assistant Guide

This guide provides detailed steps to create a research assistant agent that leverages CrewAI, Composio, and ChatGPT to perform web searches and compile research reports. Ensure you have Python 3.8 or higher installed.

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
python cookbook/examples/research_assistant/main.py
```
Your notion page should automatically be populated with the data.

## Running the IPython Notebook
Alternatively, you can also run the provided IPython Notebook file (research_assistant.ipynb). Open the notebook in Jupyter Notebook or JupyterLab and follow the instructions within the notebook to execute the project.

By following the steps, you'll set up the environment, install the required dependencies, and run the main.py script successfully. You also have the option to run the IPython Notebook for a different interactive experience.


