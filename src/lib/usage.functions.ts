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
    let calls = 0;
    let hits = 0;
    let spent = 0;
    let saved = 0;
    let errors = 0;

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

      calls += 1;
      if (r.cached) hits += 1;
      if (!r.ok) errors += 1;
      spent += spentHere;
      saved += savedHere;
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
      byTask,
      byModel: [...models.values()]
        .map((m) => ({ ...m, spentCredits: round(m.spentCredits) }))
        .sort((a, b) => b.spentCredits - a.spentCredits),
    };
  });
