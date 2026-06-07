import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const pluginOwnedFeatureDirs: string[] = ["input", "messages", "sessions", "status", "transcript", "workspace"];

describe("pi-app plugin host boundary", () => {
  it("does not restore plugin-owned built-in feature directories", () => {
    const root: string = join(process.cwd(), "src", "pi-app");

    for (const dir of pluginOwnedFeatureDirs) {
      expect(existsSync(join(root, dir)), `${dir} should remain plugin-owned`).toBe(false);
    }
  });
});
