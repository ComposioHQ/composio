import type { NextApiRequest, NextApiResponse } from 'next';
import { TriggerEvent } from '@composio/core';
import crypto from 'crypto';

type GitHubStarEventData = {
  repository_name: string;
  repository_url: string;
  starred_by: string;
  starred_at: string;
};

function verifyWebhookSignature(
  req: NextApiRequest,
  body: string
): boolean {
  const signature = req.headers['webhook-signature'] as string | undefined;
  const msgId = req.headers['webhook-id'] as string | undefined;
  const timestamp = req.headers['webhook-timestamp'] as string | undefined;
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET;

  if (!signature || !msgId || !timestamp || !secret) {
    throw new Error('Missing required webhook headers or secret');
  }

  if (!signature.startsWith('v1,')) {
    throw new Error('Invalid signature format');
  }

  const received = signature.slice(3);
  const signingString = `${msgId}.${timestamp}.${body}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signingString)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export default async function webhookHandler(req: NextApiRequest, res: NextApiResponse) {
  const payload = req.body;

  if (payload.type === 'github_star_added_event') {
    const event: TriggerEvent<GitHubStarEventData> = {
      type: payload.type,
      timestamp: payload.timestamp,
      data: payload.data
    };
    
    console.log(`Repository ${event.data.repository_name} starred by ${event.data.starred_by}`);
    // Add your business logic here
  }

  res.status(200).json({
    status: 'success',
    message: 'Webhook processed'
  });
}
