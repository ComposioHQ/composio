import { NextRequest, NextResponse } from 'next/server';

const SLACK_WEBHOOK_URL = process.env.SLACK_FEEDBACK_WEBHOOK_URL;

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
    const { page, sentiment, message, email } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const emoji = sentiment ? sentimentEmoji[sentiment] || '' : '';

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
              text: `*Page:*\n<https://composio.dev${page}|${page}>`,
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
