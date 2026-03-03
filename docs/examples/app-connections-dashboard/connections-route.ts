// region setup
import { Composio } from "@composio/core";

const composio = new Composio();

export const dynamic = "force-dynamic";
// endregion setup

// region list
export async function GET() {
  const session = await composio.create("user_123");
  const { items } = await session.toolkits({ limit: 50 });

  return Response.json({
    // Filter out toolkits that don't require authentication
    toolkits: items
      .filter((t) => !t.isNoAuth)
      .map((t) => ({
        slug: t.slug,
        name: t.name,
        logo: t.logo,
        isConnected: t.connection?.isActive ?? false,
        connectedAccountId: t.connection?.connectedAccount?.id,
      })),
  });
}
// endregion list

// region connect
export async function POST(req: Request) {
  const { toolkit }: { toolkit: string } = await req.json();
  const origin = new URL(req.url).origin;
  const session = await composio.create("user_123");
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: origin,
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
// endregion connect
