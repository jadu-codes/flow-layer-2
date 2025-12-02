// app/api/intake/phone-call/route.ts

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const INTAKE_SECRET = process.env.INTAKE_SECRET;

// ---------- Types ----------

type RetellWebhookBody = {
  event: string;
  call?: any;
};

type NormalizedLead = {
  agent_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  priority_score: number | null;
  intent_score: number | null;
  buyer_seller: string | null;
  timeline: string | null;
  status: string;
  intent: string | null;
  urgency: string | null;
  priority: string | null;
  ai_notes: string | null;
};

// ---------- Normalizer (Retell → Lead) ----------

function normalizeRetellPayload(body: RetellWebhookBody): NormalizedLead {
  const call = body.call ?? {};
  const analysis = call.call_analysis ?? {};

  // Retell custom JSON summary (if configured)
  const summaryJsonRaw = analysis.custom_analysis_data?.summary_json ?? null;

  let summaryJson: any = {};
  if (summaryJsonRaw && typeof summaryJsonRaw === "string") {
    try {
      summaryJson = JSON.parse(summaryJsonRaw);
    } catch (e) {
      console.error("Failed to parse summary_json:", e);
    }
  }

  const callSummary: string | null =
    summaryJson.call_summary ??
    analysis.call_summary ??
    call.transcript ??
    null;

  const transcript: string = call.transcript ?? "";

  // ---------- Buyer / Seller heuristic ----------
  const textForIntent = (callSummary ?? "") + " " + transcript;
  let buyerSeller: string | null = null;

  if (
    /buy|purchase|looking to purchase|looking to buy|buyer/i.test(textForIntent)
  ) {
    buyerSeller = "buyer";
  } else if (
    /sell|listing|list my home|sell my house|seller/i.test(textForIntent)
  ) {
    buyerSeller = "seller";
  }

  // ---------- Scoring heuristics ----------
  const userSentiment: string | null =
    summaryJson.user_sentiment ?? analysis.user_sentiment ?? null;
  const callSuccessful: boolean =
    summaryJson.call_successful ?? analysis.call_successful ?? false;

  let priorityScore = 40;
  let intentScore = 50;
  let urgency: string | null = "medium";

  // If Retell said the call was "successful", boost scores
  if (callSuccessful) {
    priorityScore += 30;
    intentScore += 20;
  }

  // Clear purchase intent
  if (/purchase a house|buy a house|buy a home/i.test(textForIntent)) {
    intentScore += 10;
  }

  // Sentiment weighting
  if (userSentiment === "Positive") {
    priorityScore += 10;
  } else if (userSentiment === "Negative") {
    priorityScore -= 10;
  }

  // Clamp scores 0–100
  priorityScore = Math.max(0, Math.min(100, priorityScore));
  intentScore = Math.max(0, Math.min(100, intentScore));

  return {
    agent_id: call.agent_id ?? null,
    first_name: null, // name capture not wired yet
    last_name: null,
    phone: call.from_number ?? null, // inbound caller
    email: null, // no email in this payload yet
    source: "AI Phone Call",
    priority_score: priorityScore,
    intent_score: intentScore,
    buyer_seller: buyerSeller,
    timeline: null, // timeframe not extracted yet
    status: "new",
    intent: callSummary,
    urgency,
    priority: null,
    ai_notes: callSummary,
  };
}

// ---------- Handlers ----------

export async function GET() {
  return NextResponse.json({ status: "ok", method: "GET" });
}

export async function POST(req: Request) {
  try {
    // If a header is sent AND a secret is configured, enforce it.
    // If no header is present, let it through (Retell can't set headers easily).
    const header = req.headers.get("x-intake-secret");
    if (header && INTAKE_SECRET && header !== INTAKE_SECRET) {
      console.warn("Intake request with wrong secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as RetellWebhookBody;
    console.log("📞 Incoming phone call payload:", body);

    // We only want to create leads on the final analyzed event.
    if (body.event !== "call_analyzed") {
      console.log("Ignoring non-analyzed event:", body.event);
      return NextResponse.json({
        status: "ignored",
        event: body.event,
      });
    }

    const norm = normalizeRetellPayload(body);
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
            raw: body, // full Retell payload for debugging
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