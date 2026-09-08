---
type: "guide"
title: "Platform project settings"
description: "Current navigation for Platform project configuration and organization settings."
category: "account-and-billing"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "dashboard"
  - "settings"
---
# Platform project settings

## Project settings control one project

Open **Platform → Settings** for the selected project. The current project
settings pages are **General**, **API Keys**, **Webhooks**, **White Labeling**,
and **Usage**.

- **API Keys** creates or revokes project keys and manages any key-level IP
  allowlist. Copy a newly created secret into the customer's secret manager;
  never ask for it in support.
- **Webhooks** manages the project webhook endpoint and signing secret.
- **White Labeling** controls the hosted authentication screen. Provider OAuth
  consent-screen branding still requires the customer's own provider app.
- **Usage** shows project-level usage rather than organization-wide usage.

## Organization settings control the organization

The organization settings pages are **General**, **Members**, **Billing**,
**Usage**, and **Account Settings**. Use them for organization identity,
membership, plan and usage information, account security, and organization
deletion. Confirm whether the customer intends to change one project or the
whole organization before directing them to a destructive control.
