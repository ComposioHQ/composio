# Image Search Guide

This guide provides detailed steps to create an Image Search Agent that leverages Composio, agentic frameworks such as Langchain, Langgraph, LlamaIndex, CrewAI, Autogen and ChatGPT to search for images in you local directory with just a prompt. Ensure you have Python 3.8 or higher installed.

# Image Search Schematic
![alt text](https://github.com/composiohq/composio/blob/master/python/examples/image_search/schematic.png?raw=true)

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
Now, fill in the `.env` file with your secrets.

### 2. Run the Python Script
```shell
python cookbook/examples/image_search/main.py
```

