import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectRoot = new URL("../../../", import.meta.url);
const readProjectFile = (relativePath: string) => readFileSync(new URL(relativePath, projectRoot), "utf8");

describe("finance workspace accessibility safeguards", () => {
  it("keeps the research-only notice available in the shared dashboard shell", () => {
    const layout = readProjectFile("client/src/components/DashboardLayout.tsx");
    expect(layout).toContain('aria-label="Research-only notice"');
    expect(layout).toContain("Nothing here is personalized investment, legal, or tax advice");
  });

  it("announces live-data loading and retrieval failures from the command center", () => {
    const commandCenter = readProjectFile("client/src/pages/Home.tsx");
    expect(commandCenter).toContain('role="status"');
    expect(commandCenter).toContain('aria-live="polite"');
    expect(commandCenter).toContain('role="alert"');
    expect(commandCenter).toContain("no replacement values have been shown");
  });

  it("keeps every finance surface inside the shared notice-bearing workspace and exposes deterministic empty or loading copy", () => {
    const app = readProjectFile("client/src/App.tsx");
    expect(app).toContain("DashboardLayout");

    const routes = [
      ["client/src/pages/Home.tsx", "Retrieving real market data"],
      ["client/src/pages/Portfolio.tsx", "No saved transactions."],
      ["client/src/pages/Research.tsx", "Retrieving live"],
      ["client/src/pages/AIAnalyst.tsx", "Ask an evidence-limited market research question"],
    ] as const;

    for (const [route, expectedState] of routes) {
      const source = readProjectFile(route);
      expect(source).toContain(expectedState);
    }
  });

  it("provides visible keyboard focus treatment for workspace navigation and account controls", () => {
    const layout = readProjectFile("client/src/components/DashboardLayout.tsx");
    expect(layout).toContain("focus-visible:ring-2");
    expect(layout).toContain('aria-label="Toggle navigation"');
    expect(layout).toContain("SidebarMenuButton");
  });

  it("discloses unavailable fund-profile fields instead of estimating expense ratio or sector allocation", () => {
    const research = readProjectFile("client/src/pages/Research.tsx");
    expect(research).toContain("Expense ratio");
    expect(research).toContain("Sector allocation");
    expect(research).toContain("Not supplied by selected live source");
    expect(research).toContain("Rolling returns");
    expect(research).toContain("Annualized return");
    expect(research).toContain("Sharpe");
    expect(research).toContain("Sortino");
    expect(research).toContain("Alpha");
    expect(research).toContain("Beta");
    expect(research).toContain("Max drawdown");
  });
});
