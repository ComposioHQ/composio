/**
 * Webhook Verification Server Example
 *
 * This example demonstrates how to verify incoming Composio webhooks
 * using Bun.serve with the new verifyWebhook API.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY and COMPOSIO_WEBHOOK_SECRET in the .env file
 * 2. Install dependencies: pnpm install
 * 3. Run the server: pnpm webhook
 * 4. Expose your local server using telebit: `telebit http 3000`
 * 5. Configure the webhook URL in your Composio dashboard: `https://<your-telebit-url>/webhook`
 */

import { Composio } from '@composio/core';
import 'dotenv/config';

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.COMPOSIO_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('❌ COMPOSIO_WEBHOOK_SECRET is required in .env file');
  process.exit(1);
}

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

console.log(`🚀 Starting webhook server on port ${PORT}...`);

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        // Get required headers
        const webhookId = request.headers.get('webhook-id') || '';
        const webhookTimestamp = request.headers.get('webhook-timestamp') || '';
        const webhookSignature = request.headers.get('webhook-signature') || '';

        // Get raw payload
        const payload = await request.text();

        console.log('\n📨 Received webhook request');
        console.log('  Headers:');
        console.log(`    webhook-id: ${webhookId}`);
        console.log(`    webhook-timestamp: ${webhookTimestamp}`);
        console.log(`    webhook-signature: ${webhookSignature.substring(0, 30)}...`);

        // Verify the webhook
        const result = composio.triggers.verifyWebhook({
          id: webhookId,
          timestamp: webhookTimestamp,
          signature: webhookSignature,
          payload,
          secret: WEBHOOK_SECRET,
        });

        // Log the verified payload
        console.log('\n✅ Webhook verified successfully!');
        console.log(`  Version: ${result.version}`);
        console.log(`  Trigger: ${result.payload.triggerSlug}`);
        console.log(`  User ID: ${result.payload.userId}`);
        console.log(`  Payload:`, JSON.stringify(result.payload.payload, null, 2));

        // Process the trigger event here
        // For example, you could emit an event, call another service, etc.

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('\n❌ Webhook verification failed:', error);

        // Return 401 for signature verification errors
        if (
          error instanceof Error &&
          error.name === 'ComposioWebhookSignatureVerificationError'
        ) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Return 400 for payload parsing errors
        if (error instanceof Error && error.name === 'ComposioWebhookPayloadError') {
          return new Response(JSON.stringify({ error: 'Bad Request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Return 500 for unexpected errors
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 404 for other routes
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`✅ Webhook server running at http://localhost:${server.port}`);
console.log(`\n📋 Endpoints:`);
console.log(`  POST /webhook - Receive and verify webhooks`);
console.log(`  GET  /health  - Health check`);
console.log(`\n💡 Tips:`);
console.log(`  1. Expose this server with telebit: telebit http ${server.port}`);
console.log(`  2. Configure your telebit URL as webhook URL in Composio dashboard`);
console.log(`  3. The webhook secret should match what's configured in Composio`);
