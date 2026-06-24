from __future__ import annotations

import os
import re
from dataclasses import dataclass
from email.utils import parseaddr
from urllib.parse import urlparse

from email_support_agent.utils.gmail import create_gmail_review_draft, fetch_gmail_trigger_message
from email_support_agent.utils.state import (
    EmailSupportState,
    email_address,
    extract_email_facts,
)


FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
}
URL_RE = re.compile(r"https?://[^\s<>)\"']+", re.IGNORECASE)


@dataclass
class TrustCheckResult:
    status: str
    reasons: list[str]
    sender_domain: str | None
    link_domains: list[str]

    @property
    def should_draft(self) -> bool:
        return self.status == "trusted"


def fetch_context_node(state: EmailSupportState) -> EmailSupportState:
    """Fetch the Gmail message that triggered the workflow."""
    if state.get("fetched_email"):
        return {}
    return fetch_gmail_trigger_message(state)


def trust_check_node(state: EmailSupportState) -> EmailSupportState:
    """Run deterministic email hygiene checks before drafting."""
    facts = extract_email_facts(state)
    trust = _run_trust_check(
        from_line=facts.sender,
        body=facts.body,
        claimed_company=_extract_company(facts.subject, facts.body),
    )

    if _is_tester_sender(facts.sender) and trust.status == "suspicious":
        remaining_reasons = [
            reason
            for reason in trust.reasons
            if "free email domain" not in reason and "sender domain" not in reason
        ]
        trust = TrustCheckResult(
            status="trusted" if not remaining_reasons else "suspicious",
            reasons=remaining_reasons,
            sender_domain=trust.sender_domain,
            link_domains=trust.link_domains,
        )

    return {
        "trust": {
            "status": trust.status,
            "reasons": trust.reasons,
            "sender_domain": trust.sender_domain,
            "link_domains": trust.link_domains,
            "should_draft": trust.should_draft,
        }
    }


def classify_intent_node(state: EmailSupportState) -> EmailSupportState:
    """Classify whether the message is safe and useful to draft."""
    facts = extract_email_facts(state)
    trust_dict = state.get("trust") or {}
    trust = TrustCheckResult(
        status=str(trust_dict.get("status") or "suspicious"),
        reasons=list(trust_dict.get("reasons") or []),
        sender_domain=trust_dict.get("sender_domain"),
        link_domains=list(trust_dict.get("link_domains") or []),
    )
    intent, reasons = _classify_intent(facts.subject, facts.body, trust)
    return {"intent": intent, "decision": "draft" if intent == "support_question" else "no_draft", "reasons": reasons}


def draft_reply_node(state: EmailSupportState) -> EmailSupportState:
    """Create a Gmail draft for human review."""
    claim = state.get("message_claim") if isinstance(state.get("message_claim"), dict) else {}
    if claim and claim.get("acquired") is False:
        return {"draft_body": None, "draft_result": None}
    if state.get("decision") != "draft":
        return {"draft_body": None, "draft_result": None}
    return create_gmail_review_draft(state)


def review_pending_node(state: EmailSupportState) -> EmailSupportState:
    """Finalize the graph as review-pending after a draft is created."""
    claim = state.get("message_claim") if isinstance(state.get("message_claim"), dict) else {}
    if claim and claim.get("acquired") is False:
        reasons = [*(state.get("reasons") or []), "Duplicate Gmail trigger delivery skipped by message claim."]
        return {"decision": "duplicate_skipped", "reasons": reasons}

    if state.get("decision") == "draft":
        draft_result = state.get("draft_result") if isinstance(state.get("draft_result"), dict) else {}
        if draft_result.get("skipped_existing_draft"):
            note = "Existing Gmail draft left for human review; no new draft was created."
        else:
            note = "Draft created for human review; no email was sent."
        reasons = [*(state.get("reasons") or []), note]
        return {"decision": "review_pending", "reasons": reasons}
    return {}


def _tester_emails() -> set[str]:
    configured = os.getenv("TESTER_ALLOWED_SENDERS", "")
    return {item.strip().lower() for item in configured.split(",") if item.strip()}


def _is_tester_sender(sender: str | None) -> bool:
    address = email_address(sender)
    return bool(address and address in _tester_emails())


def _extract_company(subject: str, body: str) -> str | None:
    text = f"{subject}\n{body}"
    match = re.search(r"(?:from|represent(?:ing)?|at)\s+([A-Z][A-Za-z0-9 .-]{2,40}?)(?:[,.]|\sand\s|$)", text)
    return match.group(1).strip() if match else None


def _classify_intent(subject: str, body: str, trust: TrustCheckResult) -> tuple[str, list[str]]:
    text = f"{subject}\n{body}".lower()

    if not trust.should_draft:
        return "suspicious", [*trust.reasons]

    sensitive_terms = [
        "refund",
        "billing",
        "payment",
        "delete my account",
        "password",
        "security",
        "credit card",
        "guarantee",
        "legal",
    ]
    if any(term in text for term in sensitive_terms):
        return "needs_human", ["Message needs a human because it mentions billing, account, legal, or security-sensitive work."]

    support_terms = [
        "help",
        "support",
        "issue",
        "bug",
        "error",
        "broken",
        "question",
        "how do i",
        "how can i",
        "setup",
        "configure",
        "connect",
        "auth",
        "oauth",
        "trigger",
        "webhook",
        "gmail",
        "draft",
        "notion",
        "api key",
    ]
    if any(term in text for term in support_terms):
        return "support_question", ["Support question fits the configured workflow."]

    return "neutral_unrelated", ["Message is not clearly a supported support request."]


def _run_trust_check(*, from_line: str, body: str, claimed_company: str | None = None) -> TrustCheckResult:
    reasons: list[str] = []
    sender_domain = _email_domain(from_line)
    link_domains = sorted({domain for url in _extract_urls(body) if (domain := _domain_from_url(url))})

    if not sender_domain:
        reasons.append("Could not parse sender domain.")
    elif sender_domain in FREE_EMAIL_DOMAINS and claimed_company:
        reasons.append(f"Claims {claimed_company} but sender uses free email domain {sender_domain}.")

    return TrustCheckResult(
        status="suspicious" if reasons else "trusted",
        reasons=reasons,
        sender_domain=sender_domain,
        link_domains=link_domains,
    )


def _email_domain(from_line: str) -> str | None:
    _, address = parseaddr(from_line)
    if "@" not in address:
        return None
    return address.rsplit("@", 1)[1].lower()


def _extract_urls(text: str) -> list[str]:
    return [match.rstrip(".,);]") for match in URL_RE.findall(text or "")]


def _domain_from_url(url: str) -> str | None:
    domain = urlparse(url).netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain or None
