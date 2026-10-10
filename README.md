# Revenue Radar

A sales intelligence MVP built for ForgeHacks Online 2026.

Upload a sales CSV, compare equal-length periods, find unusual revenue days, identify product-level declines, and export a focused action plan.

## What works

- Browser-local CSV import with column mapping, quoted fields, comma / semicolon / tab delimiters, UTF-8 and BOM support.
- Explicit decimal-dot / decimal-comma number formats and currency labeling.
- Integer-cent gross revenue calculations, daily trends and equal-period comparisons.
- Product revenue, revenue share, unit totals when available, and decline contributions.
- Robust same-weekday anomaly detection using median and median absolute deviation.
- Import quality reports with rejected row reasons and possible duplicate counts.
- Deterministic, evidence-based action recommendations and a session checklist.
- Markdown report export and a downloadable synthetic demo CSV.
- Server-side OpenAI Responses API integration with consent before aggregate sharing.

The deployed MVP works without an AI key. AI explanations are explicitly disabled until the owner configures the server secret. The app does not present deterministic recommendations as an LLM response.

## Quick start

Node.js 24 and pnpm are recommended.

    pnpm install
    pnpm dev

Open http://localhost:5173.

    pnpm test
    pnpm typecheck
    pnpm build
    pnpm start

The production start script uses a local Cloudflare Worker runtime.

## CSV schema

Required fields:

| Field | Meaning | Example |
| --- | --- | --- |
| date | Sale date, YYYY-MM-DD or DD.MM.YYYY | 2026-10-01 |
| product | Product name or SKU | Cloud Hoodie |
| revenue | Gross amount for the entire row | 128.00 |

Instead of revenue, map quantity and unit_price. Unit prices are rounded to two decimals before multiplication; final line amounts are rounded to cents. When revenue is mapped, it takes precedence as the row total. Quantity and unit_price are optional in that mode and must be valid if mapped.

Optional order_id enables unique order counting. Without it, the dashboard shows sales rows, not orders. Order IDs must be present on every selected row before order counts are shown.

    date,product,quantity,unit_price,revenue
    2026-10-01,Cloud Hoodie,2,64.00,128.00
    2026-10-01,Everyday Tee,3,28.00,84.00

One currency per file. Selecting a currency changes the display label; it does not convert money.

## Optional AI

Set OPENAI_API_KEY as a server secret, never as a public client variable. Optional OPENAI_MODEL defaults to gpt-4.1-mini.

For local Cloudflare development, copy .env.example into an ignored .dev.vars file and set your key there. Do not commit the file. For hosted use, configure the secret with the hosting provider and redeploy.

The browser calls /api/insights after the user agrees to share aggregates. The server sends only selected-period totals, up to 20 product aggregates, up to 30 anomaly summaries, and quality counts to OpenAI. No original CSV, order IDs or filename is sent. Product names are included in the shared aggregate.

The request sets store=false and a token limit. This does not claim zero retention by the provider. Keys never reach the browser. Error handling hides credentials and provider response details.

Keep the hosted site private while using an owner-funded AI key. A public, paid AI deployment needs authentication, authorization, quotas and cost controls appropriate to its audience; the current MVP does not implement a public billing system.

Provider documentation:
- https://developers.openai.com/api/docs/quickstart
- https://developers.openai.com/api/docs/models/gpt-4.1-mini

## Method

The selected period ends on the latest accepted date in the export. Comparisons use the immediately preceding equal-length calendar window. Percent changes are not shown for incomplete history or a zero baseline.

Missing dates count as zero sales. A missing row cannot distinguish a closed day from an incomplete export: verify completeness before interpreting anomalies.

For each eligible day:
1. Collect gross daily revenue from the preceding 3–4 matching weekdays.
2. Calculate their median and median absolute deviation (MAD).
3. Flag a day only when its deviation exceeds max(30% of the median, 3.5 × 1.4826 × MAD, 1 currency unit).

This is a transparent heuristic, not a trained forecasting model. It uses no future observations. Signals are possible investigation targets, not proven outages or causes. Holidays, promotions and changes in seasonality can trigger signals.

Product deltas are accounting contributions to revenue change. Checks for stock, traffic, promotions and conversion are hypotheses. Profit and margin are not inferred from sales revenue.

## Demo

The synthetic dataset covers 56 days through 2026-10-10. The final 14 days contain:
- Gross revenue: $36,366.
- Previous 14 days: $56,298.
- Revenue change: -35.4%.
- Cloud Hoodie change: -67.3%, a $16,576 decline.
- Three unusual low-revenue days: September 30, October 1 and October 2.

These are synthetic numbers, not a real customer case or commercial result.

## Limits and validation

- Up to 10 MB and 50,000 CSV rows.
- Up to three years of dates.
- Refunds and negative amounts are excluded, with rejected row details.
- Monetary amounts use two decimal places; no exchange-rate conversion.
- Exact duplicates are reported and retained.
- CSV and checklist state are browser-session only and reset on reload.
- No background alerts, forecasting, ecommerce integrations or commercial users are claimed.
- Tests cover money rounding, CSV structure, decimal formats, validation, comparison windows, seasonal baselines, demo expectations and mocked AI responses.
- Live OpenAI generation has not been verified without a configured key.
- Production build and type checking are verified. A browser walkthrough verified CSV import and mapping, product sorting, anomaly views, and the action checklist.

## Main source files

- app/page.tsx — dashboard, import mapping, chart and user interactions.
- app/globals.css — responsive interface styles.
- lib/analytics.ts — CSV normalization, integer-cent calculations and detection.
- lib/ai.ts — validated AI request, prompt and provider handling.
- app/api/insights/route.ts — server endpoint.
- tests/ — calculation and AI-boundary tests.
- DEVPOST.md — factual submission copy and a short demo script.

React, TypeScript, Vinext / Vite, Tailwind CSS, Lucide and Cloudflare Workers are used. Papa Parse 5.5.3 is vendored with its MIT license. AI-assisted development was used.
