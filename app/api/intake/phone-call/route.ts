// app/api/intake/phone-call/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const INTAKE_SECRET = process.env.INTAKE_SECRET;

type NormalizedLead = {
  agent_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  priority_score: number | null;
  intent_score: number | null;
  buyer_seller: string | null; // "buyer" | "seller" | "renter" | null
  timeline: string | null;
  status: string;
  intent: string | null;
  urgency: string | null; // "low" | "medium" | "high" | null
  priority: string | null;
  ai_notes: string | null;
};

// ---------- small helpers ----------

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function splitName(fullName: string | null): {
  first_name: string | null;
  last_name: string | null;
} {
  if (!fullName || typeof fullName !== "string") {
    return { first_name: null, last_name: null };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: null };
  }
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ");
  return { first_name, last_name };
}

function inferBuyerSeller(text: string): string | null {
  const lower = text.toLowerCase();
  if (/(buy|purchase|looking to buy|looking to purchase)/i.test(lower)) {
    return "buyer";
  }
  if (/(sell|listing|list my (home|house))/i.test(lower)) {
    return "seller";
  }
  if (/(rent|rental|lease)/i.test(lower)) {
    return "renter";
  }
  return null;
}

function inferUrgency(timeframe: string | null): string | null {
  if (!timeframe) return null;
  const tf = timeframe.toLowerCase();

  if (/(today|tonight|tomorrow|this week|asap|immediately)/.test(tf)) {
    return "high";
  }
  if (/(next month|1-2 months|one to two months)/.test(tf)) {
    return "high";
  }
  if (/(next three to six months|3-6 months|few months)/.test(tf)) {
    return "medium";
  }
  if (/(next year|12 months|a year|long term)/.test(tf)) {
    return "low";
  }
  // default
  return "medium";
}

// ---------- Retell-specific normalizer ----------

function normalizeRetellCallAnalyzed(body: any): NormalizedLead {
  const call = body.call ?? {};
  const analysis = call.call_analysis ?? {};
  const custom = analysis.custom_analysis_data ?? {};

  // summary_json is a STRING containing JSON
  let summaryJson: any = {};
  if (typeof custom.summary_json === "string") {
    try {
      summaryJson = JSON.parse(custom.summary_json);
    } catch (err) {
      console.error("Failed to parse summary_json:", err);
    }
  }

  const callSummary: string | null =
    analysis.call_summary ?? call.transcript ?? null;

  const interest: string | null = summaryJson.interest ?? null;
  const timeframe: string | null = summaryJson.timeframe ?? null;
  const budget: string | null = summaryJson.budget ?? null;
  const email: string | null = summaryJson.email ?? null;
  const phoneFromSummary: string | null =
    summaryJson.phone_number ?? null;

  const name: string | null = summaryJson.name ?? null;
  const { first_name, last_name } = splitName(name);

  const transcript: string = call.transcript ?? "";

  const intentTextSource =
    [interest, callSummary, transcript].filter(Boolean).join(" ") || "";

  const buyer_seller = inferBuyerSeller(intentTextSource);
  const urgency = inferUrgency(timeframe);

  const userSentiment: string | null =
    summaryJson.user_sentiment ?? analysis.user_sentiment ?? null;
  const callSuccessful: boolean =
    summaryJson.call_successful ?? analysis.call_successful ?? false;

  // basic scoring with some boosts
  let priority_score = 50;
  let intent_score = 60;

  if (buyer_seller) intent_score += 10;
  if (timeframe) {
    priority_score += 10;
    intent_score += 10;
  }
  if (budget) {
    priority_score += 5;
    intent_score += 5;
  }

  if (userSentiment === "Positive") priority_score += 10;
  if (userSentiment === "Negative") priority_score -= 10;

  if (callSuccessful) {
    priority_score += 10;
    intent_score += 10;
  }

  priority_score = clamp(priority_score, 0, 100);
  intent_score = clamp(intent_score, 0, 100);

  const aiNotesParts: string[] = [];
  if (callSummary) aiNotesParts.push(callSummary);
  if (budget) aiNotesParts.push(`Budget: ${budget}`);
  if (timeframe) aiNotesParts.push(`Timeframe: ${timeframe}`);
  const ai_notes = aiNotesParts.length ? aiNotesParts.join(" | ") : null;

  return {
    agent_id: call.agent_id ?? null,
    first_name,
    last_name,
    phone: phoneFromSummary ?? call.from_number ?? null,
    email: email ?? null,
    source: "AI Phone Call",
    priority_score,
    intent_score,
    buyer_seller,
    timeline: timeframe,
    status: "new",
    intent: interest ?? callSummary,
    urgency,
    priority: null,
    ai_notes,
  };
}

// ---------- generic JSON normalizer (fallback) ----------

function normalizeGenericLeadPayload(body: any): NormalizedLead {
  const lead = body.lead ?? body;
  const summary = lead.summary ?? {};
  const meta = lead.meta ?? {};

  return {
    agent_id: lead.agent_id ?? meta.agent_id ?? null,
    first_name: lead.first_name ?? summary.first_name ?? null,
    last_name: lead.last_name ?? summary.last_name ?? null,
    phone: lead.phone ?? lead.caller_number ?? null,
    email: lead.email ?? summary.email ?? null,
    source: lead.source ?? "AI Phone Call",
    priority_score: lead.priority_score ?? null,
    intent_score: lead.intent_score ?? null,
    buyer_seller: lead.buyer_seller ?? null,
    timeline: lead.timeline ?? null,
    status: lead.status ?? "new",
    intent: lead.intent ?? summary.intent ?? null,
    urgency: lead.urgency ?? summary.urgency ?? null,
    priority: lead.priority ?? null,
    ai_notes: lead.ai_notes ?? summary.notes ?? null,
  };
}

function normalizeLeadPayload(body: any): NormalizedLead {
  // Retell webhook
  if (body && body.event === "call_analyzed" && body.call) {
    return normalizeRetellCallAnalyzed(body);
  }
  // generic / test payloads
  return normalizeGenericLeadPayload(body);
}

// ---------- routes ----------

export async function GET() {
  return NextResponse.json({ status: "ok", method: "GET" });
}

export async function POST(req: Request) {
  try {
    // TEMP: only block if header is present AND wrong
    const header = req.headers.get("x-intake-secret");
    if (header && INTAKE_SECRET && header !== INTAKE_SECRET) {
      console.warn("Intake request with wrong secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    console.log("📞 Incoming phone call payload:", body);

    const norm = normalizeLeadPayload(body);
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseServer
      .from("leads")
      .insert({
        agent_id: norm.agent_id,
        first_name: norm.first_name,
        last_name: norm.last_name,
        phone: norm.phone,
        email: norm.email,
        source: norm.source,
        priority_score: norm.priority_score,
        intent_score: norm.intent_score,
        buyer_seller: norm.buyer_seller,
        timeline: norm.timeline,
        status: norm.status,
        intent: norm.intent,
        urgency: norm.urgency,
        priority: norm.priority,
        ai_notes: norm.ai_notes,
        lead_created_at: nowIso,
        event_logs: [
          {
            type: "created",
            at: nowIso,
            source: norm.source,
            raw: body,
          },
        ],
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error("❌ Error inserting lead:", error);
      return NextResponse.json(
        { error: "Failed to save lead", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "ok", lead: data });
  } catch (err) {
    console.error("Error handling phone call payload:", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}