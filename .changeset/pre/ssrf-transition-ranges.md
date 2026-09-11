---
'@composio/core': patch
---

Close the IPv6 transition ranges the SSRF guard's address blocklist let through: 6to4 (`2002::/16`), Teredo and the rest of `2001::/23`, local-use NAT64 (`64:ff9b:1::/48`), `100::/64`, `2001:db8::/32` and site-local `fec0::/10` each carry or reach an arbitrary IPv4 address, so `2002:7f00:1::` was a public-looking literal for `127.0.0.1`. IPv4 multicast and the `192.88.99.0/24` 6to4 relay range are blocked too.
