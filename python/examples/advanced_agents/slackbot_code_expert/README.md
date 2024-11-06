# Slackbot: Code Expert In Your Slack Channel

## Overview

Slack Expert serves as a code-savvy assistant, capable of answering questions related to a codebase. When a user asks a question, Slack Expert initially tries to answer using OpenAI chat completions. If additional code-specific context is required, it queries the codebase using Composio tools, refines the response, and sends it back to the user.