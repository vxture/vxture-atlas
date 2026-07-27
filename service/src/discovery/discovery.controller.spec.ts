import { describe, it, expect } from "vitest";

import { DiscoveryController } from "./discovery.controller";

describe("DiscoveryController.list", () => {
  it("returns protocol_version and all four Atlas tool descriptors", () => {
    const controller = new DiscoveryController();
    const result = controller.list();

    expect(result.protocol_version).toBe("1.0");
    expect(result.tools.map((t) => t.name)).toEqual([
      "atlas.chat",
      "atlas.embed",
      "atlas.rerank",
      "atlas.parse",
    ]);
    for (const tool of result.tools) {
      expect(tool.version).toBe("1.0.0");
      expect(tool.deprecated).toBe(false);
      expect(tool.input_schema).toBeTruthy();
    }
  });
});
