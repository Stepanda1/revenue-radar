# Revenue Radar — submission copy

## Elevator pitch

Turn a sales CSV into a clear picture of revenue changes, unusual sales days and product declines — with an evidence-based action plan and optional AI explanations.

## Inspiration

A revenue total tells a small seller what they earned. It does not explain where a change came from or where to look first. I wanted to turn a routine sales export into a short, understandable investigation plan.

## What it does

Revenue Radar imports a sales CSV and calculates gross revenue, daily trends and product performance. It compares equal-length periods, detects unusual sales days against matching weekdays, and highlights which products contributed to a decline.

The dashboard answers three practical questions:
- What changed?
- Which products and dates should I examine?
- What should I check next?

Users can inspect the baseline behind each anomaly, review import-quality issues, mark recommended checks complete, and export a Markdown report. A clearly labeled synthetic dataset makes the demo immediately usable.

## How I built it

The interface uses React, TypeScript, Vinext / Vite and Tailwind CSS. CSV parsing uses Papa Parse. Numerical analysis runs in the browser, using integer cents for money and median / median absolute deviation for same-weekday anomaly detection.

A Cloudflare Worker endpoint implements OpenAI Responses API explanations from calculated aggregates. Users must consent before these aggregates are sent. The original CSV and order IDs are not sent to the AI provider.

Current status: live AI generation requires a server-side API key, which is not yet configured. The charts, anomaly detection and calculated action plan already work independently. The MVP does not claim these deterministic recommendations are model-generated.

## Challenges

The main challenge was producing useful signals without inventing causes. A sales export can show a product-level contribution to a revenue drop, but cannot establish whether stock, marketing or an outage caused it.

I also had to handle incomplete comparison windows, missing export dates, decimal formats, invalid rows and rounding consistently. Each detected signal exposes its numerical baseline, and the interface states its limitations.

## Accomplishments

The synthetic 56-day demo reveals a 35.4% revenue decline in its final 14-day window, identifies Cloud Hoodie as the largest product decline, and flags three unusual low-sales days. These are reproducible test data, not real-world business results.

The core calculations and mocked AI integration pass 18 automated tests, type checking and a production build.

## What I learned

Keeping computation separate from explanation makes an analytics product easier to test and audit. Recommendations become more useful when they distinguish a measured observation from a hypothesis that needs investigation.

## What's next

Connect the live AI service, validate the workflow with real small sellers, then consider ecommerce imports and recurring reports. Forecasting and automated alerts are future ideas, not current features.

## Built with

TypeScript, React, Vinext, Vite, Tailwind CSS, Papa Parse, Lucide, Cloudflare Workers. OpenAI Responses API integration is implemented but needs a configured key for live generation.

## Try it out links

Use the deployed app URL only after checking that judges have access. The initial deployment is owner-private.
Upload the supplied source archive to your own GitHub repository and use that repository URL as the source link.

## 60–90 second demo script

0–10 seconds: "Revenue Radar turns a sales export into a short investigation plan. This is a synthetic demo dataset."

10–25 seconds: Show the 14-day dashboard. "Revenue dropped 35.4%. The product table shows that Cloud Hoodie accounts for the largest individual decline."

25–40 seconds: Open Anomalies. "These three days are far below the preceding matching-weekday medians. The app shows the actual numbers and the baseline."

40–55 seconds: Open Action plan. "It suggests checks for data completeness, stock, traffic and conversion. These are hypotheses, not invented causes."

55–75 seconds: Upload the downloaded demo CSV, confirm column mapping and Analyze sales. Export the report.

75–90 seconds: "The core analysis runs locally. An optional server-side AI endpoint can explain calculated aggregates after explicit consent. Live AI is not connected in this build."

## Screenshots to capture

1. Overview with the 14-day demo, revenue chart and product table.
2. Anomalies with the three flagged days.
3. Import CSV mapping dialog or Action plan.

No actual hackathon submission or video upload has been performed by the assistant.
