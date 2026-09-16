---
type: "reference"
title: "Marketstack"
description: "Public support knowledge for Marketstack."
category: "toolkits-and-providers"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "marketstack"
---
# Marketstack

## API Coverage

Marketstack's official APILayer v2 OpenAPI spec includes live and intraday market data endpoints that are not yet exposed by the current Composio Marketstack toolkit actions:

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

Current Composio toolkit coverage includes EOD, ticker EOD, ticker EOD latest, ticker info/listing, exchange info/listing, splits, dividends, and currencies. If a customer asks for live quotes or a 1D chart, route this as a missing Marketstack toolkit action rather than a provider limitation.

Do not promise Marketstack support for gainers, losers, most-active, movers, or sector-performance endpoints based on current v2 docs. Those paths are not present in the official OpenAPI spec as of 2026-06-21.
