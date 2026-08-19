import { describe, expect, it } from "vitest";
import { ensureNewsAnalysis, ensureResearchBrief, PREDICTION_METHOD } from "./aiResearch";

const validBrief = {
  stance: "hold", probabilityOfGainPercent: 54, confidencePercent: 62, riskLevel: "moderate", summary: "Evidence is mixed.", bullCase: "Margins improve.", bearCase: "Demand weakens.", risks: ["Concentration"], evidence: ["Reported cash flow"], limitations: ["Headline-only news context"],
  forecasts: [
    { horizon: "1d", expectedReturnPercent: 0.2, probabilityOfGainPercent: 52 },
    { horizon: "7d", expectedReturnPercent: 0.6, probabilityOfGainPercent: 53 },
    { horizon: "30d", expectedReturnPercent: 1.5, probabilityOfGainPercent: 54 },
    { horizon: "90d", expectedReturnPercent: 3.5, probabilityOfGainPercent: 56 },
  ],
};

describe("LLM research response contracts", () => {
  it("accepts a research brief with all four declared forecast horizons", () => expect(ensureResearchBrief(validBrief).forecasts).toHaveLength(4));
  it("defines a server-authored prediction method for every response", () => expect(PREDICTION_METHOD).toContain("LLM scenario synthesis"));
  it("rejects a brief missing a supported forecast horizon", () => expect(() => ensureResearchBrief({ ...validBrief, forecasts: validBrief.forecasts.slice(0, 3) })).toThrow("every supported horizon"));
  it("allows only the three declared news sentiment labels", () => expect(ensureNewsAnalysis({ groups: [{ theme: "Results", summary: "Reported results", sentiment: "Neutral", marketImpact: "medium", articleIds: ["one"] }], limitations: ["Title-only"] }).groups).toHaveLength(1));
  it("rejects labels outside Positive, Negative, and Neutral", () => expect(() => ensureNewsAnalysis({ groups: [{ theme: "Results", summary: "Reported results", sentiment: "Mixed", marketImpact: "medium", articleIds: ["one"] }], limitations: [] })).toThrow("sentiment contract"));
});
