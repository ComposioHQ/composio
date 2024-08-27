# Web Roaster Agent Guide

This guide provides detailed steps to create a Web Roaster agent that leverages Composio, Phidata and ChatGPT to roast a website on its design and copy. Ensure you have Python 3.8 or higher installed.

## How it works
![alt text](https://github.com/ComposioHQ/composio/blob/master/python/examples/webroaster_phidata/webroast.gif?raw=true)

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
python cookbook/examples/webroaster/webroaster_phidata/main.py
```

