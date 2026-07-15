# Recommendations

## MRR Update — Plan mix & new MRR
_2026-06-23T18:19:58.964063+00:00_

Enterprise is driving the most new MRR today: **$998** from **2** new subscriptions, edging out Pro at **$891** from **9** subs. This matters because Enterprise contributes the largest share of today’s **$2,005** new MRR despite lower volume (higher MRR/sub). Next, validate plan mix by source (e.g., Meta Ads generated **$792** new MRR on **8** subs) and watch Starter, which had **2** churns.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-23T18:20:03.587240+00:00_

Can’t trigger this alert from the provided data: the JSON only shows **daily visits = 408** (as of **2026-06-23 18:19:54 UTC**) and no **past-hour** visit count or **average hourly** baseline.  

Why it matters: without an hourly window + baseline, we can’t detect a “>2x past-hour average” spike.  

Next: pull **visits in the last 60 minutes** and the **average visits/hour** over a defined lookback (e.g., last 7 days).

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-23T18:20:09.573959+00:00_

Failed payments are **not above 5%** today: **3 failed payments / 222 invoice attempts = 1.4% failed_rate_pct**. This is below the alert threshold, so no payment failure spike indicated. Why it matters: keeping failures low protects today’s **$1,947.0 net new MRR**. Next: monitor failed_rate_pct as invoice_attempts scale; if it rises, segment failures by plan (Starter churned **2**) and by source driving paid (15 new subscriptions).

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-23T18:20:13.829222+00:00_

Churn is **2 today**, so **no spike above 10** (threshold not breached). This keeps churned MRR low at **$58** vs **$2,005** new MRR, yielding **$1,947 net new MRR**.  

Next: monitor whether churn stays concentrated on **Starter** (**2 churn**, Pro/Enterprise **0**), and watch **failed payments (3 / 222 attempts = 1.4%)** as a leading indicator of future churn.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-23T18:20:17.798559+00:00_

Meta Ads leads are still converting to paid today: 69 leads → 8 new subscriptions (11.6% lead→paid) and $792 new MRR on $980 spend (ROAS proxy 0.81, CAC proxy $122.5). However vs the 7‑day baseline, Meta volume is down: leads -32.4%, new subs -41.6%, new MRR -41.7%, spend -39.3%. Next: verify tracking behind the “signups -81.5%” delta despite 8 signups today, and monitor lead→paid % over the next few days.
