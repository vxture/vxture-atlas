import { describe, it, expect } from "vitest";

import { ZhipuProvider } from "./zhipu.provider";

describe("ZhipuProvider", () => {
  it("identifies itself as zhipu", () => {
    expect(new ZhipuProvider().providerName).toBe("zhipu");
  });
});
