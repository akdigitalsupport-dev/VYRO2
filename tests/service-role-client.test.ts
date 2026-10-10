import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filePath);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [filePath] : [];
  });
}

describe("service-role client boundary", () => {
  it("H. no client component imports the service-role admin client", () => {
    const sourceRoots = ["app", "components", "lib"];
    const clientFiles = sourceRoots.flatMap(sourceFiles).filter((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return /^\s*["']use client["'];/m.test(source);
    });

    const unauthorizedImports = clientFiles.filter((filePath) =>
      /["'][^"']*supabase\/admin["']/.test(readFileSync(filePath, "utf8")),
    );

    expect(unauthorizedImports).toEqual([]);
  });
});
