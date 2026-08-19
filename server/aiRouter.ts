import { z } from "zod";
import * as db from "./db";
import { createNewsAnalysis, createResearchBrief } from "./aiResearch";
import { protectedProcedure, router } from "./_core/trpc";

const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9.^=-]{1,20}$/, "Use a valid market ticker.");

export const aiRouter = router({
  recommendation: protectedProcedure.input(z.object({ symbol: symbolSchema, question: z.string().trim().min(4).max(800) })).mutation(async ({ ctx, input }) => {
    const analysis = await createResearchBrief(input);
    await db.createAIAnalysisRecord({ userId: ctx.user.id, analysisType: "recommendation", symbol: analysis.symbol, requestContext: input.question, responseText: JSON.stringify(analysis), dataAsOf: new Date(analysis.asOf) });
    return analysis;
  }),
  news: protectedProcedure.input(z.object({ symbol: symbolSchema })).mutation(async ({ ctx, input }) => {
    const analysis = await createNewsAnalysis(input.symbol);
    await db.createAIAnalysisRecord({ userId: ctx.user.id, analysisType: "news", symbol: analysis.symbol, requestContext: "Analyze current provider-sourced headlines", responseText: JSON.stringify(analysis), dataAsOf: new Date(analysis.asOf) });
    return analysis;
  }),
  history: protectedProcedure.query(({ ctx }) => db.listRecentAIAnalysisRecords(ctx.user.id)),
});
