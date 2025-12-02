// app/leads/page.tsx
import { supabaseServer } from "@/lib/supabaseServer";

type LeadRow = {
  id: number;
  lead_created_at: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  buyer_seller: string | null;
  timeline: string | null;
  urgency: string | null;
  priority_score: number | null;
  intent_score: number | null;
  source: string | null;
};

export const dynamic = "force-dynamic"; // so you always see latest leads

export default async function LeadsPage() {
  const { data, error } = await supabaseServer
    .from("leads")
    .select(
      `
      id,
      lead_created_at,
      first_name,
      last_name,
      phone,
      email,
      buyer_seller,
      timeline,
      urgency,
      priority_score,
      intent_score,
      source
    `
    )
    .order("lead_created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error loading leads:", error);
  }

  const leads: LeadRow[] = data ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Leads Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Last {leads.length} leads captured from Retell and other sources.
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            Layer 2 · Internal
          </span>
        </header>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80">
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Timeline</th>
                <th className="px-4 py-3">Urgency</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    No leads yet. Call your Retell number to generate a test
                    lead.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const created = lead.lead_created_at
                    ? new Date(lead.lead_created_at).toLocaleString()
                    : "—";

                  const fullName =
                    [lead.first_name, lead.last_name]
                      .filter(Boolean)
                      .join(" ") || "Unknown";

                  const priority =
                    lead.priority_score !== null
                      ? `${lead.priority_score}`
                      : "—";

                  const intent =
                    lead.intent_score !== null ? `${lead.intent_score}` : "—";

                  return (
                    <tr
                      key={lead.id}
                      className="border-t border-slate-800/60 hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-2 align-top text-xs text-slate-400">
                        {created}
                      </td>
                      <td className="px-4 py-2 align-top text-sm font-medium text-slate-100">
                        {fullName}
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-slate-300">
                        {lead.phone || "—"}
                        {lead.email && (
                          <>
                            <br />
                            <span className="text-slate-400">
                              {lead.email}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top text-xs">
                        <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                          {lead.buyer_seller || "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-slate-300">
                        {lead.timeline || "—"}
                      </td>
                      <td className="px-4 py-2 align-top text-xs">
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide " +
                            (lead.urgency === "high"
                              ? "bg-red-500/10 text-red-300"
                              : lead.urgency === "medium"
                              ? "bg-amber-500/10 text-amber-300"
                              : lead.urgency === "low"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-slate-800 text-slate-300")
                          }
                        >
                          {lead.urgency || "unknown"}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-slate-300">
                        {priority}
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-slate-300">
                        {intent}
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-slate-400">
                        {lead.source || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}