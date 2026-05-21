import {
  hubspot,
  Button,
  Divider,
  Flex,
  Heading,
  LoadingSpinner,
  Text,
  Tag,
  Alert,
  Box,
  Stack,
} from "@hubspot/ui-extensions";
import { useState } from "react";

// Set after Vercel deployment — replace with your actual Vercel URL
const SUMMARIZE_URL = "https://cx-sales-bridge2.vercel.app/api/summarize-tickets";

hubspot.extend(({ context, actions }) => (
  <TicketSummaryCard context={context} onAlert={actions.addAlert} />
));

function priorityVariant(priority) {
  const p = (priority || "").toUpperCase();
  if (p === "HIGH") return "error";
  if (p === "MEDIUM") return "warning";
  return "default";
}

function TicketRow({ ticket, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box padding="small" border="1px solid" borderRadius="small">
      <Flex justify="between" align="center">
        <Flex gap="small" align="center">
          <Text format={{ fontWeight: "bold" }}>#{index + 1}</Text>
          <Text>{ticket.subject || "Untitled ticket"}</Text>
          {ticket.priority && (
            <Tag variant={priorityVariant(ticket.priority)}>
              {ticket.priority}
            </Tag>
          )}
        </Flex>
        <Button
          variant="transparent"
          size="xs"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Hide" : "View"}
        </Button>
      </Flex>

      {expanded && (
        <Box padding="extra-small">
          <Text variant="microcopy" format={{ color: "medium" }}>
            {new Date(ticket.created).toLocaleDateString()}
          </Text>
          <Text>
            {ticket.content || "(No content recorded for this ticket)"}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function TicketSummaryCard({ context, onAlert }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const callApi = async (saveNote) => {
    const response = await hubspot.fetch(SUMMARIZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: context.crm.objectId, saveNote }),
    });

    const text = await response.text();

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const data = JSON.parse(text);
        errMsg = data.error || errMsg;
      } catch {
        errMsg = `${errMsg}: ${text || "(empty response)"}`;
      }
      throw new Error(errMsg);
    }

    if (!text) throw new Error("Empty response from server");

    return JSON.parse(text);
  };

  const fetchSummary = async () => {
    setState("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const data = await callApi(false);
      setResult(data);
      setState("done");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong.");
      setState("error");
    }
  };

  const saveNote = async () => {
    setSaving(true);
    try {
      await callApi(true);
      onAlert({
        type: "success",
        message: "Summary saved as a note on this contact record.",
      });
    } catch (err) {
      onAlert({
        type: "danger",
        message: err.message || "Could not save note.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack direction="column" gap="medium">
      <Flex justify="between" align="center">
        <Heading>CX Ticket Summary</Heading>
        {state !== "loading" && (
          <Button variant="secondary" size="sm" onClick={fetchSummary}>
            {state === "done" ? "Refresh" : "Generate Summary"}
          </Button>
        )}
      </Flex>

      {state === "loading" && (
        <Flex justify="center" align="center" direction="column" gap="small">
          <LoadingSpinner label="Fetching tickets and summarizing…" />
          <Text variant="microcopy" format={{ color: "medium" }}>
            Pulling support tickets and running AI summary…
          </Text>
        </Flex>
      )}

      {state === "error" && (
        <Alert variant="error" title="Something went wrong">
          {errorMsg}
        </Alert>
      )}

      {state === "done" && result?.ticketCount === 0 && (
        <Alert variant="info" title="No tickets found">
          This contact has no support tickets on record.
        </Alert>
      )}

      {state === "done" && result?.ticketCount > 0 && (
        <>
          <Box padding="medium" border="1px solid" borderRadius="medium">
            <Flex justify="between" align="center">
              <Text format={{ fontWeight: "bold", color: "primary" }}>
                AI Sales Summary
              </Text>
              <Tag variant="info">{result.ticketCount} tickets</Tag>
            </Flex>
            <Divider />
            <Text>{result.summary}</Text>
          </Box>

          <Button
            variant="primary"
            size="sm"
            onClick={saveNote}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save as Note on Record"}
          </Button>

          <Divider />

          <Text format={{ fontWeight: "bold" }}>Source Tickets</Text>
          <Stack direction="column" gap="small">
            {result.tickets.map((ticket, i) => (
              <TicketRow key={ticket.id} ticket={ticket} index={i} />
            ))}
          </Stack>
        </>
      )}

      {state === "idle" && (
        <Text format={{ color: "medium" }}>
          Click Generate Summary to pull this contact's support tickets and get
          an AI-written summary for your sales team.
        </Text>
      )}
    </Stack>
  );
}
