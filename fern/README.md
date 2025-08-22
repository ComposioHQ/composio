# Composio Documentation

Welcome to the Composio documentation! This guide will help you contribute to our documentation with ease.

## Table of Contents

- [Prerequisites](#prerequisites)
- [One-Time Setup](#one-time-setup)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Contributing Guidelines](#contributing-guidelines)

## Prerequisites

Before you start, make sure you have the following installed on your system:

- **Node.js** (version 18 or higher) - [Download here](https://nodejs.org/)
- **pnpm** (package manager) - Install with `npm install -g pnpm`
- **Git** - For version control
- **A Composio API key** - Get one from [Composio Dashboard](https://platform.composio.dev?next_page=/settings)

## One-Time Setup

Follow these steps once when you first set up the project:

### 1. Clone and Navigate to the Project

```bash
git clone <repository-url>
cd composio1/fern
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Install Python Dependencies

UV is required for generating tool and Python documentation:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Install the Python SDK**
```bash
uv sync && uv pip install python/
```

### 4. Install and Setup Fern CLI

Fern is the documentation framework we use:

```bash
npm install -g fern-api
fern login
```

### 5. Set Up Your API Key

Export your Composio API key (you'll need this for generating tool documentation):

```bash
export COMPOSIO_API_KEY=your_api_key_here
```

**Pro tip:** Add this to your shell profile (`.bashrc`, `.zshrc`, etc.) so you don't have to set it every time.

## Development Workflow

Once you've completed the one-time setup, use this workflow for ongoing development:

### 1. Start the Development Server

```bash
pnpm turbo run dev
```

This will:

- Comment out tool docs for faster development
- Build example code
- Start the documentation server at http://localhost:3000

### 2. Make Your Changes

- Edit the documentation files in the `fern/pages/src` directories.
- If adding new docs, make sure to add them in `docs.yml`
- Refer to [Fern docs](https://buildwithfern.com/learn/docs/getting-started/overview)

### 3. Check Your Work

Before submitting your changes, run these commands to ensure everything is working:

```bash
# Check for broken links and other issues
cd fern/ && pnpm run links

# Or use the check command (faster, but comments out tool docs)
cd fern/ && pnpm run check
```

### 4. Submit Your Changes

1. Commit your changes to a new branch
2. Push to your fork
3. Create a pull request
5. You will see preview links generated in the PR, use that to share.
