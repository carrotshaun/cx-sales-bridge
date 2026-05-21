const axios = require("axios");

async function getContact(contactId, accessToken) {
  const res = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
    {
      params: { properties: "firstname,lastname" },
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const { firstname, lastname } = res.data.properties;
  return [firstname, lastname].filter(Boolean).join(" ") || "this contact";
}

async function getTicketsForContact(contactId, accessToken) {
  const response = await axios.post(
    "https://api.hubapi.com/crm/v3/objects/tickets/search",
    {
      filterGroups: [
        {
          filters: [
            { propertyName: "associations.contact", operator: "EQ", value: String(contactId) },
          ],
        },
      ],
      properties: ["subject", "content", "hs_ticket_priority", "hs_pipeline_stage", "createdate"],
      limit: 50,
    },
    {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    }
  );
  return response.data.results || [];
}

async function generateSummary(tickets, contactName, anthropicKey) {
  const ticketText = tickets
    .map(
      (t, i) =>
        `Ticket ${i + 1} (${new Date(t.properties.createdate).toLocaleDateString()}):
Subject: ${t.properties.subject || "(no subject)"}
Priority: ${t.properties.hs_ticket_priority || "Normal"}
Content: ${t.properties.content || "(no details)"}`
    )
    .join("\n\n---\n\n");

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are writing a brief internal note for a sales rep about a customer's support history.

Customer: ${contactName}
Total tickets: ${tickets.length}

Support tickets:
${ticketText}

Write 3–4 sentences for the sales team covering:
1. Key issues this customer has raised with support
2. Any notable signals (frustration, feature requests, interest in upgrades, repeated issues)
3. A specific recommended sales action (e.g. proactive check-in, upsell opportunity, at-risk flag)

Be direct and specific. Write in plain prose — no bullet points, no headers.`,
        },
      ],
    },
    {
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  const content = response.data.content || [];
  const text = content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) throw new Error("Claude returned an empty response");
  return text;
}

async function createNote(contactId, summary, ticketCount, accessToken) {
  const noteBody = `[CX Ticket Summary — ${new Date().toLocaleDateString()}]\n\n${summary}\n\n(Auto-generated from ${ticketCount} support ticket(s) by CX Sales Bridge)`;

  const noteResponse = await axios.post(
    "https://api.hubapi.com/engagements/v1/engagements",
    {
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: {
        contactIds: [Number(contactId)],
        companyIds: [],
        dealIds: [],
        ownerIds: [],
        ticketIds: [],
      },
      metadata: { body: noteBody },
    },
    {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    }
  );
  return noteResponse.data.engagement?.id;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://app.hubspot.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { contactId, saveNote = false } = req.body || {};
  const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!contactId) return res.status(400).json({ error: "contactId is required" });
  if (!accessToken || !anthropicKey) {
    return res.status(500).json({ error: "Server configuration error: missing API keys" });
  }

  try {
    const [contactName, tickets] = await Promise.all([
      getContact(contactId, accessToken),
      getTicketsForContact(contactId, accessToken),
    ]);

    if (tickets.length === 0) {
      return res.status(200).json({
        summary: null,
        ticketCount: 0,
        message: "No support tickets found for this contact.",
      });
    }

    const summary = await generateSummary(tickets, contactName, anthropicKey);

    let noteId = null;
    if (saveNote) {
      noteId = await createNote(contactId, summary, tickets.length, accessToken);
    }

    return res.status(200).json({
      summary,
      ticketCount: tickets.length,
      noteId,
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.properties.subject || "(no subject)",
        priority: t.properties.hs_ticket_priority || "",
        created: t.properties.createdate,
        content: t.properties.content || "",
      })),
    });
  } catch (err) {
    console.error("CX Sales Bridge error:", err.message);
    return res.status(500).json({ error: err.message || "An unexpected error occurred." });
  }
};
