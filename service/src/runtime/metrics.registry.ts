/**
 * metrics.registry.ts - 模型平台 Prometheus 指标注册与采集
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category metrics
 * @author AI-Generated
 * @date 2026-06-07
 */
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

type LabelDict = Record<string, string>;
type MetricName =
  | "model_requests_total"
  | "model_request_errors_total"
  | "model_request_in_flight"
  | "model_request_latency_ms";

type MetricDefinition = {
  type: "counter" | "gauge" | "histogram";
  help: string;
  labelNames: string[];
  buckets?: number[];
};

const METRIC_DEFINITIONS: Record<MetricName, MetricDefinition> = {
  model_requests_total: {
    type: "counter",
    help: "model_requests_total 模型平台运行时请求总数（按操作、状态、provider 聚合）",
    labelNames: ["operation", "status", "provider"],
  },
  model_request_errors_total: {
    type: "counter",
    help: "model_request_errors_total 模型平台运行时错误总数（按错误码、provider 聚合）",
    labelNames: ["code", "provider"],
  },
  model_request_in_flight: {
    type: "gauge",
    help: "model_request_in_flight 当前进行中的模型平台运行时请求数",
    labelNames: ["operation"],
  },
  model_request_latency_ms: {
    type: "histogram",
    help: "model_request_latency_ms 模型平台运行时延迟分布（毫秒）",
    labelNames: ["operation", "provider"],
    buckets: [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000],
  },
};

export class MetricsRegistry {
  // #region field
  private readonly registry = new Registry();
  private readonly counters = new Map<string, Counter<string>>();
  private readonly gauges = new Map<string, Gauge<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();
  private initialized = false;
  // #endregion

  constructor() {
    this.bootstrap();
  }

  incCounter(name: MetricName, labels: LabelDict = {}, value = 1): void {
    const counter = this.getCounter(name);
    counter.inc(this.getLabelsAsObject(name, labels), value);
  }

  changeGauge(name: MetricName, delta: number, labels: LabelDict = {}): void {
    const gauge = this.getGauge(name);
    gauge.inc(this.getLabelsAsObject(name, labels), delta);
  }

  observeHistogram(
    name: MetricName,
    value: number,
    labels: LabelDict = {},
  ): void {
    const histogram = this.getHistogram(name);
    histogram.observe(this.getLabelsAsObject(name, labels), value);
  }

  async scrape(): Promise<string> {
    return `${(await this.registry.metrics()).trimEnd()}\n`;
  }

  private bootstrap(): void {
    if (this.initialized) {
      return;
    }

    collectDefaultMetrics({
      register: this.registry,
      labels: { component: "model-platform" },
    });

    for (const name of Object.keys(METRIC_DEFINITIONS) as MetricName[]) {
      const definition = METRIC_DEFINITIONS[name];
      switch (definition.type) {
        case "counter": {
          const metric = new Counter({
            name,
            help: definition.help,
            labelNames: definition.labelNames,
            registers: [this.registry],
          });
          this.counters.set(name, metric as Counter<string>);
          break;
        }
        case "gauge": {
          const metric = new Gauge({
            name,
            help: definition.help,
            labelNames: definition.labelNames,
            registers: [this.registry],
          });
          this.gauges.set(name, metric as Gauge<string>);
          break;
        }
        case "histogram": {
          if (!definition.buckets) {
            throw new Error(`Metric ${name} missing required buckets`);
          }
          const metric = new Histogram({
            name,
            help: definition.help,
            buckets: definition.buckets,
            labelNames: definition.labelNames,
            registers: [this.registry],
          });
          this.histograms.set(name, metric as Histogram<string>);
          break;
        }
      }
    }

    this.initialized = true;
  }

  private getCounter(name: MetricName): Counter<string> {
    const metric = this.counters.get(name);
    if (!metric) {
      throw new Error(`Unsupported metric: ${name}`);
    }
    return metric;
  }

  private getGauge(name: MetricName): Gauge<string> {
    const metric = this.gauges.get(name);
    if (!metric) {
      throw new Error(`Unsupported metric: ${name}`);
    }
    return metric;
  }

  private getHistogram(name: MetricName): Histogram<string> {
    const metric = this.histograms.get(name);
    if (!metric) {
      throw new Error(`Unsupported metric: ${name}`);
    }
    return metric;
  }

  private getLabelsAsObject(name: MetricName, labels: LabelDict): LabelDict {
    const definition = METRIC_DEFINITIONS[name];
    const result: LabelDict = {};

    for (const key of definition.labelNames) {
      result[key] = this.normalizeLabelValue(labels[key] ?? "");
    }

    return result;
  }

  private normalizeLabelValue(value: string): string {
    return value.trim() || "unknown";
  }
}

export const metricsRegistry = new MetricsRegistry();
