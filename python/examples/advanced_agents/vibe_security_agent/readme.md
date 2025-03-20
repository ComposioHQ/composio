# Security Analysis Agent Guide

This guide provides detailed steps to create a Security Analysis Agent that leverages Composio and OpenAI to perform automated security assessments of your codebase.

## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `main.py`, `requirements.txt`, and `README.md` files are located. For example:
```sh
cd path/to/project/directory
```

### 1. Run the Setup Script
Make the setup script executable:
```shell
chmod +x setup.sh
```

Run the setup script:
```shell
./setup.sh
```

Fill in your API keys in the generated .env file.

### 2. Environment Setup
Create and configure your `.env` file with the necessary secrets:
- OpenAI API credentials
- Composio credentials

### 3. Install Dependencies
Install the required Python packages:
```shell
pip install -r requirements.txt
```

### 4. Run the Security Analysis
Start the security analysis by running:
```shell
python main.py
```

