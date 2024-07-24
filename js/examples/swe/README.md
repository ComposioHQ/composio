# SWE Development Kit (SWEKit.js)

Build and benchmark Software Engineering agents with Composio's tooling ecosystem using JavaScript

## Overview

SWE Development Kit (swekit) is a powerful framework for building Software Engineering agents using Composio's tooling ecosystem. 
It provides tools like Github, Repo Indexing, Repo Search, File Manager, Shell Manager, and more.

## Key Features

- **Agent Scaffolding**: Quickly create Devin like agents that work out-of-the-box with popular agentic frameworks like OpenAI, Langchain, and more.
- **Flexible Workspace Environments**: Operate your agents within a variety of secure and isolated environments including Docker, E2B, and FlyIO for security and isolation.
- **Customizable Tools**: Add or optimize your agent's abilities with a variety of tools.
- **Benchmarking**: Evaluate your agents against the SWE-bench, a comprehensive benchmark for software engineering tasks.

## Getting Started
### Installation

Begin by installing the core packages using your favourite package manager. The recommended method is using `pnpm`, but you can also use `npm` or `yarn`.

``` bash
pnpm install -g composio-core
```

### Connect your Github Account
To utilize Github Issues as a task source, link your Github account by setting the `GITHUB_ACCESS_TOKEN` environment variable with your personal access token. Run the following command in your terminal:

```
export GITHUB_ACCESS_TOKEN=<github_access_token>
```


### Clone SWE Template for JS

> **Warning**: To use Docker as the default workspace environment, ensure your Docker server is running.

To quickly get started, clone the template from GitHub using the command below:
```bash Clon and setup SWE Template
git clone https://github.com/ComposioHQ/swe-js-template.git swe-js
```

### Install all the dependencies

Install all the required dependencies for the SWE agent using `pnpm`, which is the recommended package manager:
```bash Install all the dependencies
cd swe-js && pnpm i
```

### Run your SWE agent

To start the agent, just run the following command:
```bash Run the agent
pnpm start
```
You will be prompted to specify the repository and issue for the agent to address.

