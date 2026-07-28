import { describe, it, expect } from "vitest";

import { DiscoveryController } from "./discovery.controller";
import { ATLAS_TOOL_DESCRIPTORS } from "./tool-descriptors";

describe("DiscoveryController.list", () => {
  it("publishes only the capabilities a provider actually serves", () => {
    const controller = new DiscoveryController();
    const result = controller.list();

    expect(result.protocol_version).toBe("1.0");
    // TD-019: atlas.parse is deliberately absent - the descriptor exists but
    // no provider implements parseDocument, so advertising it would promise a
    // capability that always 501s.
    expect(result.tools.map((t) => t.name)).toEqual([
      "atlas.chat",
      "atlas.embed",
      "atlas.rerank",
    ]);
    for (const tool of result.tools) {
      expect(tool.version).toBe("1.0.0");
      expect(tool.deprecated).toBe(false);
      expect(tool.input_schema).toBeTruthy();
      // product_210 §4.1a (TD-015): the field that lets discovery announce a
      // path change instead of a consumer finding out by 404.
      expect(tool.endpoint).toMatchObject({
        method: "POST",
        path: expect.stringMatching(/^\/v1\//),
      });
    }
  });

  it("keeps the unpublished parse descriptor in source, ready to restore", () => {
    // Guards against the withholding being "fixed" by deleting the contract:
    // when a parse provider lands, restoring it must be a one-line change.
    expect(ATLAS_TOOL_DESCRIPTORS.map((t) => t.name)).toContain("atlas.parse");
  });
});
