import { Composio } from "@composio/core";

const composio = new Composio();

export async function POST(req: Request) {
  const { connectedAccountId }: { connectedAccountId: string } =
    await req.json();
  await composio.connectedAccounts.delete(connectedAccountId);
  return Response.json({ success: true });
}
