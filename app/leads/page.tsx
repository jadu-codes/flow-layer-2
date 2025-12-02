import { supabaseServer } from "@/lib/supabaseServer";

type LeadRow = {
  id: number;
  lead_created_at: string | null;
  created_at: string | null;

  first_name: string | null;
  last_name: string | null;

  phone: string | null;
  email: string | null;

  buyer_seller: string | null;
  timeline: string | null;

  urgency: string | null;
  priority_score: number | null;
  intent_score: number | null;

  intent: string | null;
  ai_notes: string | null;

  source: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function typeBadge(type: string | null) {
  switch (type?.toLowerCase()) {
    case "buyer":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
    case "seller":
      return "bg-violet-50 text-violet-700 ring-1 ring-violet-100";
    default:
      return "bg-slate-50 text-slate-600 ring-1 ring-slate-100";
  }
}

function urgencyBadge(urgency: string | null) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold";

  switch (urgency?.toLowerCase()) {
    case "high":
      // subtle glow + pulse
      return (
        base +
        " bg-rose-50 text-rose-700 ring-1 ring-rose-300 shadow-[0_0_8px_rgba(248,113,113,0.6)] animate-pulse"
      );
    case "medium":
      return base + " bg-amber-50 text-amber-700 ring-1 ring-amber-100";
    case "low":
      return base + " bg-sky-50 text-sky-700 ring-1 ring-sky-100";
    default:
      return base + " bg-slate-50 text-slate-600 ring-1 ring-slate-100";
  }
}

function ScorePill({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
        <span className="mr-1 text-[10px] font-semibold">{label}</span>—
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100">
      <span className="mr-1 text-[10px] font-semibold">{label}</span>
      {value}
    </span>
  );
}

export default async function LeadsPage() {
  const { data, error } = await supabaseServer
    .from("leads")
    .select("*")
    .order("lead_created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch leads", error);
  }

  const leads: LeadRow[] = (data as any[]) ?? [];

  const todayStr = new Date().toDateString();
  const todaysLeads = leads.filter((lead) => {
    const ts = lead.lead_created_at ?? lead.created_at;
    if (!ts) return false;
    return new Date(ts).toDateString() === todayStr;
  });

  const totalLeads = leads.length;
  const todayCount = todaysLeads.length;

  const avgPriorityOverall =
    totalLeads > 0
      ? Math.round(
          leads.reduce((sum, l) => sum + (l.priority_score ?? 0), 0) /
            totalLeads,
        )
      : 0;

  const avgIntentOverall =
    totalLeads > 0
      ? Math.round(
          leads.reduce((sum, l) => sum + (l.intent_score ?? 0), 0) / totalLeads,
        )
      : 0;

  const highUrgencyCount = leads.filter(
    (l) => l.urgency?.toLowerCase() === "high",
  ).length;

  const topLeadToday =
    todaysLeads
      .slice()
      .sort((a, b) => {
        const aScore = (a.priority_score ?? 0) + (a.intent_score ?? 0);
        const bScore = (b.priority_score ?? 0) + (b.intent_score ?? 0);
        return bScore - aScore;
      })[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100">
              Layer 2 · Internal
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Joel&apos;s Lead Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Live feed from your AI phone agent. Track intent, urgency, and let
              the system bubble the best leads to the top.
            </p>
          </div>
        </header>

        {/* KPI row */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Total Leads
            </p>
            <p className="mt-2 text-2xl font-semibold">{totalLeads}</p>
            <p className="mt-1 text-xs text-slate-500">
              Last {leads.length} captured in Supabase.
            </p>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              New Today
            </p>
            <p className="mt-2 text-2xl font-semibold">{todayCount}</p>
            <p className="mt-1 text-xs text-slate-500">
              Based on today&apos;s call timestamps.
            </p>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Avg. Priority
            </p>
            <p className="mt-2 text-2xl font-semibold">{avgPriorityOverall}</p>
            <p className="mt-1 text-xs text-slate-500">
              Across all stored leads.
            </p>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              High-Urgency Leads
            </p>
            <p className="mt-2 text-2xl font-semibold">{highUrgencyCount}</p>
            <p className="mt-1 text-xs text-slate-500">
              Leads flagged as High urgency.
            </p>
          </div>
        </section>

        {/* Top lead of the day */}
        {topLeadToday && (
          <section className="rounded-3xl bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400 p-[1px] shadow-md">
            <div className="flex flex-col gap-4 rounded-3xl bg-white/95 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Top Lead of the Day
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {(topLeadToday.first_name || topLeadToday.last_name
                    ? `${topLeadToday.first_name ?? ""} ${
                        topLeadToday.last_name ?? ""
                      }`
                    : "Unknown"
                  ).trim()}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {topLeadToday.intent || "No intent summary available yet."}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Created {formatDate(topLeadToday.lead_created_at ?? null)} ·{" "}
                  {topLeadToday.source || "Unknown source"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cx(
                    "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold",
                    typeBadge(topLeadToday.buyer_seller),
                  )}
                >
                  {(topLeadToday.buyer_seller ?? "UNKNOWN").toUpperCase()}
                </span>
                <span className={urgencyBadge(topLeadToday.urgency)}>
                  {(topLeadToday.urgency ?? "Unknown").toUpperCase()}
                </span>
                <ScorePill
                  value={topLeadToday.priority_score}
                  label="P"
                />
                <ScorePill value={topLeadToday.intent_score} label="I" />
              </div>
            </div>
          </section>
        )}

        {/* Lead cards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Latest leads (max 100) from Supabase.</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live sync
            </span>
          </div>

          {leads.length === 0 && (
            <div className="mt-4 rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm ring-1 ring-slate-200">
              No leads yet. Once your AI receptionist starts taking calls,
              they&apos;ll appear here automatically.
            </div>
          )}

          <div className="space-y-3">
            {leads.map((lead) => {
              const createdTs = lead.lead_created_at ?? lead.created_at;
              const fullName =
                (lead.first_name || lead.last_name) &&
                `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
              const typeLabel = (lead.buyer_seller ?? "Unknown").toUpperCase();
              const contact =
                lead.phone && lead.email
                  ? `${lead.phone} · ${lead.email}`
                  : lead.phone || lead.email || "No contact info";
              const noteText =
                lead.ai_notes || lead.intent || "No AI notes captured yet.";
              const preview =
                noteText.length > 90
                  ? noteText.slice(0, 90).trimEnd() + "…"
                  : noteText;

              return (
                <div
                  key={lead.id}
                  className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-[1px] hover:shadow-md"
                >
                  {/* Top row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {formatDate(createdTs)} · {lead.source || "AI Phone Call"}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">
                        {fullName || "Unknown"}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">{contact}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span
                        className={cx(
                          "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          typeBadge(lead.buyer_seller),
                        )}
                      >
                        {typeLabel}
                      </span>
                      <span className={urgencyBadge(lead.urgency)}>
                        {(lead.urgency ?? "Unknown").toUpperCase()}
                      </span>
                      <ScorePill value={lead.priority_score} label="P" />
                      <ScorePill value={lead.intent_score} label="I" />
                    </div>
                  </div>

                  {/* Middle row */}
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
                    <div>
                      <span className="font-semibold text-slate-400">
                        Timeline:
                      </span>{" "}
                      {lead.timeline || "—"}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400">
                        Type:
                      </span>{" "}
                      {lead.buyer_seller || "Unknown"}
                    </div>
                  </div>

                  {/* Notes with expand */}
                  <div className="mt-3">
                    <details className="group rounded-xl bg-slate-50 px-3 py-2">
                      <summary className="flex cursor-pointer items-center justify-between text-xs text-slate-600">
                        <span className="mr-3 flex-1 truncate">
                          {preview}
                        </span>
                        <span className="text-[11px] font-medium text-indigo-600 group-open:hidden">
                          Expand
                        </span>
                        <span className="hidden text-[11px] font-medium text-indigo-600 group-open:inline">
                          Collapse
                        </span>
                      </summary>
                      <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                        {noteText}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}