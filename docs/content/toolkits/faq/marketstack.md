## How should I handle API Coverage?

- `/stockprice`
- `/intraday`
- `/intraday/latest`
- `/intraday/{date}`
- `/tickers/{symbol}/intraday`
- `/tickers/{symbol}/intraday/latest`
- `/exchanges/{mic}/intraday`
- `/exchanges/{mic}/intraday/latest`
- `/exchanges/{mic}/intraday/{date}`

Supported intraday intervals in the OpenAPI spec are `1min`, `5min`, `10min`, `15min`, `30min`, and `1hour`. Intraday docs note that some TOPS feed fields can be null without IEX entitlement, while derived intraday data is available without an additional IEX market data agreement.
