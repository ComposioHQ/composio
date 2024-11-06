# Meeting Brief Agent

This application is a meeting brief agent built with Composio that looks at your Calendar for meetings and sends you the briefs on Slack.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set environment variables**:
   Create a `.env` file in the root directory and add the following variables:
   ```plaintext
   COMPOSIO_API_KEY=<your-composio-api-key>
   OPENAI_API_KEY=<your-openai-api-key>
   ```

4. **Run the application**:
   Use the following command to run the application:
   ```bash
   node demo.mjs
   ```
