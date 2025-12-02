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
  buyer_seller: string | null; // "buyer" | "seller" | null
  timeline: string | null;     // "asap", "0-3 months", etc.
  status: string;
  intent: string | null;
  urgency: string | null;      // "high" | "medium" | "low" | null
  priority: string | null;
  ai_notes: string | null;
};

// ---- Heuristics helpers -------------------------------------

function extractBuyerSeller(text: string): string | null {
  const lower = text.toLowerCase();

  const buyerPatterns = [
    "buy a house",
    "buy a home",
    "buying a house",
    "buying a home",
    "looking to buy",
    "looking to purchase",
    "purchase a house",
    "purchase a home",
    "buyer consultation",
  ];

  const sellerPatterns = [
    "sell my house",
    "sell my home",
    "selling my house",
    "selling my home",
    "list my home",
    "listing appointment",
    "home value",
    "what is my house worth",
  ];

  if (buyerPatterns.some((p) => lower.includes(p))) return "buyer";
  if (sellerPatterns.some((p) => lower.includes(p))) return "seller";

  return null;
}

function extractTimeline(text: string): { timeline: string | null; urgency: string | null } {
  const lower = text.toLowerCase();

  // ASAP / very soon
  if (
    /asap|as soon as possible|right away|immediately|this week|next week/.test(lower)
  ) {
    return { timeline: "ASAP", urgency: "high" };
  }

  // This month / next couple of months
  if (
    /this month|next month|within a couple of months|within a few months|in the next few months/.test(
      lower
    )
  ) {
    return { timeline: "0-3 months", urgency: "high" };
  }

  // 3-6 months window
  if (
    /in 3 months|in three months|in 4 months|in four months|in 5 months|in five months|in 6 months|in six months|this summer|this fall|later this year/.test(
      lower
    )
  ) {
    return { timeline: "3-6 months", urgency: "medium" };
  }

  // 6-12 months / next year
  if (
    /next year|in a year|in 9 months|in nine months|in 10 months|in ten months|in 11 months|in eleven months/.test(
      lower
    )
  ) {
    return { timeline: "6-12 months", urgency: "low" };
  }

  // Default
  return { timeline: null, urgency: "medium" };
}

function scoreLead(opts: {
  buyer_seller: string | null;
  timeline: string | null;
  userSentiment: string | null;
  callSuccessful: boolean;
  text: string;
}): { priority_score: number; intent_score: number; urgency: string | null } {
  let priority = 40;
  let intent = 50;

  // Base urgency from timeline
  let urgency: string | null = "medium";
  if (opts.timeline === "ASAP" || opts.timeline === "0-3 months") urgency = "high";
  if (opts.timeline === "6-12 months") urgency = "low";

  // Buyer / seller identified = stronger intent
  if (opts.buyer_seller) {
    intent += 15;
    priority += 10;
  }

  // Timeframe closer → higher scores
  if (opts.timeline === "ASAP") {
    priority += 25;
    intent += 20;
  } else if (opts.timeline === "0-3 months") {
    priority += 15;
    intent += 15;
  } else if (opts.timeline === "3-6 months") {
    priority += 8;
    intent += 10;
  } else if (opts.timeline === "6-12 months") {
    priority -= 5;
    intent -= 5;
  }

  // Clear buying intent phrases
  if (/buy a house|buy a home|purchase a house|purchase a home|ready to move/i.test(opts.text)) {
    intent += 10;
  }

  // Sentiment
  if (opts.userSentiment === "Positive") {
    priority += 10;
  } else if (opts.userSentiment === "Negative") {
    priority -= 10;
  }

  // Call considered successful by Retell
  if (opts.callSuccessful) {
    priority += 10;
    intent += 10;
  }

  // Clamp 0-100
  priority = Math.max(0, Math.min(100, priority));
  intent = Math.max(0, Math.min(100, intent));

  return { priority_score: priority, intent_score: intent, urgency };
}

// ---- Normalizer for Retell payload --------------------------

function normalizeRetellPayload(body: any): NormalizedLead {
  const call = body.call ?? {};
  const analysis = call.call_analysis ?? {};
  const summaryJsonRaw =
    analysis.custom_analysis_data?.summary_json ?? null;

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

  const combinedText = `${callSummary ?? ""}\n${transcript}`;

  const buyer_seller = extractBuyerSeller(combinedText);
  const { timeline, urgency: timelineUrgency } = extractTimeline(combinedText);

  const userSentiment: string | null =
    summaryJson.user_sentiment ?? analysis.user_sentiment ?? null;
  const callSuccessful: boolean =
    summaryJson.call_successful ?? analysis.call_successful ?? false;

  const { priority_score, intent_score, urgency } = scoreLead({
    buyer_seller,
    timeline,
    userSentiment,
    callSuccessful,
    text: combinedText,
  });

  return {
    agent_id: call.agent_id ?? null,
    first_name: null, // we’ll add name extraction later
    last_name: null,
    phone: call.from_number ?? null,
    email: null,
    source: "AI Phone Call",
    priority_score,
    intent_score,
    buyer_seller,
    timeline,
    status: "new",
    intent: callSummary,
    urgency: urgency ?? timelineUrgency,
    priority: null,
    ai_notes: callSummary,
  };
}

// ---- Handlers -----------------------------------------------

export async function GET() {
  return NextResponse.json({ status: "ok", method: "GET" });
}

export async function POST(req: Request) {
  try {
    // Soft auth: only block if a *wrong* secret is provided.
    const header = req.headers.get("x-intake-secret");
    if (header && INTAKE_SECRET && header !== INTAKE_SECRET) {
      console.warn("Intake request with wrong secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    console.log("📞 Incoming phone call payload:", body);

    // Right now we only handle Retell-style payloads.
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