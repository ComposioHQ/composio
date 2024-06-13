# Competitor Researcher
> Fork and Clone this repository if needed!

## Introduction
This project uses Composio to automate the creation and management of competitor pages in Notion. 
It scrapes data from competitor websites and generates Notion pages under a specified parent page. 
If a page with the same name already exists, a unique identifier is added. 
This ensures that your competitor information in Notion is always up-to-date and well-organized.
## How it Works
### 1. Setup and Initialization
* Import Packages and Load Environment Variables:
* Initialize Language Model and Define tools for the agent using ComposioToolSet. We will be using notion tool so that our agent can perform actions on notion. 
* Retrieve Date and Time
2. Scraping Website Content
* Helper function `remove_tags(html)` uses BeautifulSoup to remove HTML tags from a string, returning clean text.
* `scrape_website(url)` function fetches content from the specified URL. This function uses requests to get the webpage, processes the HTML content to remove tags, and returns the cleaned text. Handles potential request errors gracefully.
3. Creating and Configuring the Agent, Defining and Executing the Task
* Initialize the Agent: Create an Agent instance with the role "Notion Agent", specifying its goal, backstory, tools, and language model.
* Call scrape_website(url) to get data from the competitor website and store it in competitor_data.
* Create a Task instance with a detailed description, including the need to create or update a page in Notion with the scraped data. Specify expected output and mark the task for asynchronous execution.
* Execute the task using task.execute() to have the agent perform the specified action (Adding to a page) on Notion.

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
