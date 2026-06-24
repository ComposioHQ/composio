# Workflow Files

This folder is the personalization layer for the email support workflow.

Edit `support_email.md` before connecting a real inbox. Add the company context, support policy, FAQ, escalation rules, and examples that the draft workflow should follow.

The app loads this file through `EMAIL_WORKFLOW_PATH` in `.env`:

```text
EMAIL_WORKFLOW_PATH=workflows/support_email.md
```

Create another Markdown file in this folder if you want a different support policy for another product or team.
