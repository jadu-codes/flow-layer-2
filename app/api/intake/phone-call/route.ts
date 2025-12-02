import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const INTAKE_SECRET = process.env.INTAKE_SECRET;

// Very simple normalizer for now.
function normalizeLeadPayload(body: any) {
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

export async function GET() {
  return NextResponse.json({ status: "ok", method: "GET" });
}

export async function POST(req: Request) {
  try {
    // 🔓 TEMPORARY: only block if someone sends a *wrong* secret.
    // If there is no header, we let it through (for Retell).
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