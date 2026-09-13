/**
 * Phase F3 — Admin usage board.
 * Cache optimization statistics, token economics and popular concepts, read
 * from the admin-gated `getUsageSummary` aggregate over `ai_usage_events`.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUsageSummary } from "@/lib/usage.functions";

const btn =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-muted disabled:opacity-40";

const WINDOWS = [7, 30, 90];

const num = (n: number) => n.toLocaleString();
const credits = (n: number) => `${n.toFixed(n < 10 ? 3 : 1)} cr`;

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="border border-border px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
      <div className={`font-mono text-lg font-bold ${tone ?? ""}`}>{v}</div>
    </div>
  );
}

export function UsagePanel() {
  const fetchUsage = useServerFn(getUsageSummary);
  const [days, setDays] = useState(30);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ai-usage-summary", days],
    queryFn: () => fetchUsage({ data: { days } }),
    staleTime: 30_000,
  });

  const maxDayCalls = Math.max(1, ...(data?.byDay ?? []).map((d) => d.calls));

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className={`${btn} ${w === days ? "bg-muted" : ""}`}
            onClick={() => setDays(w)}
          >
            Last {w}d
          </button>
        ))}
        <button type="button" className={btn} disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && <p className="mt-4 font-mono text-xs text-muted-foreground">Loading usage board…</p>}
      {error && (
        <p className="mt-4 font-mono text-xs text-destructive">
          Could not load usage: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat k="Calls" v={num(data.calls)} />
            <Stat
              k="Cache hit rate"
              v={`${data.hitRate}%`}
              tone={data.hitRate >= 40 ? "text-emerald-600 dark:text-emerald-400" : ""}
            />
            <Stat k="Credits spent" v={credits(data.spentCredits)} />
            <Stat
              k="Credits saved"
              v={credits(data.savedCredits)}
              tone="text-emerald-600 dark:text-emerald-400"
            />
            <Stat k="Tokens in/out" v={`${num(data.promptTokens)}/${num(data.completionTokens)}`} />
            <Stat
              k="Errors"
              v={num(data.errors)}
              tone={data.errors > 0 ? "text-destructive" : "text-muted-foreground"}
            />
          </div>

          {data.byDay.length > 0 && (
            <div className="mt-6">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Daily volume · cached share
              </h3>
              <div className="mt-2 flex items-end gap-1 overflow-x-auto border border-border p-3">
                {data.byDay.map((d) => {
                  const h = Math.max(4, Math.round((d.calls / maxDayCalls) * 72));
                  const hitH = Math.round((d.hits / Math.max(1, d.calls)) * h);
                  return (
                    <div key={d.day} className="flex w-4 shrink-0 flex-col items-center gap-1">
                      <div className="relative w-3 bg-muted" style={{ height: `${h}px` }}>
                        <div
                          className="absolute inset-x-0 bottom-0 bg-emerald-500/70"
                          style={{ height: `${hitH}px` }}
                          title={`${d.day} · ${d.calls} calls · ${d.hitRate}% cached`}
                        />
                      </div>
                      <span className="font-mono text-[8px] text-muted-foreground">{d.day.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto border border-border">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Hit %</th>
                    <th className="px-3 py-2 text-right">Spent</th>
                    <th className="px-3 py-2 text-right">Saved</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTask.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        No AI calls recorded in this window.
                      </td>
                    </tr>
                  ) : (
                    data.byTask.map((t) => (
                      <tr key={t.task} className="border-b border-border/60">
                        <td className="px-3 py-2 font-bold">{t.task}</td>
                        <td className="px-3 py-2 text-right">{num(t.calls)}</td>
                        <td className="px-3 py-2 text-right">{t.hitRate}%</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{credits(t.spentCredits)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                          {credits(t.savedCredits)}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {num(t.promptTokens + t.completionTokens)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border border-border">
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        No model spend yet.
                      </td>
                    </tr>
                  ) : (
                    data.byModel.map((m) => (
                      <tr key={m.model} className="border-b border-border/60">
                        <td className="px-3 py-2">{m.model}</td>
                        <td className="px-3 py-2 text-right">{num(m.calls)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{credits(m.spentCredits)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto border border-border">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2">Popular concept</th>
                  <th className="px-3 py-2 text-right">Generation runs</th>
                  <th className="px-3 py-2 text-right">Saved examples</th>
                </tr>
              </thead>
              <tbody>
                {data.topConcepts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      No code example demand in this window.
                    </td>
                  </tr>
                ) : (
                  data.topConcepts.map((c) => (
                    <tr key={c.concept} className="border-b border-border/60">
                      <td className="px-3 py-2 font-bold">{c.concept}</td>
                      <td className="px-3 py-2 text-right">{num(c.runs)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{num(c.saved)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-border bg-muted/20 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Credits are estimates for comparison, not billing · green bar segment = answers served from cache
            </div>
          </div>
        </>
      )}
    </div>
  );
}
