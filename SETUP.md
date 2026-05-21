# CX Sales Bridge — Setup Guide

A HubSpot private app that shows AI-generated CX ticket summaries directly on
contact records, so your sales team never has to dig through the support queue.

---

## Prerequisites

- HubSpot **Enterprise** subscription (required for UI Extensions + serverless)
- A HubSpot **developer test account** (free — use this to build and test first)
- Node.js 18+ installed locally
- HubSpot CLI installed: `npm install -g @hubspot/cli`

---

## Step 1 — Get your Anthropic API key

1. Go to https://console.anthropic.com
2. Create an API key and copy it — you'll need it in Step 4

---

## Step 2 — Create a HubSpot Private App

1. In HubSpot, go to **Settings → Integrations → Private Apps**
2. Click **Create a private app**
3. Name it: `CX Sales Bridge`
4. Under **Scopes**, add:
   - `crm.objects.contacts.read`
   - `crm.objects.tickets.read`
   - `crm.objects.notes.write`
   - `crm.objects.notes.read`
5. Click **Create app** and copy the **Access Token** — you'll need it in Step 4

---

## Step 3 — Connect the HubSpot CLI to your portal

```bash
# Authenticate the CLI with your HubSpot account
hs auth

# Follow the prompts — it will open a browser to authorise
# Select the portal you want to deploy to
```

---

## Step 4 — Add secrets to HubSpot

Your Anthropic API key is stored securely in HubSpot's secrets vault —
it never touches your code or gets committed to Git.

```bash
# From inside the project folder:
cd cx-sales-bridge

# Add your Anthropic API key as a secret
hs secrets add ANTHROPIC_API_KEY
# Paste your Anthropic key when prompted

# The private app access token is injected automatically via context
# in the serverless function — no need to store it as a secret
```

---

## Step 5 — Deploy the project

```bash
# From the cx-sales-bridge folder:
hs project upload

# The CLI will:
# 1. Bundle your serverless function
# 2. Deploy the CRM card
# 3. Register the extension in your portal
```

---

## Step 6 — Add the card to contact records

1. In HubSpot, open any **Contact** record
2. Click the **Customise** button on the right sidebar (pencil icon)
3. Click **Add cards**
4. Find **CX Sales Bridge** and add it
5. Save the layout

The card will now appear in the contact sidebar for your whole sales team.

---

## Step 7 — Test it

1. Open a contact record that has support tickets
2. Find the **CX Ticket Summary** card in the sidebar
3. Click **Generate Summary**
4. The card fetches tickets, runs the AI summary, and displays it
5. Click **Save as Note on Record** to persist it so all reps can see it

---

## Project Structure

```
cx-sales-bridge/
├── hsproject.json                          # HubSpot project config
└── src/
    └── app/
        ├── app.json                        # App scopes + card registration
        ├── extensions/
        │   └── TicketSummaryCard.jsx       # React UI — shows in sidebar
        └── app.functions/
            ├── serverless.json             # Function registration + secrets
            ├── package.json               # npm deps (axios)
            └── summarize-tickets.js       # Server-side logic:
                                           #   fetches tickets from HubSpot
                                           #   calls Claude API
                                           #   optionally writes a note
```

---

## How it works

1. Sales rep opens a contact → card loads in the sidebar
2. Rep clicks **Generate Summary**
3. HubSpot runs `summarize-tickets.js` server-side:
   - Searches for all tickets associated with the contact
   - Sends ticket content to Claude API for summarization
   - Returns a 3–4 sentence sales-focused summary
4. Card displays the summary and ticket list
5. Rep clicks **Save as Note** → summary is written back to the contact record

---

## Troubleshooting

**"No tickets found"** — Check that the contact has tickets associated in the
CX pipeline. Tickets must be associated to the contact record, not just the
company.

**"Unexpected error from function"** — Run `hs project logs` to see serverless
function logs. Check that your `ANTHROPIC_API_KEY` secret was added correctly
with `hs secrets list`.

**Card doesn't appear** — Make sure you've added it to the contact sidebar
layout in Step 6. Each rep may need to do this once, or an admin can set it as
the default layout.

**Enterprise subscription required** — Serverless functions in UI Extensions
require a HubSpot Enterprise plan. You can develop and test for free using a
HubSpot developer test account at https://app.hubspot.com/developer-test-account
