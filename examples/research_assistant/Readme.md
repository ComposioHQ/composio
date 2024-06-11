# Research Assistant Guide

This guide provides detailed steps to create a research assistant agent that leverages CrewAI, Composio, and ChatGPT to perform web searches and compile research reports. Ensure you have Python 3.8 or higher installed.

## Setup Instructions

### Step 1: Execute the setup.sh Script

1. **Open Terminal or Command Prompt:**
   Open a terminal (Linux/macOS) or command prompt (Windows).

2. **Navigate to the Project Directory:**
   Change to the directory where the `setup.sh`, `main.py`, and `requirements.txt` files are located. For example:
   ```sh
   cd path/to/project/directory
   ```

3. **Make the setup.sh Script Executable (if necessary):**
   On Linux or macOS, you might need to make the setup.sh script executable:
   ```sh
   chmod +x setup.sh
   ```

4. **Run the setup.sh Script:**
   Execute the setup.sh script to set up the environment and install dependencies:
   ```sh
   ./setup.sh
   ```

5. **Follow Prompts to Log In and Add SERPAPI:**
   - When prompted, log in to Composio.
   - Add SERPAPI to Composio as instructed.

### Step 2: Add Environment Variables

1. **Update the .env File:**
   - Open the .env file created in the project directory.
   - Replace `your_openai_api_key_here` with your actual OpenAI API key.
   - Save and close the .env file.
   - Ensure the `.env` file is not tracked by version control for security reasons.


### Step 3: Run the main.py Script

1. **Activate the Virtual Environment:**
   Use the appropriate command for your operating system:
   - **Linux/macOS:**
     ```sh
     source research_assistant_env/bin/activate
     ```
   - **Windows (Command Prompt):**
     ```sh
     research_assistant_env\Scripts\activate
     ```
   - **Windows (PowerShell):**
     ```sh
     .\research_assistant_env\Scripts\Activate.ps1
     ```

2. **Run the Main Script:**
   With the virtual environment activated, run the main script:
   ```sh
    python main.py
   ```

3. **Provide Input When Prompted:**
   Enter the research topic when prompted by the script.

By following these steps, you'll set up the environment, install the required dependencies, and run the main.py script successfully.

## Running the IPython Notebook
Alternatively, you can also run the provided IPython Notebook file (research_assistant.ipynb). Open the notebook in Jupyter Notebook or JupyterLab and follow the instructions within the notebook to execute the project.

By following these steps, you'll set up the environment, install the required dependencies, and run the main.py script successfully. You also have the option to run the IPython Notebook for a different interactive experience.
