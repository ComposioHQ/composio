import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Maximum payload size (10KB)
 */
const MAX_PAYLOAD_SIZE = 10000;

/**
 * Maximum field lengths
 */
const MAX_PAGE_ID_LENGTH = 500;
const MAX_COMMENT_LENGTH = 5000;
const MAX_TIMESTAMP_LENGTH = 50;

/**
 * Validate ISO timestamp format
 */
function isValidTimestamp(str: string): boolean {
  if (typeof str !== 'string' || str.length > MAX_TIMESTAMP_LENGTH) return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
}

/**
 * Sanitize string input
 */
function sanitizeString(str: unknown, maxLength: number): string | null {
  if (typeof str !== 'string') return null;
  if (str.length > maxLength) return null;
  // Remove null bytes and control characters
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * API route to collect page feedback
 *
 * Security:
 * - Validates payload size
 * - Validates all field types and lengths
 * - Sanitizes string inputs
 */
export async function POST(request: NextRequest) {
  try {
    // Check payload size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      );
    }

    // Parse JSON with size limit
    let data: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_PAYLOAD_SIZE) {
        return NextResponse.json(
          { error: 'Payload too large' },
          { status: 413 }
        );
      }
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Validate data is an object
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const body = data as Record<string, unknown>;

    // Validate pageId
    const pageId = sanitizeString(body.pageId, MAX_PAGE_ID_LENGTH);
    if (!pageId) {
      return NextResponse.json(
        { error: 'Invalid or missing pageId' },
        { status: 400 }
      );
    }

    // Validate helpful (must be boolean or null)
    const helpful = body.helpful;
    if (helpful !== null && typeof helpful !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid helpful value (must be boolean or null)' },
        { status: 400 }
      );
    }

    // Validate comment (optional)
    let comment: string | null = null;
    if (body.comment !== undefined && body.comment !== null) {
      comment = sanitizeString(body.comment, MAX_COMMENT_LENGTH);
      if (comment === null) {
        return NextResponse.json(
          { error: 'Invalid comment' },
          { status: 400 }
        );
      }
    }

    // Validate timestamp
    const timestamp = body.timestamp;
    if (typeof timestamp !== 'string' || !isValidTimestamp(timestamp)) {
      return NextResponse.json(
        { error: 'Invalid timestamp' },
        { status: 400 }
      );
    }

    // Log feedback (replace with your preferred storage/analytics)
    console.log('[Feedback]', {
      pageId,
      helpful,
      comment: comment || null,
      timestamp,
    });

    // TODO: Integrate with your preferred analytics/storage:
    //
    // Option 1: Posthog
    // await posthog.capture({
    //   distinctId: 'anonymous',
    //   event: 'docs_feedback',
    //   properties: { pageId, helpful, comment, timestamp },
    // });
    //
    // Option 2: Slack webhook
    // if (process.env.SLACK_WEBHOOK_URL) {
    //   await fetch(process.env.SLACK_WEBHOOK_URL, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       text: `Docs feedback: ${helpful ? '👍' : '👎'} on ${pageId}`,
    //       attachments: comment ? [{ text: comment }] : [],
    //     }),
    //   });
    // }
    //
    // Option 3: Database (e.g., Supabase)
    // await supabase.from('feedback').insert({ pageId, helpful, comment, timestamp });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Feedback] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process feedback' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'feedback' });
}
