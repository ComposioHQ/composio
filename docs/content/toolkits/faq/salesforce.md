## How do I set up custom OAuth credentials for Salesforce?

For a step-by-step guide on creating and configuring your own Salesforce OAuth credentials with Composio, see [How to create OAuth credentials for Salesforce](https://composio.dev/auth/salesforce).

## Why can't I find items I created in Salesforce?

Created records may not appear in a given Salesforce view. Use search to confirm they exist.

## How do I query relationships like Pricebooks and Opportunities?

Use SOQL subqueries to traverse relationships. For example, Products → Pricebooks → Opportunities:

```sql
SELECT Id, Name,
  (SELECT Id, Quantity, UnitPrice, TotalPrice, PricebookEntry.Product2.Name FROM OpportunityLineItems)
FROM Opportunity
```

## What fields are required when connecting Salesforce?

You need your subdomain (e.g., `your-company.my`) and instance endpoint `/services/data/v61.0`. If you see `URL_NOT_RESET`, replace the `login` subdomain with your organization's subdomain.

## What happens to deprecated Salesforce tools?

Deprecated tools continue to work until removed. Check tool descriptions for "DEPRECATED:" markers.

---
