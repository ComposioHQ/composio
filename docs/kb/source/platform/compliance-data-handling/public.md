---
type: "reference"
title: "Compliance, Data Retention, and Model Training"
description: "Public guidance for data retention, model training, compliance, and enterprise security reviews."
category: "security-and-trust"
visibility: "public"
timestamp: "2026-07-24T00:00:00Z"
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

## Zero data retention and no-training requirements

Standard plans do not guarantee end-to-end zero data retention or zero training. The per-project **Don't store data** setting reduces what Composio stores, but it does not govern data retained or processed by third-party providers.

Customers who require contractual zero-data-retention, no-training, DPA, or security-review terms should use the Enterprise track so the requirements can be scoped explicitly.

## Model training

Do not infer a blanket no-training guarantee. Features that use third-party providers are also governed by those providers' terms. For an end-to-end contractual no-training requirement, use the Enterprise track.

## FedRAMP

Composio is not FedRAMP authorized.

## Third-party providers

Some toolkit executions and browser automation rely on third-party providers or sub-processors. Data can flow to those providers during execution, and their data and training terms can differ. Use the Trust Center and data-retention documentation for current public details.
