import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  return NextResponse.json({ status: "ok", method: "GET" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("📞 Incoming phone call payload:", body);

    // For now we accept either { lead: { ... } } or a flat object
    const lead = body.lead ?? body;

    const nowIso = new Date().toISOString();

    const {
      agent_id,
      first_name,
      last_name,
      phone,
      email,
      source,
      priority_score,
      intent_score,
      buyer_seller,
      timeline,
      status,
      intent,
      urgency,
      priority,
      ai_notes,
    } = lead;

    const { data, error } = await supabaseServer
      .from("leads")
      .insert({
        agent_id: agent_id ?? null,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        phone: phone ?? null,
        email: email ?? null,
        source: source ?? "AI Phone Call",
        priority_score: priority_score ?? null,
        intent_score: intent_score ?? null,
        buyer_seller: buyer_seller ?? null,
        timeline: timeline ?? null,
        status: status ?? "new",
        intent: intent ?? null,
        urgency: urgency ?? null,
        priority: priority ?? null,
        ai_notes: ai_notes ?? null,
        lead_created_at: nowIso,
        event_logs: [
          {
            type: "created",
            at: nowIso,
            source: source ?? "AI Phone Call",
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