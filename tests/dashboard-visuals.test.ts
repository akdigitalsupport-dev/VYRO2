import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = readFileSync(path.join(root, "app/globals.css"), "utf8");
const statCard = readFileSync(path.join(root, "components/ui/stat-card.tsx"), "utf8");
const dashboard = readFileSync(path.join(root, "app/(gym)/gym/command-center/page.tsx"), "utf8");
const chart = readFileSync(path.join(root, "components/dashboard/interactive-trend-chart.tsx"), "utf8");

describe("dashboard visual performance and semantic color contracts", () => {
  it("reserves green for meaningful positive states, not the chart palette", () => {
    expect(styles).toContain("--positive: #63bd91;");
    expect(styles).toContain("--chart-coral: #ff4f61;");
    expect(dashboard).toContain('tone="positive" label="Active members"');
    expect(statCard).toContain('tone === "positive" ? "text-positive" : "text-foreground"');
    expect(chart).not.toContain("var(--positive)");
  });

  it("keeps the graph interactive and respects reduced-motion preferences", () => {
    expect(chart).toContain("onPointerMove={updateFromPointer}");
    expect(chart).toContain('event.key === "ArrowLeft"');
    expect(chart).toContain('event.key === "ArrowRight"');
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".interactive-trend-chart { animation: none; }");
  });
});
