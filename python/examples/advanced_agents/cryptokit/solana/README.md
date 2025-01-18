# Solana Crypto Kit Agents

A powerful toolkit for building automated blockchain agents that interact with the Solana ecosystem using Composio. These agents can handle various operations including token transfers, balance checks, transaction monitoring, and automated rewards distribution.

## Features

- 🔄 SOL token transfers and management
- 💰 Wallet balance monitoring
- 🔍 Transaction status tracking
- 🪂 SOL airdrop requests
- 🤝 Community reward distribution
- 👨‍💻 Coder reward automation
- 🔗 Integration with Github, Discord, and Slack and more

## Prerequisites

- Python 3.8 or higher

## Installation

1. **Clone the Repository**
   ```sh
   git clone <repository-url>
   cd path/to/project/directory
   ```

2. **Set Up Environment**
   ```sh
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Configure Environment Variables**
   Create a `.env` file with the following variables:
   ```env
    OPENAI_API_KEY=
    COMPOSIO_API_KEY=
    SOLANA_PRIVATE_KEY=
    SOLANA_WALLET_ADDRESS=
   ```

## Available Agents

### Community Reward Agent
Automates the distribution of SOL tokens to community members based on their contributions.

```sh
python cookbook/python-examples/advanced_agents/cryptokit/solana/community_reward_agent.py
```

### Coder Reward Agent
Manages automated payments to developers based on code contributions and milestones.

```sh
python cookbook/python-examples/advanced_agents/cryptokit/solana/coder_reward_agent.py
```