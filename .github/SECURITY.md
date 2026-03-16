# Security Policy

## Reporting a Vulnerability

We take the security of Composio seriously. If you believe you have found a security vulnerability, please report it to us through GitHub Security Advisories or email us at **security@composio.dev**

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them using one of the following methods:

- **GitHub Security Advisory (Preferred)**: Report a vulnerability directly through GitHub by visiting: [https://github.com/composiohq/composio/security/advisories/new](https://github.com/composiohq/composio/security/advisories/new)
- **Email**: If you prefer not to use GitHub Security Advisories, you can email security concerns to **security@composio.dev**

### What to Include

Please include as much of the following information as possible:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### Response Timeline

- We will acknowledge your report within **48 hours**
- We will provide a more detailed response within **7 days** indicating the next steps
- We will keep you informed of the progress toward resolving the issue
- We may ask for additional information or guidance

## Ground Rules

### Do:

- Abide by these Program Terms
- Be patient and make a good faith effort to provide clarifications to any questions we may have about your submission
- Be respectful when interacting with our team, and our team will do the same
- Perform testing only using accounts that are your own personal/test accounts
- Exercise caution when testing to avoid negative impact to data or services
- Respect privacy and make a good faith effort not to change or destroy Composio or personal data
- Stop whenever you are unsure if your test case may cause, or have caused, destructive data or systems damage; report your initial finding(s) and request authorization to continue testing

### Do NOT:

- Leave any system in a more vulnerable state than you found it
- Use or interact with accounts you do not own
- Brute force credentials or guess credentials to gain access to systems or accounts
- Change passwords of any account that is not yours or that you do not have explicit permission to change
- Perform denial of service (DoS) attacks or related tests that would cause availability interruptions or degradation of our services
- Publicly disclose a vulnerability submission without our explicit review and consent
- Engage in any form of social engineering of Composio employees, customers, or partners
- Engage or target any specific Composio employees, customers, or partners during your testing
- Access, extract, or download personal or business information beyond that which is minimally necessary for your Proof-of-Concept purposes
- Do anything that would cause destruction of Composio data or systems
- Test against production systems without permission
- Access or modify user data
- Exploit vulnerabilities beyond what is needed for a proof of concept

## Out-of-Scope Vulnerabilities

Certain vulnerabilities are considered out-of-scope for the Bug Bounty Program. Those out-of-scope vulnerabilities include, but are not limited to:

- Vulnerabilities not involving product or coding flaws, but solely relying upon possession of stolen or compromised credentials
- Vulnerabilities dependent on Phishing in a DNS domain that is not in one of our primary service domains
- Most vulnerabilities that rely on a runtime context within a sandbox, lab, staging, testing or non-production environment
- Vulnerabilities involving stolen or compromised credentials
- Open redirect resulting in a low security impact
- Credential stuffing or physical access to a device
- Any vulnerabilities requiring significant and unlikely interaction by the victim
- Man-in-the-Middle attacks except in mobile applications
- Account enumeration with a pre-defined and known list of UUIDs
- Invite/Promo code enumeration
- Ability to send push notifications/SMS messages/emails without the ability to change content
- Information disclosures related to existence of accounts
- Reports stating that a particular software component is vulnerable without an accompanying proof-of-concept
- Vulnerabilities only affecting users using outdated, unpatched, or unsupported browsers or software
- Stack traces, path disclosure, and directory listings
- CSV injection vulnerabilities
- Best practices concerns without a demonstrable information assurance issue and proof-of-concept
- Ability to take over social media pages
- Negligible security severity
- Speculative reports about theoretical damage – please always provide a proof-of-concept
- Self-XSS or similar vulnerabilities that cannot be used to exploit other users
- Vulnerabilities reported by automated scanning tools without additional analysis
- Distributed or denial of service attacks (DDoS/DoS) and/or reports on rate limiting issues
- Content injection or content spoofing issues
- Cross-site Request Forgery (CSRF) with minimal security implications
- Missing cookie flags on non-authentication cookies
- Submissions that require physical access to a victim's computer/device
- SSL/TLS protocol scan reports
- Banner grabbing issues
- Open ports or services without accompanying proof-of-concept
- Physical or social engineering attempts
- Exposed login panels without proof-of-concept
- Dangling IPs
- Subdomain takeovers without proof
- Reports on third-party products, services, or applications not owned by Composio
- Out-of-scope domains
- Leaked API Key or credentials having no impact on Composio assets

## CVEs and 0-Days

### CVE Age Requirement

We will only accept CVEs that meet all of the criteria below:

- Public for at least **60 days**
- Demonstrated impact on our environment (not theoretical)
- Reproducible with clear steps or proof-of-impact

**CVE reports that do not meet the 60-day requirement are out of scope.**

## Supported Versions

We release patches for security vulnerabilities. Please ensure you are using the latest version of Composio.

## Disclosure Policy

- We follow coordinated disclosure practices
- Security advisories will be published after a fix is available
- We appreciate responsible disclosure and will acknowledge reporters in the advisory (unless you prefer to remain anonymous)

---

**Thank you for helping keep Composio and our users safe!**

We follow responsible disclosure practices and work with researchers to ensure vulnerabilities are properly addressed before public disclosure.
