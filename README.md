# FF Analyzer — Funders First

Bank statement & MCA agreement analysis tool. Upload a PDF bank statement, get structured underwriting data ready for the UW Calculator.

## Setup

1. Clone this repo
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and add your Anthropic API key
4. `npm run dev`

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel → Framework: Next.js
3. Add `ANTHROPIC_API_KEY` environment variable in Vercel settings
4. Deploy

## Features

- Native PDF and scanned image support (Claude vision)
- MCA position detection (165+ known funders)
- Revenue classification with exclusion logic
- DSR calculation and negotiation posture
- CSV export mapped to UW Calculator fields
