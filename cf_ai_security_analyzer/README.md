Cloudflare AI Website Security Analyzer (cf_ai_security_analyzer)
Click on this link or copy paste in browser to access security-analyser: https://security-analyzer.pages.dev/
- **Frontend (Cloudflare Pages):** https://security-analyzer.pages.dev/
- **Backend API (Cloudflare Worker):** https://cf-ai-security-analyzer-worker.prajw81020.workers.dev

Overview

This project is an AI-powered website security analyzer built entirely on Cloudflare’s serverless platform. The goal was to build something practical that combines real infrastructure, AI, and state — not just a demo chatbot.

Users can enter a website URL, get a security-focused analysis of HTTP headers, and then ask follow-up questions in a chat-style interface. The system remembers the analysis per session, so the AI can answer questions with full context instead of starting from scratch each time.

This project was built to better understand Cloudflare Workers, Durable Objects, Workers AI, and how they fit together in a real-world application.

What the app does

At a high level, the flow looks like this:

A user enters a website URL and clicks Analyze

A Cloudflare Worker fetches the site’s HTTP response headers

Security-relevant headers are extracted and normalized

The data is sent to Workers AI (Llama 3.3) to generate a clear, plain-English security analysis

The analysis and raw data are stored in a Durable Object, tied to the user’s session

The report is shown in the UI

The user can ask follow-up questions like:

“What is CSP?”

“How serious is this issue?”

“How can I fix this?”

“Give me a summary”

The AI answers using the stored analysis and chat history, so responses stay contextual

The result is a simple but realistic security analysis tool with persistent memory and conversational interaction.

Architecture

Everything runs on Cloudflare:

Cloudflare Worker
Acts as the backend coordinator. It handles URL validation, header fetching, prompt construction, calls to Workers AI, CORS handling, and routing.

Durable Objects
Used to persist session state. Each session stores:

The analyzed URL

Normalized security headers

The AI-generated report

Chat history
This enables true context-aware conversations.

Workers AI (Llama 3.3)
Generates the initial security report, answers follow-up questions, and produces summaries.

Cloudflare Pages
Hosts the static frontend UI (HTML, CSS, JavaScript).

This project runs fully on the Cloudflare free tier, with no authentication or external backend services.
Running locally

You’ll need Node.js, npm, and Cloudflare Wrangler.

Start the Worker
cd worker
npm install
npx wrangler dev


Note: Workers AI requires remote mode. Make sure you have a workers.dev subdomain set up.

Open the UI

Open ui/index.html directly in your browser.

For local testing, update script.js to point to your local Worker URL (usually http://localhost:8787).

Deployment
Backend (Cloudflare Worker)
cd worker
npx wrangler login
npx wrangler deploy


Example deployed Worker URL:

https://cf-ai-security-analyzer-worker.prajw81020.workers.dev

Frontend (Cloudflare Pages)

The frontend is deployed using Cloudflare Pages (not Workers).

Configuration used:

Framework preset: None

Build command: (empty)

Build output directory: ui

Root directory: /

Once deployed, the Pages site serves the static UI and communicates with the Worker API.

Why this project

This project was built to:

Learn Cloudflare’s serverless stack end-to-end

Understand how to combine AI with real application state

Build something deployable, not just theoretical

Practice debugging real production issues (deployments, bindings, routing, CORS, Pages vs Workers)
