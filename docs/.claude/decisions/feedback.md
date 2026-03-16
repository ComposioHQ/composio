# Docs Feedback System

## Decision
Use Slack webhooks for collecting documentation feedback.

## Why Slack?
Considered options:
| Option | Pros | Cons |
|--------|------|------|
| GitHub Issues | Public, trackable, no backend | Requires GitHub account |
| Slack webhook | Instant visibility, team already there, simple | Can get noisy |
| Vercel KV | On same platform | Overkill, need to build UI to view |
| Email (mailto:) | Zero backend | Unstructured, easy to ignore |
| Google Sheets | Easy to analyze | Need API setup |

**Chose Slack** because:
- Team already monitors Slack
- Instant notifications
- Can discuss feedback in threads
- 2-minute setup (just a webhook URL)
- No database to maintain

## Implementation

### Components
- `components/feedback.tsx` - Modal UI (Geist-style)
- `components/page-actions.tsx` - Contains feedback button
- `app/api/feedback/route.ts` - API route that posts to Slack

### Environment Variables
```
SLACK_FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx
```

### Slack Message Format
```
😊 New Docs Feedback
Page: /docs/quickstart
Sentiment: positive
Feedback: This page was really helpful!
Email: user@example.com (optional)
```

## Setup Instructions

1. Go to https://api.slack.com/apps → Create New App
2. "From scratch" → Name it, select workspace
3. Incoming Webhooks → Toggle ON
4. Add New Webhook to Workspace → Select channel (e.g., #docs-feedback)
5. Copy webhook URL
6. Add to Vercel: Project Settings → Environment Variables

## Future Improvements
- Add rate limiting to prevent spam
- Track feedback analytics (sentiment trends, common pages)
- Auto-create GitHub issues for negative feedback
