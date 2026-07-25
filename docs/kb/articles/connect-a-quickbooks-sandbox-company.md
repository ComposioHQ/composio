QuickBooks sandbox companies live behind a different Intuit host than production companies. Pass `https://sandbox-quickbooks.api.intuit.com` as the base URL when you initiate the connection. Production connections use Intuit's production API base URL.

## Custom auth and token URLs

The [QuickBooks toolkit](/toolkits/quickbooks) accepts auth and token URLs during connection initiation. If your sandbox or custom Intuit OAuth flow needs endpoints other than the defaults, use a toolkit version that supports passing those URLs and supply them at initiation.

Keep sandbox and production on separate auth configs. Sharing one auth config across both means every new connection inherits whichever base URL was configured last.
