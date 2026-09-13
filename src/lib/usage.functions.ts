/**
 * Phase F2 — AI usage analytics.
 * Admin-gated reads over `ai_usage_events`: generation cost alongside strict
 * cache hit/miss records.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UsageTaskRow = {
  task: string;
  calls: number;
  hits: number;
  misses: number;
  hitRate: number;
  spentCredits: number;
  savedCredits: number;
  promptTokens: number;
  completionTokens: number;
  errors: number;
};

export type UsageDay = {
  day: string;
  calls: number;
  hits: number;
  hitRate: number;
  spentCredits: number;
  savedCredits: number;
};

export type ConceptRow = { concept: string; runs: number; saved: number };

export type UsageSummary = {
  windowDays: number;
  calls: number;
  hits: number;
  misses: number;
  hitRate: number;
  spentCredits: number;
  savedCredits: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  byTask: UsageTaskRow[];
  byModel: { model: string; calls: number; spentCredits: number }[];
  byDay: UsageDay[];
  topConcepts: ConceptRow[];
};

const input = z.object({ days: z.number().int().min(1).max(90).default(30) });

const round = (n: number) => Math.round(n * 10000) / 10000;

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<UsageSummary> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await supabase
      .from("ai_usage_events")
      .select(
        "task, model, cached, ok, prompt_tokens, completion_tokens, estimated_credits, saved_credits, created_at",
      )
      .gte("created_at", since)
      .limit(5000);
    if (error) throw error;

    const tasks = new Map<string, UsageTaskRow>();
    const models = new Map<string, { model: string; calls: number; spentCredits: number }>();
    const days = new Map<string, UsageDay>();
    let calls = 0;
    let hits = 0;
    let spent = 0;
    let saved = 0;
    let errors = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    for (const r of rows ?? []) {
      const row =
        tasks.get(r.task) ??
        {
          task: r.task,
          calls: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          spentCredits: 0,
          savedCredits: 0,
          promptTokens: 0,
          completionTokens: 0,
          errors: 0,
        };
      const spentHere = Number(r.estimated_credits ?? 0);
      const savedHere = Number(r.saved_credits ?? 0);

      row.calls += 1;
      if (r.cached) row.hits += 1;
      else row.misses += 1;
      if (!r.ok) row.errors += 1;
      row.spentCredits += spentHere;
      row.savedCredits += savedHere;
      row.promptTokens += r.prompt_tokens ?? 0;
      row.completionTokens += r.completion_tokens ?? 0;
      tasks.set(r.task, row);

      const m = models.get(r.model) ?? { model: r.model, calls: 0, spentCredits: 0 };
      m.calls += 1;
      m.spentCredits += spentHere;
      models.set(r.model, m);

      const dayKey = String(r.created_at ?? "").slice(0, 10) || "unknown";
      const d =
        days.get(dayKey) ??
        { day: dayKey, calls: 0, hits: 0, hitRate: 0, spentCredits: 0, savedCredits: 0 };
      d.calls += 1;
      if (r.cached) d.hits += 1;
      d.spentCredits += spentHere;
      d.savedCredits += savedHere;
      days.set(dayKey, d);

      calls += 1;
      if (r.cached) hits += 1;
      if (!r.ok) errors += 1;
      spent += spentHere;
      saved += savedHere;
      promptTokens += r.prompt_tokens ?? 0;
      completionTokens += r.completion_tokens ?? 0;
    }

    // Popular concepts: demand for generated code examples in the same window.
    const concepts = new Map<string, ConceptRow>();
    const { data: jobs } = await supabase
      .from("code_gen_jobs")
      .select("concept_tag, concept_label, status, created_at")
      .gte("created_at", since)
      .limit(2000);
    for (const j of jobs ?? []) {
      const key = j.concept_label || j.concept_tag;
      const c = concepts.get(key) ?? { concept: key, runs: 0, saved: 0 };
      c.runs += 1;
      if (j.status === "saved" || j.status === "done" || j.status === "complete") c.saved += 1;
      concepts.set(key, c);
    }

    const byTask = [...tasks.values()]
      .map((t) => ({
        ...t,
        hitRate: t.calls ? Math.round((t.hits / t.calls) * 1000) / 10 : 0,
        spentCredits: round(t.spentCredits),
        savedCredits: round(t.savedCredits),
      }))
      .sort((a, b) => b.calls - a.calls);

    return {
      windowDays: data.days,
      calls,
      hits,
      misses: calls - hits,
      hitRate: calls ? Math.round((hits / calls) * 1000) / 10 : 0,
      spentCredits: round(spent),
      savedCredits: round(saved),
      errors,
      promptTokens,
      completionTokens,
      byTask,
      byModel: [...models.values()]
        .map((m) => ({ ...m, spentCredits: round(m.spentCredits) }))
        .sort((a, b) => b.spentCredits - a.spentCredits),
      byDay: [...days.values()]
        .map((d) => ({
          ...d,
          hitRate: d.calls ? Math.round((d.hits / d.calls) * 1000) / 10 : 0,
          spentCredits: round(d.spentCredits),
          savedCredits: round(d.savedCredits),
        }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      topConcepts: [...concepts.values()].sort((a, b) => b.runs - a.runs).slice(0, 12),
    };
  });
