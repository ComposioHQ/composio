# Daily Summary — 2026-06-22
_2026-06-23T07:00:00.107965+00:00_

- New MRR: $11355.0 (net new $9183.0)
- New subscriptions: 105 · Churned: 28
- Trials: 151 · Trial→paid: 69.5%
- Visits: 2810 · Signups: 346 (12.3%) · Activations: 214
- Failed-payment rate: 5.0%

**New MRR by plan**
- Pro: $6435.0 (65 new)
- Enterprise: $3992.0 (8 new)
- Starter: $928.0 (32 new)

**Top sources**
- Meta Ads: 414 leads, 48 paid, $4752.0 new MRR
- Organic: 54 leads, 12 paid, $1968.0 new MRR
- Google Ads: 50 leads, 9 paid, $1811.0 new MRR
- Docs: 54 leads, 14 paid, $1556.0 new MRR
- GitHub: 51 leads, 10 paid, $710.0 new MRR

**Top insights**
- Stripe alert (high, score 95): failed-payment rate hit 5.0% (76 failures / 1,505 invoice attempts), crossing the threshold. This matters because elevated payment failures can directly suppress realized revenue and distort retention metrics. Next to inspect: Stripe/billing provider status during the window, the specific card decline reasons driving the 76 failures, and whether failures are concentrated in particular plans (plan concentration).
- Meta Ads is outperforming baseline: new MRR is $990 vs $792 (+25%), with 10 paid vs 8 baseline. This matters because the lift is tied to more paid conversions and could indicate a repeatable path. Next, inspect which Meta campaign/ad set/segment drove the paid increase and the landing path those users took to convert (creative, audience, placement, and page/flow).
- Docs is outperforming its recent baseline: new MRR is $941 vs $690 (+36.4%), alongside more paid conversions (9 vs 5). This matters because the lift appears tied to higher conversion volume, indicating a potentially repeatable acquisition/activation pattern from the Docs source. Next, inspect which specific campaign(s), audience segment(s), and landing path(s) within Docs drove the incremental paid conversions and MRR, and whether the mix changed vs baseline.
- Organic is outperforming baseline: new MRR is $1,741 today vs $1,210 baseline (+43.9%), with paid conversions flat (9 today vs 9 baseline). This suggests the lift is coming from higher MRR per conversion or larger deals rather than more paid volume. Next, inspect what changed within Organic: the specific campaign/source detail, audience segment, and landing path driving the higher MRR, plus whether the uplift is concentrated in a few accounts or broad-based.
- Referral is outperforming baseline: new MRR is $529 today vs $397 baseline (+33.2%; score 76.64, medium). Paid conversions also increased (11 today vs 3 baseline), suggesting the lift is translating into more paying customers, not just higher ARPA. Next to inspect: which specific referral campaign/partner drove the gain, which segments converted, and the landing path users followed before paying (to find repeatable patterns).

# Anomaly Report
_Updated 2026-06-23T07:00:00.064501+00:00_

- Failed-payment rate is **5.0%** (>= 5% threshold).
