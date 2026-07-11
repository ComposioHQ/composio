## Batch fewer URLs or raise timeout for long Firecrawl scrape jobs

For Firecrawl scrape timeouts, reduce the number of links per request, such as batching 1-2 links at a time for complex pages, or increase the scrape timeout if the tool call supports it. A useful starting timeout is `120000` milliseconds for roughly a 2-minute timeout.
