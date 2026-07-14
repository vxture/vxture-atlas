/**
 * metrics.registry.spec.ts - 模型平台轻量指标注册表测试
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category test
 * @author AI-Generated
 * @date 2026-06-07
 */

import { describe, expect, it } from "vitest";

import { MetricsRegistry } from "./metrics.registry";

describe("MetricsRegistry", () => {
  it("scrapes counters with labels", async () => {
    const registry = new MetricsRegistry();

    registry.incCounter("model_requests_total", {
      status: "success",
      operation: "chat",
    });
    registry.incCounter(
      "model_requests_total",
      { status: "success", operation: "chat" },
      2,
    );

    await expect(registry.scrape()).resolves.toContain(
      'model_requests_total{operation="chat",status="success",provider="unknown"} 3',
    );
  });

  it("scrapes histogram sum and count", async () => {
    const registry = new MetricsRegistry();

    registry.observeHistogram("model_request_latency_ms", 10, {
      operation: "chat",
    });
    registry.observeHistogram("model_request_latency_ms", 15, {
      operation: "chat",
    });

    const output = await registry.scrape();
    expect(output).toContain(
      'model_request_latency_ms_sum{operation="chat",provider="unknown"} 25',
    );
    expect(output).toContain(
      'model_request_latency_ms_count{operation="chat",provider="unknown"} 2',
    );
  });

  it("escapes label values", async () => {
    const registry = new MetricsRegistry();

    registry.incCounter("model_request_errors_total", {
      code: 'PROVIDER_"DOWN"',
    });

    await expect(registry.scrape()).resolves.toContain(
      'model_request_errors_total{code="PROVIDER_\\\"DOWN\\\"",provider="unknown"} 1',
    );
  });
});
