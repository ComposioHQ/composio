"""Governing Composio tool execution with SidClaw.

SidClaw (https://github.com/sidclawhq/platform) is an open-source governance
SDK for AI agents. It wraps Composio tool execution with:
  - Policy evaluation before execution (< 50ms overhead)
  - Human approval workflow for high-risk actions
  - Hash-chain audit trail for every tool call

This example uses SidClaw's modifier-compatible API to hook into Composio's
before_execute / after_execute pipeline.

Setup:
  pip install composio sidclaw
  export COMPOSIO_API_KEY=your_composio_key
  export SIDCLAW_API_KEY=ai_...

SidClaw free tier: https://app.sidclaw.com (5 agents, no credit card)
Self-host with Docker: https://github.com/sidclawhq/platform
"""

import os

from composio import Composio

from sidclaw import SidClaw
from sidclaw.middleware.composio import create_composio_governance_modifiers

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------

composio = Composio(api_key=os.environ.get("COMPOSIO_API_KEY"))

sidclaw = SidClaw(
    api_key=os.environ["SIDCLAW_API_KEY"],
    agent_id="composio-agent",
)

# ---------------------------------------------------------------------------
# Governance modifiers
#
# create_composio_governance_modifiers() returns before_execute and
# after_execute functions that plug into Composio's modifier pipeline.
#
# Before execution: SidClaw evaluates the action against your policies.
# After execution:  SidClaw records the outcome to the audit trail.
#
# Policy outcomes:
#   allow             → tool executes, outcome recorded
#   approval_required → execution pauses until a human approves in dashboard
#   deny              → ActionDeniedError raised, tool never executes
# ---------------------------------------------------------------------------

modifiers = create_composio_governance_modifiers(
    sidclaw,
    config=None,  # Optional: ComposioGovernanceConfig(data_classification={...})
)

# ---------------------------------------------------------------------------
# Execute tools with governance
#
# Pass the modifier functions to composio.tools.execute().
# SidClaw maps Composio slugs to policy fields automatically:
#   GITHUB_CREATE_ISSUE  → operation: "create_issue", target: "github"
#   GMAIL_SEND_EMAIL     → operation: "send_email",   target: "gmail"
# ---------------------------------------------------------------------------

# Example 1: create a GitHub issue (typically allowed by policy)
try:
    result = composio.tools.execute(
        user_id="default",
        slug="GITHUB_CREATE_ISSUE",
        arguments={
            "owner": "my-org",
            "repo": "backend",
            "title": "Agent-detected: disk usage above 90%",
            "body": "Automated alert from DevOps agent.",
        },
        **modifiers,
    )
    print("GitHub issue created:", result)
except Exception as e:
    print(f"Blocked: {e}")


# Example 2: send email (may require approval if policy requires it)
try:
    result = composio.tools.execute(
        user_id="default",
        slug="GMAIL_SEND_EMAIL",
        arguments={
            "to": "customer@example.com",
            "subject": "Your request has been processed",
            "body": "Hi, we've completed your request. Let us know if you need anything.",
        },
        **modifiers,
    )
    print("Email sent:", result)
except Exception as e:
    # ActionDeniedError if policy requires approval or denies the action
    print(f"Blocked by policy: {e}")
    print("Review pending approvals at https://app.sidclaw.com/dashboard/approvals")
