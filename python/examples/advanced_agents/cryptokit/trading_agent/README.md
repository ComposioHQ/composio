# Trading Crypto Kit Agent

A powerful toolkit for building AI agents that can trade crypto using Coinbase.

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
    COMPOSIO_API_KEY=COMPOSIO_API_KEY
    OPENAI_API_KEY=OPENAI_API_KEY
    CDP_API_KEY_NAME=API_KEY_NAME
    CDP_API_KEY_PRIVATE_KEY=API_KEY_PRIVATE_KEY
   ```

Allows your agent to create wallets, send tokens, check balances, and more using Coinbase.

```sh
python cookbook/python-examples/advanced_agents/cryptokit/trading_agent/main.py
```
