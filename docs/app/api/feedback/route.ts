import { NextRequest, NextResponse } from 'next/server';

const SLACK_WEBHOOK_URL = process.env.SLACK_FEEDBACK_WEBHOOK_URL;

function parseUserAgent(ua: string | undefined): string {
  if (!ua) return 'Unknown';

  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/(\d+)/);
    browser = `Firefox ${match?.[1] || ''}`;
  } else if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/(\d+)/);
    browser = `Edge ${match?.[1] || ''}`;
  } else if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/(\d+)/);
    browser = `Chrome ${match?.[1] || ''}`;
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+)/);
    browser = `Safari ${match?.[1] || ''}`;
  }

  // Detect OS
  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Detect mobile
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const device = isMobile ? '📱' : '💻';

  return `${device} ${browser}${os ? ` on ${os}` : ''}`;
}

const sentimentEmoji: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😞',
};

export async function POST(request: NextRequest) {
  if (!SLACK_WEBHOOK_URL) {
    console.error('SLACK_FEEDBACK_WEBHOOK_URL is not configured');
    return NextResponse.json({ error: 'Feedback not configured' }, { status: 500 });
  }

  try {
    const { page, pageTitle, sentiment, message, email, userAgent, referrer, viewport, timestamp } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const emoji = sentiment ? sentimentEmoji[sentiment] || '' : '';

    // Parse user agent for a cleaner display
    const browserInfo = parseUserAgent(userAgent);

    const slackMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} New Docs Feedback`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Page:*\n<https://docs.composio.dev${page}|${pageTitle || page}>`,
            },
            {
              type: 'mrkdwn',
              text: `*Sentiment:*\n${sentiment || 'Not specified'}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Feedback:*\n${message}`,
          },
        },
        ...(email
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Email:*\n${email}`,
                },
              },
            ]
          : []),
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🖥️ ${browserInfo} • 📐 ${viewport || 'Unknown'}${referrer ? ` • 🔗 From: ${referrer}` : ''} • 🕐 ${timestamp ? new Date(timestamp).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) + ' UTC' : 'Unknown'}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      throw new Error('Failed to send to Slack');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
