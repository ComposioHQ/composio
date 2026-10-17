---
type: "reference"
title: "Compliance, Data Retention, and Model Training"
description: "Public guidance for data retention, model training, compliance, and enterprise security reviews."
category: "security-and-trust"
visibility: "public"
timestamp: "2026-10-17T00:00:00Z"
tags:
  - "compliance"
  - "retention"
  - "security"
  - "privacy"
---
# Compliance, Data Retention, and Model Training

## Canonical public sources

- The [security overview](https://docs.composio.dev/docs/security/overview) describes Composio's security controls, including organization and project isolation, encryption for credentials and keys, TLS in transit, token redaction, and webhook signing.
- The [data-retention documentation](https://docs.composio.dev/docs/security/data-retention) explains tool-call log retention, per-project log-storage controls, returned-file URL lifetime, and where data flows during execution.
- The [Composio Trust Center](https://trust.composio.dev) provides current compliance reports and sub-processor information.

## Payload data vs. execution metadata

- **Payload data** is the request arguments and response data of tool executions and Proxy Execute requests, plus trigger payloads. It is the content agents read from or write to connected apps, such as email, Slack messages, calendar entries, and files.
- **Execution metadata** is operational data Composio generates about each call, such as the toolkit and action, status, error codes, timing, and counts. It does not include payload data or error message text.

## Model training

On every plan, Composio does not use payload data to train or improve AI or machine learning models. The [Terms of Service](https://composio.dev/terms), [Privacy Policy](https://composio.dev/privacy), and [Data Processing Addendum](https://composio.dev/legal/dpa) all state this.

Composio may de-identify execution metadata by removing organization, project, user, and connected-account identifiers and IP addresses. It may then use that data to improve the platform, train machine learning models, and produce aggregate analytics. De-identified execution metadata is not linked to a customer or individual, and Composio may keep it indefinitely.

Features that use third-party providers are also governed by those providers' terms. See [Third-party providers](#third-party-providers).

## Retention

- **Payload data**: unless Zero Data Retention (ZDR) is on, payload data is kept in execution logs for up to one year and then automatically deleted. With ZDR on, Composio does not store payloads for covered calls.
- **Organization deletion**: when an organization is deleted, Composio deletes its payload data and execution logs within 30 days.
- **Account data** (organizations, members, developers): Composio keeps it until the customer asks for deletion. Churned members are deactivated and receive no marketing emails or product updates. On an explicit deletion request, Composio permanently deletes the account data within 30 days. It keeps only a hashed email address so the person gets no further emails, plus any records the law requires, such as billing records.

## Zero data retention and stronger terms

ZDR stops Composio from storing payloads, but it does not govern data retained or processed by third-party providers. See [Zero Data Retention](https://docs.composio.dev/docs/security/zero-data-retention).

Customers who need shorter retention windows, contractual zero data retention, or bespoke DPA or security-review terms should use the Enterprise track so the requirements can be scoped explicitly.

## FedRAMP

Composio is not FedRAMP authorized.

## Third-party providers

Some toolkit executions and browser automation rely on third-party providers or sub-processors. Data can flow to those providers during execution, and their data and training terms can differ. Use the Trust Center and data-retention documentation for current public details.
