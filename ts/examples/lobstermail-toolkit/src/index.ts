/**
 * @file LobsterMail toolkit for Composio
 * @module examples/lobstermail-toolkit
 * @description
 *   Registers LobsterMail API endpoints as Composio custom tools so any
 *   connected AI agent can self-provision email inboxes, send/receive email,
 *   search messages, and manage webhooks.
 *
 * @see {@link https://lobstermail.ai}
 * @see {@link https://api.lobstermail.ai/v1/docs/openapi}
 */

import { Composio } from '@composio/core';
import 'dotenv/config';
import { z } from 'zod';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const BASE_URL = 'https://api.lobstermail.ai';
const API_KEY = process.env.LOBSTERMAIL_API_KEY!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function lobsterFetch(
  path: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...(options.headers as Record<string, string>),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    return { data: null, error: body, successful: false };
  }
  return { data: body, error: null, successful: true };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_CREATE_INBOX',
  name: 'Create email inbox',
  description:
    'Create a new email inbox on LobsterMail. Returns the inbox ID and email address. ' +
    'Optionally specify a display name, local part, and domain.',
  inputParams: z.object({
    displayName: z
      .string()
      .max(100)
      .optional()
      .describe('Human-friendly name for the inbox'),
    localPart: z
      .string()
      .min(3)
      .max(64)
      .optional()
      .describe('Local part of the email address (before the @). Auto-generated if omitted.'),
    domain: z
      .string()
      .max(253)
      .optional()
      .describe('Domain for the inbox. Defaults to lobstermail.ai.'),
  }),
  execute: async (input) => {
    const body: Record<string, string> = {};
    if (input.displayName) body.displayName = input.displayName;
    if (input.localPart) body.localPart = input.localPart;
    if (input.domain) body.domain = input.domain;
    return lobsterFetch('/v1/inboxes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_LIST_INBOXES',
  name: 'List email inboxes',
  description: 'List all email inboxes on the authenticated LobsterMail account.',
  inputParams: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z.number().min(1).max(50).optional().describe('Max results to return (default 20)'),
  }),
  execute: async (input) => {
    const params = new URLSearchParams();
    if (input.cursor) params.set('cursor', input.cursor);
    if (input.limit) params.set('limit', String(input.limit));
    const qs = params.toString();
    return lobsterFetch(`/v1/inboxes${qs ? `?${qs}` : ''}`);
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_SEND_EMAIL',
  name: 'Send email',
  description:
    'Send an email from a LobsterMail inbox. Requires Tier 1+ account. ' +
    'Supports plain text and/or HTML body, CC, reply threading, and attachments.',
  inputParams: z.object({
    from: z.string().describe('Sender email address (must be an active inbox on the account)'),
    to: z.array(z.string()).min(1).max(50).describe('Recipient email addresses'),
    subject: z.string().max(998).describe('Email subject line'),
    text: z.string().optional().describe('Plain-text body'),
    html: z.string().optional().describe('HTML body'),
    cc: z.array(z.string()).max(50).optional().describe('CC recipients'),
    inReplyTo: z.string().optional().describe('Message-ID of the email being replied to'),
    threadId: z.string().optional().describe('Thread ID to continue a conversation'),
  }),
  execute: async (input) => {
    const body: Record<string, unknown> = {
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: {} as Record<string, string>,
    };
    if (input.text) (body.body as Record<string, string>).text = input.text;
    if (input.html) (body.body as Record<string, string>).html = input.html;
    if (input.cc) body.cc = input.cc;
    if (input.inReplyTo) body.inReplyTo = input.inReplyTo;
    if (input.threadId) body.threadId = input.threadId;
    return lobsterFetch('/v1/emails/send', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_LIST_EMAILS',
  name: 'List emails in inbox',
  description: 'List emails for a specific inbox. Supports pagination and sender filtering.',
  inputParams: z.object({
    inboxId: z.string().describe('The inbox ID to fetch emails from'),
    from: z
      .string()
      .optional()
      .describe('Filter by sender address (case-insensitive substring match)'),
    cursor: z.string().optional().describe('Pagination cursor'),
    limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
  }),
  execute: async (input) => {
    const params = new URLSearchParams();
    if (input.from) params.set('from', input.from);
    if (input.cursor) params.set('cursor', input.cursor);
    if (input.limit) params.set('limit', String(input.limit));
    const qs = params.toString();
    return lobsterFetch(`/v1/inboxes/${input.inboxId}/emails${qs ? `?${qs}` : ''}`);
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_GET_EMAIL',
  name: 'Get email details',
  description:
    'Get a single email with full body content (text and HTML) from a specific inbox.',
  inputParams: z.object({
    inboxId: z.string().describe('The inbox ID'),
    emailId: z.string().describe('The email ID'),
  }),
  execute: async (input) => {
    return lobsterFetch(`/v1/inboxes/${input.inboxId}/emails/${input.emailId}`);
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_SEARCH_EMAILS',
  name: 'Search emails',
  description:
    'Search emails across inboxes with full-text query and filters ' +
    '(direction, sender, date range, attachments).',
  inputParams: z.object({
    q: z.string().min(1).max(500).describe('Search query'),
    inboxId: z.string().optional().describe('Limit search to a specific inbox'),
    direction: z
      .enum(['inbound', 'outbound'])
      .optional()
      .describe('Filter by email direction'),
    from: z.string().optional().describe('Filter by sender address'),
    since: z.string().optional().describe('Only emails after this ISO datetime'),
    until: z.string().optional().describe('Only emails before this ISO datetime'),
    hasAttachments: z.boolean().optional().describe('Filter to emails with attachments'),
    limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  execute: async (input) => {
    const params = new URLSearchParams();
    params.set('q', input.q);
    if (input.inboxId) params.set('inboxId', input.inboxId);
    if (input.direction) params.set('direction', input.direction);
    if (input.from) params.set('from', input.from);
    if (input.since) params.set('since', input.since);
    if (input.until) params.set('until', input.until);
    if (input.hasAttachments !== undefined)
      params.set('hasAttachments', String(input.hasAttachments));
    if (input.limit) params.set('limit', String(input.limit));
    if (input.cursor) params.set('cursor', input.cursor);
    return lobsterFetch(`/v1/emails/search?${params.toString()}`);
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_LIST_THREADS',
  name: 'List conversation threads',
  description: 'List email conversation threads for a specific inbox.',
  inputParams: z.object({
    inboxId: z.string().describe('The inbox ID'),
    cursor: z.string().optional().describe('Pagination cursor'),
    limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
  }),
  execute: async (input) => {
    const params = new URLSearchParams();
    if (input.cursor) params.set('cursor', input.cursor);
    if (input.limit) params.set('limit', String(input.limit));
    const qs = params.toString();
    return lobsterFetch(`/v1/inboxes/${input.inboxId}/threads${qs ? `?${qs}` : ''}`);
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_CREATE_WEBHOOK',
  name: 'Create webhook',
  description:
    'Register a webhook to receive notifications for email events ' +
    '(email.received, email.bounced, email.delivered). Can be account-wide or per-inbox.',
  inputParams: z.object({
    url: z.string().url().describe('HTTPS webhook endpoint URL'),
    events: z
      .array(z.enum(['email.received', 'email.bounced', 'email.delivered']))
      .min(1)
      .describe('Events to subscribe to'),
    inboxId: z
      .string()
      .optional()
      .describe('Limit webhook to a specific inbox. Omit for account-wide.'),
  }),
  execute: async (input) => {
    return lobsterFetch('/v1/webhooks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
});

await composio.tools.createCustomTool({
  slug: 'LOBSTERMAIL_GET_ACCOUNT',
  name: 'Get account details',
  description:
    'Get the authenticated account details including tier, limits, usage counters, ' +
    'and verification status.',
  inputParams: z.object({}),
  execute: async () => {
    return lobsterFetch('/v1/account');
  },
});

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log('LobsterMail toolkit registered with Composio.');
  console.log('Tools available:');

  const slugs = [
    'LOBSTERMAIL_CREATE_INBOX',
    'LOBSTERMAIL_LIST_INBOXES',
    'LOBSTERMAIL_SEND_EMAIL',
    'LOBSTERMAIL_LIST_EMAILS',
    'LOBSTERMAIL_GET_EMAIL',
    'LOBSTERMAIL_SEARCH_EMAILS',
    'LOBSTERMAIL_LIST_THREADS',
    'LOBSTERMAIL_CREATE_WEBHOOK',
    'LOBSTERMAIL_GET_ACCOUNT',
  ];

  for (const slug of slugs) {
    console.log(`  - ${slug}`);
  }

  // Quick smoke test: get account info
  const result = await composio.tools.execute('LOBSTERMAIL_GET_ACCOUNT', {
    arguments: {},
    userId: 'default',
  });

  console.log('\nAccount info:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
