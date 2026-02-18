## Why am I seeing a DNS error while connecting my QuickBooks account?

This usually happens when the `com.intuit.quickbooks.payment` scope is included in your auth config but the QuickBooks account hasn't enabled the Payments module. Either remove that scope from your auth config and reconnect, or enable the Payments module in QuickBooks first.

---
