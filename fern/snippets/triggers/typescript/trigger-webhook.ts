import type { NextApiRequest, NextApiResponse } from 'next';
import { TriggerEvent } from '@composio/core';

// Type definition for Gmail Webhook event
export type GmailNewEmailEventPayload = {
  type: string;
  timestamp: string;
  data: {
    attachment_list: Array<any>;
    id: string;
    label_ids: Array<string>;
    message_id: string;
    message_text: string;
    message_timestamp: string;
    payload: {
      body: {
        size: number;
      };
      filename: string;
      headers: Array<{
        name: string;
        value: string;
      }>;
      mimeType: string;
      partId: string;
      parts: Array<{
        body: {
          data: string;
          size: number;
        };
        filename: string;
        headers: Array<{
          name: string;
          value: string;
        }>;
        mimeType: string;
        partId: string;
      }>;
    };
    preview: {
      body: string;
      subject: string;
    };
    sender: string;
    subject: string;
    thread_id: string;
    to: string;
    connection_id: string;
    connection_nano_id: string;
    trigger_nano_id: string;
    trigger_id: string;
    user_id: string;
  };
};

// Handler for Gmail "new email received" event
function handleGmailNewEmailEvent(event: TriggerEvent<GmailNewEmailEventPayload['data']>) {
  console.log(`📧 New email received from: ${event.data.sender}`);
  console.log(`Subject: ${event.data.subject}`);
  console.log(`Preview: ${event.data.preview.body}`);
  console.log(`Message ID: ${event.data.message_id}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed. Only POST requests are accepted.',
    });
  }

  try {
    const payload = req.body;
    // Ensure we're processing Gmail webhook events
    if (payload.type === 'gmail_new_email_event') {
      const gmailEvent: TriggerEvent<GmailNewEmailEventPayload['data']> = {
        type: payload.type,
        timestamp: new Date().toISOString(),
        data: payload.data,
      };

      handleGmailNewEmailEvent(gmailEvent);
    }

    res.status(200).json({
      status: 'success',
      message: 'Webhook received and processed successfully',
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while processing webhook',
    });
  }
}
