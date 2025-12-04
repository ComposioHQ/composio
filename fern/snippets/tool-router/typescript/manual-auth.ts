import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: "your-composio-api-key" });

const userId = "pg-user-550e8400-e29b-41d4";
const requiredToolkits = ["gmail", "googlecalendar", "linear", "slack"];

async function main() {
  const session = await composio.create(userId, {
    manageConnections: false,
  });

  const toolkits = await session.toolkits();

  const pending = requiredToolkits.filter((slug) => {
    const toolkit = toolkits.find((t) => t.slug === slug);
    return !toolkit?.connectedAccount;
  });

  if (pending.length > 0) {
    console.log("Connect these apps to continue:");

    for (const slug of pending) {
      const connectionRequest = await session.authorize(slug, {
        callbackUrl: "https://yourapp.com/onboarding",
      });
      console.log(`  ${slug}: ${connectionRequest.redirectUrl}`);
    }

    console.log("\nWaiting for connections...");

    for (const slug of pending) {
      const connectionRequest = await session.authorize(slug);
      await connectionRequest.waitForConnection(60000);
      console.log(`  ${slug} connected`);
    }
  }

  console.log("\nAll apps connected. Starting assistant...");
  const tools = await session.tools();
}

main();
