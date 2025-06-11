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
- **A Composio API key** - Get one from [Composio Dashboard](https://app.composio.dev/)

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

### 3. Install UV (Python Package Manager)

UV is required for generating tool and Python documentation:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
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

### 6. Initial Content Generation

Generate all the necessary documentation content:

```bash
# Download the latest OpenAPI specifications
pnpm api:pull

# Generate tool documentation
pnpm run tools:generate

# Generate SDK reference documentation
pnpm run sdkdocs
```

## Development Workflow

Once you've completed the one-time setup, use this workflow for ongoing development:

### 1. Start the Development Server

```bash
pnpm run dev
```

This will:

- Comment out tool docs for faster development
- Build example code
- Start the documentation server at http://localhost:3000

### 2. Make Your Changes

Edit the documentation files in the appropriate directories. The server will automatically reload when you make changes.

### 3. Check Your Work

Before submitting your changes, run these commands to ensure everything is working:

```bash
# Check for broken links and other issues
pnpm run links

# Or use the check command (faster, but comments out tool docs)
pnpm run check
```

### 4. Submit Your Changes

1. Commit your changes to a new branch
2. Push to your fork
3. Create a pull request

## Troubleshooting

### Common Issues and Solutions

**Problem:** `uv: command not found`
**Solution:** Make sure UV is installed and restart your terminal after installation.

**Problem:** `fern: command not found`
**Solution:** Install Fern globally with `npm install -g fern-api`

**Problem:** Tool generation fails
**Solution:** Make sure your `COMPOSIO_API_KEY` environment variable is set correctly.

**Problem:** Development server won't start
**Solution:**

1. Make sure all dependencies are installed: `pnpm install`
2. Try cleaning and rebuilding: `pnpm clean && pnpm install`

**Problem:** Broken links in documentation
**Solution:** Run `pnpm run links` to identify and fix broken links before submitting.

### Development Commands Reference

| Command                   | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `pnpm run dev`            | Start development server with fast preview |
| `pnpm run links`          | Check for broken links (full build)        |
| `pnpm run check`          | Quick validation (comments out tool docs)  |
| `pnpm run tools:generate` | Generate tool documentation                |
| `pnpm run sdkdocs`        | Generate SDK reference docs                |
| `pnpm api:pull`           | Download latest OpenAPI specs              |
| `pnpm run preview`        | Generate full preview build                |
| `pnpm run publish`        | Publish docs (maintainers only)            |

### File Structure

```
fern/
├── docs/                 # Main documentation content
├── assets/              # Images, CSS, and other assets
├── pages/               # Documentation pages
├── generators/          # Tool documentation generators
├── scripts/             # Build and utility scripts
└── package.json         # Dependencies and scripts
```
