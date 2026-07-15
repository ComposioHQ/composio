# Recommendations

## MRR Update — Plan mix & new MRR
_2026-06-25T07:25:01.718802+00:00_

Most‑new‑MRR plan leader is currently **Pro** (latest computed day shows Pro generated **$594** of new MRR on 2026‑06‑24, with 6 new subscriptions; other plans were $0).

Why it matters: plan mix is concentrating in Pro, so today’s “new MRR” performance will swing with Pro conversion/checkout health.

What to check next: confirm today’s subscription/payment ingest is running (today’s daily metrics are empty), then verify Pro checkout/payment success and the main acquisition driver (**Meta Ads / summer-demo**) if Pro MRR is unexpectedly soft.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T07:25:33.397116+00:00_

Visitor spike alert triggered: visits in the past hour exceeded 2× the usual hourly average.

Why it matters: this can be a high-intent surge (conversion/MRR opportunity) or bot/measurement noise; either way it can skew funnel and MRR reads.

What to check next: confirm the spike is concentrated in one source/campaign (especially paid), sanity-check landing-page and signup flow health, and watch near-term revenue signals (new subscriptions / payment success) to see if the traffic is converting.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T07:26:01.171681+00:00_

Failed-payment-rate monitor triggered: payments failure rate is now above the 5% threshold. This matters because elevated failures directly suppress collected revenue and can quickly impact net new MRR if retries don’t recover.

What to check next: confirm whether the spike is concentrated in a single plan (especially Pro) or a specific acquisition source/campaign, then review recent payment processor changes/incidents and any checkout/billing deploys since the last healthy baseline (recently ~1–2% failed rate).

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T07:26:23.553934+00:00_

Churn-spike alert (>10/day) appears to be a false alarm: the latest monitor check (2026-06-25 07:00 UTC) shows no breach, and the most recent completed day in history (2026-06-24) had 3 churns.

Why it matters: if this alert is firing without a breach, we’ll miss real churn/MRR risk amid noise.

Check next: monitor config/ID mapping and the ingestion path for subscription churn events for 2026-06-25 (today’s normalized event stream looks missing).

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T07:26:43.710149+00:00_

Meta Ads lead→paid conversion monitor checked at 07:00 UTC and is **not breached**, but the measured conversion rate is **0.0** (i.e., no Meta-sourced leads have converted to paid in the current check window). This matters because it can quickly depress new MRR if Meta is a meaningful acquisition channel. Next checks: confirm Meta campaigns are still generating leads, verify lead source attribution hasn’t changed, and look for any checkout/subscription-start failures or delays in the payment pipeline.

## MRR Update — Plan mix & new MRR
_2026-06-25T08:25:14.713449+00:00_

No plan is driving new MRR **today (2026‑06‑25)** yet — there are **zero new paid subscriptions / $0 new MRR recorded so far**, so there’s no plan leader.

Why it matters: this monitor can’t identify a “top plan” until the first paid conversion lands; if this persists into peak hours, it likely indicates a tracking or billing/checkout issue (not just mix shift).

What to check next: confirm **payment_succeeded / subscription_started** events are arriving today and that plan attribution isn’t missing.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T08:25:46.082169+00:00_

Traffic spike monitor fired: we’re seeing >2× the usual visitors in the last hour (threshold breach). Why it matters: this can quickly translate into more signups/leads and (if real) incremental MRR—or it could be bot/referral noise that distorts funnel metrics. Check next: which source/campaign is driving the spike (esp. ads vs. referral), whether signup/activation rates moved with it, and any parallel change in paid conversions/new MRR.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T08:26:06.261989+00:00_

Monitor triggered on failed payments >5%, but today’s latest check shows **0.0% failed payments (not breached, checked 07:00 UTC)**—likely a noisy/duplicate alert rather than a real spike. This matters because a true jump would immediately pressure **MRR retention and cash collection**.  

Next checks: confirm the alert run used today’s window/data source, and review any recent payment failures by **plan/source** plus any retry/outage signals from the payments provider.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T08:26:36.610742+00:00_

Churn spike alert fired, but today’s loaded history doesn’t support it: the highest daily churn in the most recent snapshot is **3 churned accounts (2026‑06‑24)**, with other recent days at **2**—all well below the **>10/day** threshold. Why it matters: if this alert is false-positive, we may miss real revenue risk when churn actually spikes. Check next: monitor configuration/timezone and the churn event source (dedupe/backfill), plus today’s MRR impact reporting pipeline.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T08:27:08.166677+00:00_

Meta Ads lead→paid conversion monitor triggered because the current Meta-attributed lead-to-paid conversion rate is **0.0%** at the last check (**2026-06-25 07:00 UTC**). This matters because it can mask a paid acquisition waste and will show up quickly as an MRR slowdown if it persists.  

Next checks: confirm Meta leads are still being created, verify attribution/UTMs didn’t change, and scan recent checkout/payment and subscription start logs for Meta-sourced accounts.

## MRR Update — Plan mix & new MRR
_2026-06-25T09:24:39.065625+00:00_

Alert: “Top plan driving new MRR today” is currently **none** — there have been **0 new subscriptions and $0 new MRR** so far today (as of 09:24 UTC).  

Why it matters: this suggests a full stop in paid conversion/revenue intake today, not just a plan mix shift.  

What to check next: confirm subscription/payment events are flowing (tracking/ingestion), then review checkout/payment success path and any release/incidents since yesterday.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T09:24:54.990788+00:00_

Visitor spike alert fired: the “past hour visits > 2× average” threshold was exceeded.

Why it matters: a sudden traffic surge can be an ad/campaign change, bot activity, or a tracking anomaly, and it can materially impact downstream signup and MRR attribution.

What to check next: confirm the spike is real in the raw event stream; identify the top source/campaign driving it; sanity-check signup/activation and any payment/MRR movement shortly after; and verify tracking pixels/UTMs and bot filtering.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T09:24:59.401686+00:00_

Payment-failure alert fired (>5%), but today’s billing volume is zero: 0 failed payments out of 0 invoice attempts, so the failure rate is effectively not measurable (reported as 0.0%). This likely indicates a monitor edge case when there are no attempts, rather than a real revenue risk.

Why it matters: false positives can distract from real MRR issues.

Check next: monitor logic for 0-denominator handling and confirm there were truly no invoice attempts today.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T09:25:08.699577+00:00_

Churn spike alert fired (threshold: >10 churns/day). However, today’s snapshot shows **0 churned** and **0 events** so far (updated 09:24 UTC), and there’s **no subscription-events feed available for today** to confirm the count.

Why it matters: a true spike would directly hit net new MRR.

Check next: confirm the subscription/churn ingestion job and monitor source/plan breakdown once the feed repopulates, then re-validate churned MRR impact.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T09:25:14.055549+00:00_

Alert: Meta Ads leads are currently showing **no conversion to paid today** — in fact, there are **zero recorded events across the funnel** (visits/signups/activations/trials/new subscriptions all 0 as of 09:24 UTC), so paid conversions from Meta can’t occur.

Why it matters: this blocks new MRR attribution and may indicate a tracking/ingestion outage rather than a true performance drop.

Check next: Meta Ads spend/clicks are still coming in, recent lead creation vs. “deal won/subscription started,” and event pipeline/UTM/source tagging for Meta.

## MRR Update — Plan mix & new MRR
_2026-06-25T10:24:43.241153+00:00_

No plan is driving new MRR today—there have been zero new subscriptions and new MRR is $0 as of 10:24 UTC, so there’s no current “leader” plan.

Why it matters: this monitor firing with no activity usually indicates an early-day/ingestion gap rather than a true mix shift, and it blocks any revenue read for today.

What to check next: confirm subscription and payment event ingestion is running for today (timestamps advancing), and verify the “plan comparison” feed isn’t delayed or filtered incorrectly.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T10:25:01.283508+00:00_

Visitor-spike alert fired: the last hour’s traffic exceeded 2× the normal hourly average.

Why it matters: spikes can be good demand (campaign/press) or bad data (bot/referrer spam). Either way, it can skew funnel conversion and downstream revenue/MRR readouts today.

What to check next: confirm the spike in the raw visit stream, then identify the top source/campaign and whether signup/activation kept pace. Also sanity-check for a single referrer, unusual geo, or repeated visitor patterns (bot).

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T10:25:11.954585+00:00_

Payment-failure rate alert fired, but today’s snapshot shows **0 failed payments out of 0 invoice attempts** (failed rate **0%**) and **no revenue activity yet** (new MRR $0). This likely indicates a **monitoring/config edge case** (e.g., divide-by-zero / missing data) rather than a real spike.  

What to check next: confirm the alert logic handles **0 attempts**, verify the **payment ingest/job is running**, and spot-check yesterday’s payment attempts vs failures to ensure no backlog.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T10:25:23.172715+00:00_

Alert: Churn spike monitor triggered (>10/day), but today’s precomputed metrics show **0 churned subscriptions** and **$0 churned MRR** (as of 2026-06-25 10:24 UTC). This likely indicates a **monitoring/data freshness issue** rather than real churn—important because false churn alerts can distract from real revenue risk.

Check next: verify the monitor’s date/window and timezone, confirm the churn event feed is updating (today’s subscription events file appears missing), and reconcile against billing cancellations for the same period.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T10:25:32.004259+00:00_

Meta Ads leads → paid conversion monitor fired, but today’s pipeline looks effectively blank: no visits, signups, activations, trials, or new subscriptions recorded as of 10:24 UTC, so Meta-sourced leads aren’t converting because nothing is flowing through to paid at all. This matters because it can mask a real acquisition/payments issue and directly impacts MRR reporting. Next checks: confirm today’s event ingest is running, validate Meta lead import attribution, and verify payment/subscription events are arriving.

## MRR Update — Plan mix & new MRR
_2026-06-25T11:24:40.259905+00:00_

No plan is driving new MRR today—there have been **zero new subscriptions** and **$0 new MRR** so far, so there’s **no plan leader**.

Why it matters: this is a revenue stall for the day-to-date and can mask tracking/ingestion issues if you expected signups or billing activity.

What to check next: confirm today’s **subscription/payment event ingestion** is running, and sanity-check upstream demand (visits/signups are also at **0**).

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T11:24:57.241888+00:00_

Visitor spike alert fired: the last hour’s visits exceeded 2× the recent hourly average.

Why it matters: this can signal a campaign/press hit (good) or bot/referral spam (bad), and it will skew today’s funnel and any MRR attribution reads.

What to check next: confirm the spike is real by inspecting last-hour traffic by source/campaign and landing page, look for unusual referrers/geo/user agents, and verify whether signups/activations rose proportionally. I can’t pull the underlying event log right now (workspace path isn’t accessible), so I can’t add exact counts.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T11:25:06.193387+00:00_

Payment-failure rate alert triggered, but today there are **no invoice attempts** recorded (0 attempts, 0 failed), so the 5% threshold can’t be meaningfully evaluated yet. This matters because a real spike would immediately threaten today’s MRR collection and could signal a checkout/billing outage. Next: verify billing pipeline is ingesting events (invoice attempts/payments), confirm payment processor/webhook health, and check for any missed payment_succeeded/failed events since the last update (11:24 UTC).

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T11:25:20.369730+00:00_

Churn spike alert did **not** reproduce from the provided analytics: today’s churned subscriptions are **0** (threshold is >10/day). This matters because a false positive can mask real churn risk and distract from revenue/MRR monitoring (the team’s top interest). Next, check the monitor’s date/time window and timezone, and verify it’s reading the correct data source/table (not a stale or empty path) before escalating or paging.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T11:25:25.168340+00:00_

Alert: “Meta Ads leads → paid” conversion appears to have stopped today. As of 2026-06-25 11:24 UTC, there are zero recorded visits, signups, activations, trials, and new subscriptions (net new MRR $0), so Meta leads can’t be attributing to paid in our tracking right now.

Why it matters: this could be a tracking/ingestion outage vs. a real performance drop, and it directly impacts MRR visibility.

Check next: today’s event pipeline health, Meta source/campaign tagging, and whether any Meta leads/subscriptions are missing in ingestion.

## MRR Update — Plan mix & new MRR
_2026-06-25T12:24:41.605365+00:00_

Monitor: “Which plan is driving the most new MRR today?” has no leader yet.

What changed: As of 12:24 UTC, there are **no new subscriptions and $0 new MRR** today, so **no plan** is contributing new MRR.

Why it matters: We can’t attribute today’s revenue performance (or spot mix shifts) until paid conversions land; if this is unexpected, it may signal slowed conversions or a tracking/payment ingestion gap.

What to check next: Confirm subscription/payment events are flowing and review any payment failures; sanity-check today’s “new subscriptions” count by plan.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T12:24:59.801021+00:00_

Traffic-spike alert: the monitor tripped because visits in the last hour exceeded 2× the usual hourly average. This matters because it can quickly change top-of-funnel volume and, if it’s low quality or bot-driven, distort conversion and downstream revenue/MRR readouts.

Next checks: identify which source/campaign drove the spike, confirm it’s real users (not bots), and verify signups/activations are tracking normally so we can anticipate any impact on trial starts and MRR.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T12:25:07.794191+00:00_

Payment-failure-rate alert triggered (>5%), but today’s snapshot shows **0 invoice attempts and 0 failed payments** (failed rate **0%**). This is likely a **monitoring/denominator issue** rather than a real revenue risk. Why it matters: false positives can mask true payment degradation when invoices start flowing. Next checks: confirm the alert logic handles **zero attempts** safely, and review today’s **payment_succeeded vs payment_failed** events plus any payment-processor incident/webhook delays.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T12:25:18.480759+00:00_

Churn spike alert check: no evidence of a spike today. As of 12:24 UTC, churned subscriptions are 0 (no subscription events recorded), so the “>10 churns/day” threshold doesn’t appear met.

Why it matters: a real spike would quickly increase churned MRR and flip net new MRR negative.

What to check next: confirm the monitor’s data source/timezone and ingestion health (today shows zero events across the funnel), then review any churned accounts + churned MRR once events start landing.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T12:25:28.255957+00:00_

Meta Ads lead→paid conversion monitor fired because there are **no tracked events today** (0 leads/trials/subscriptions; net new MRR $0). This matters because the “drop” likely reflects **missing/paused ingestion or tracking**, not true performance—so we could miss a real Meta issue or overreact.

Next checks: confirm today’s Meta lead volume in the ad/CRM sources, verify attribution fields (source/campaign) still populate, and validate subscription/payment event ingestion + timestamp windowing for today.

## MRR Update — Plan mix & new MRR
_2026-06-25T13:24:39.879394+00:00_

Monitor result: no plan is driving new MRR today. As of 13:24 UTC there have been zero visits, signups, trials, new subscriptions, or payment attempts, so new MRR is $0 and there’s no plan leader.

Why it matters: revenue is flat so far today; if this persists, we’ll miss daily MRR pacing and it may indicate an ingestion or tracking outage.

Check next: confirm event pipelines are updating after 13:24 UTC and verify checkout/subscription event capture (subscription_started/payment_succeeded).

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T13:24:53.347535+00:00_

Visitor-spike alert triggered: the last hour’s visitor count exceeded 2× the recent hourly average.

Why it matters: this can be a real traffic surge (PR/ad launch) or low-quality/bot traffic that can skew funnel conversion and downstream MRR reporting.

What to check next: validate whether the spike is concentrated in a single source/campaign and whether it’s converting (signups/activations). Today’s snapshot currently shows zero visits/signups/activations and zero new MRR, so confirm the tracking pipeline isn’t delayed or broken before acting.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T13:25:00.794395+00:00_

Payment-failure rate alert fired (>5%), but today’s snapshot shows **0 invoice attempts and 0 failed payments**, so the rate is **0%**. This looks like a **monitor/data issue** (e.g., divide-by-zero handling, missing ingest, or stale job) rather than a real spike.

Why it matters: false positives can mask real billing risk and waste response time.

Check next: confirm today’s **invoice attempts** are being ingested, verify the alert’s denominator logic when attempts = 0, and re-run the daily billing rollup.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T13:25:11.686940+00:00_

Churn spike alert fired (>10 churns/day threshold). However, today’s precomputed snapshot currently shows **0 churned** and **0 churned MRR** (as of 2026-06-25 13:24 UTC), so this looks like a **monitor false positive or a timing/window mismatch** rather than an actual churn wave.

Why it matters: a real spike would quickly turn net new MRR negative.

Check next: confirm the alert’s date/time window + timezone, and verify recent **subscription_churned** event ingestion/backfill and dedupe (especially around day boundaries).

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T13:25:16.515521+00:00_

Meta Ads leads appear to have stopped converting to paid today: there are zero visits, signups, activations, trials, new subscriptions, and $0 new MRR so far (as of 13:24 UTC). This matters because it can mask a real drop in Meta lead quality or a tracking/billing break that directly impacts revenue. Next checks: Meta campaign delivery/spend, lead → signup attribution, funnel instrumentation (pixels/UTMs), and Stripe payment + webhook health for new subs.

## MRR Update — Plan mix & new MRR
_2026-06-25T14:24:40.787474+00:00_

Monitor result (as of 2026-06-25 14:24 UTC): no plan is driving new MRR today. There have been zero new subscriptions and $0 new MRR so far, so the “top plan” leader is currently none.

Why it matters: today’s revenue/MRR pace is flat; if this persists, we’ll miss daily MRR expectations and it may indicate tracking or checkout issues.

What to check next: confirm subscription/payment events are flowing (pipeline delay vs. real drop), and verify checkout/paid conversion instrumentation for today.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T14:25:01.195103+00:00_

Visitor-spike alert fired: visits in the last hour exceeded 2× the recent hourly average.

Why it matters: this usually indicates an external driver (campaign/news/SEO) or tracking noise; either way it can quickly change signup and revenue/MRR performance expectations.

What to check next: confirm analytics collection is healthy, then identify which source/campaign drove the surge and whether signup → activation → trial/subscription rates are holding.

Note: today’s precomputed snapshot shows zero visits; the spike needs validation against raw event logs.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T14:25:11.085946+00:00_

Payment-failure rate alert fired, but today there are **0 invoice attempts and 0 failed payments** (so the failure rate is **0%**). This looks like a **data/ingestion gap** rather than a real spike. It matters because we could miss real revenue risk or page on noise.

Check next: billing/subscription event pipeline for today (missing `payment_succeeded` / `payment_failed`), timestamp/timezone cutover, and whether invoice attempts are being recorded. Also confirm net-new MRR tracking isn’t impacted.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T14:25:21.286586+00:00_

Churn spike alert (threshold >10/day) triggered, but today’s snapshot shows **0 churned subscriptions** and **0 churned MRR** as of **2026-06-25 14:24 UTC**. This matters because a true spike would signal immediate revenue/MRR risk and potential billing or product issues.

What to check next: confirm the monitor’s data source/timezone and dedupe logic, then review recent **subscription_churned** events by day and segment/plan to identify any concentration driving the alert.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T14:25:30.653741+00:00_

Alert: Meta Ads leads are not converting to paid — today’s funnel shows zero activity end‑to‑end (0 visits, 0 signups/activations, 0 trials, 0 new subscriptions; net new MRR $0).  

Why it matters: if Meta traffic/spend is still running, we may be paying for leads that aren’t entering the product or aren’t reaching checkout, putting near‑term MRR at risk.  

Check next: (1) Meta lead volume vs spend today, (2) lead capture → CRM sync, (3) trial/subscription event ingestion and attribution for Meta campaigns.

## MRR Update — Plan mix & new MRR
_2026-06-25T15:24:39.978925+00:00_

No plan is driving new MRR today: there have been zero new subscriptions and new MRR is flat as of 15:24 UTC, so the “leader” plan is currently none. This matters because any plan-level MRR attribution today is effectively empty and could indicate a tracking/ingestion gap (especially if you expect mid-day sales). Check next: whether subscription/payment events are flowing for today (and whether timezone/day-boundary logic is correct), then confirm the billing webhook/ETL health and any recent deploys.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-25T15:24:53.361102+00:00_

Traffic anomaly: the “past hour visitors >2× average” monitor fired, indicating a sudden spike in visits versus the recent baseline.

Why it matters: this can be a high-intent influx (PR/launch/ad burst) or low-quality/bot traffic that distorts funnel conversion and can create noisy downstream MRR signals.

What to check next: validate the spike is real by breaking the last hour’s visits down by source/campaign, then confirm whether signups/activations rose proportionally; if not, investigate bot/referrer spam or tracking issues.

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-25T15:25:04.441895+00:00_

Payment-failure-rate alert triggered, but today’s snapshot shows **0 invoice attempts and 0 failed payments**, so the **0.0%** rate isn’t meaningful. This matters because a real rise above 5% usually signals a billing/provider issue that can quickly hit **MRR** and cash collection.

Next checks: confirm the monitor guards against **zero-volume/NaN** cases; verify the billing ingest is live (invoice attempts > 0); and review any recent spikes in **payment_failed** once attempts resume.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-25T15:25:18.032124+00:00_

Churn spike alert fired (threshold: >10 churns/day), but today’s analytics snapshot shows **0 churned** and **0 churned MRR** (updated 2026-06-25 15:24 UTC). This likely indicates a **monitoring/data freshness issue** rather than real churn—important because false churn spikes can trigger unnecessary incident response and confuse MRR tracking.

Next checks: confirm the churn query is pointed at the right day/timezone, and verify the subscription churn event feed/snapshot update pipeline is running and ingesting events.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-25T15:25:28.745878+00:00_

Meta Ads lead→paid conversion monitor fired because there are **no events recorded today** (no visits, signups, trials, subscriptions, or MRR). This matters because we can’t tell whether Meta leads are failing to convert or whether tracking/ingestion is down—either way it can mask lost revenue.

What to check next: confirm today’s Meta lead volume exists, verify funnel/subscription event ingestion is running, and spot-check recent Meta-sourced leads for downstream trial/subscription attribution.

## MRR Update — Plan mix & new MRR
_2026-06-27T05:24:39.569379+00:00_

Alert: “Which plan is driving the most new MRR today?” fired, but there’s no leader yet—no new subscriptions and $0 new MRR recorded as of 05:24 UTC.  

Why it matters: plan-level MRR attribution is currently impossible; if we expected morning conversions, this may indicate a tracking/ingestion gap rather than true performance.  

Check next: confirm today’s subscription/payment events are arriving (pipeline delay), and verify checkout/webhook health for new subscription starts.

## Monitor: Alert me if we get more than twice our average… — Alert me if we get more than twice our average…
_2026-06-27T05:25:08.159894+00:00_

Visitor-spike monitor triggered: visits in the last hour exceeded 2× the usual hourly baseline. This matters because a traffic surge should translate into more signups/activations and, ultimately, new MRR; if it doesn’t, we may be seeing low-quality traffic or a tracking/site issue.  

Next checks: identify the top source/campaign driving the spike and confirm signup/activation and payment events are also rising (and that tracking is still ingesting events).

## Monitor: Alert me if failed payments go above 5% — Alert me if failed payments go above 5%
_2026-06-27T05:25:12.266934+00:00_

Payment-failure rate alert fired, but today’s snapshot shows **0 invoice attempts and 0 failed payments** (failed rate **0%**). This usually means the monitor evaluated on too-small/empty volume (or a data ingestion delay), so the signal isn’t actionable yet for revenue/MRR.  

Check next: confirm billing webhook/event pipeline is ingesting today, and review the monitor logic for minimum invoice-attempt threshold before alerting.

## Monitor: Let me know when churn spikes above 10 in a da… — Let me know when churn spikes above 10 in a da…
_2026-06-27T05:25:26.860207+00:00_

Churn spike alert triggered (>10 churns/day), but today’s snapshot shows **0 churn events** and **$0 churned MRR**. This likely indicates a **monitor misfire or stale/misaligned data path**, not a real churn surge—important because it could send the team chasing phantom revenue risk.

Check next: confirm the churn query is pointing at the **current subscription_events stream** (not an empty/missing partition) and validate the **latest day’s churn count + churned MRR** feeding the monitor.

## Monitor: Watch whether Meta Ads leads stop converting t… — Watch whether Meta Ads leads stop converting t…
_2026-06-27T05:25:42.042173+00:00_

Meta Ads lead→paid conversion watch fired because we have **no tracked funnel or subscription events in the current snapshot** (0 visits/signups/activations/paid; $0 new MRR). This matters since Meta may still be generating leads, but we can’t see any progressing to paid—either performance dropped or tracking/data ingestion broke.

Check next: Meta campaigns are still spending/clicking, lead/deal events are arriving, and payment/subscription webhooks + ETL for today are running (look for a “no events” pipeline issue).
