# AI Assignment Agent

This project implements a single AI agent built using Autogen and Composio Tools that can either create or review assignments based on user selection.

## Features
  - Create new assignments on Canvas
  - Review and grade submitted assignments on Canvas

## Prerequisites

- A connected Canvas account on Composio
- OpenAI API key
- Composio API key

## Installation

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment variables**:
   Create a `.env` file with:
   ```
   OPENAI_API_KEY=your_openai_key
   COMPOSIO_API_KEY=your_composio_key
   ```

## Usage

Run the main script and select your desired operation:

```bash
python assignment_agent.py
```

You'll be prompted to:
1. Choose an operation:
   - Option 1: Create a new assignment
   - Option 2: Review existing assignments
2. Provide necessary details based on your selection