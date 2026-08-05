#!/usr/bin/env node
/**
 * seed-test-data.mjs - local test data for the Atlas registry.
 *
 * NOT a deployment artifact. The production data path is operator writes
 * through /capability/*; this script only fills a local database so the
 * operator console and the S2S surface have something real to work against.
 *
 * Idempotent by full replace: it deletes every registry row it owns and
 * re-inserts, so re-running converges instead of duplicating.
 *
 * One provider is real: doubao, whose key comes from .env.provider-keys and
 * whose two models answer real calls. Everything else is plausible fixture
 * data - correct in shape, not backed by a live account.
 *
 * Usage: node scripts/dev/seed-test-data.mjs
 */
import { readFileSync } from "node:fs";
import { createCipheriv, randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(file) {
  let raw;
  try {
    raw = readFileSync(path.join(root, file), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, i).trim();
    if (process.env[key] === undefined) process.env[key] = line.slice(i + 1).trim();
  }
}
loadEnvFile(".env");
loadEnvFile(".env.provider-keys");

const { PrismaClient } = await import(
  pathToFileURL(path.join(root, "service/src/generated/prisma/index.js")).href
);
const prisma = new PrismaClient();

/** Real tenants and workspaces from the local platform DB, so grants line up. */
const TENANT = {
  acme: "00000000-0000-4000-b000-000000002001",
  globex: "00000000-0000-4000-b000-000000002002",
  initech: "00000000-0000-4000-b000-000000002003",
  personal: "00000000-0000-4000-a000-000000000200",
  personal2: "00000000-0000-4000-b000-000000002004",
};
const WORKSPACE = {
  acme: "00000000-0000-4000-b000-000000003001",
  globex: "00000000-0000-4000-b000-000000003002",
  initech: "00000000-0000-4000-b000-000000003003",
  personal: "00000000-0000-4000-a000-000000000210",
  personal2: "00000000-0000-4000-b000-000000003004",
};
/** A stable fake agent id, so agent-scoped grants are exercised. */
const AGENT = "00000000-0000-4000-c000-00000000a001";
const OPERATOR = "00000000-0000-4000-a000-0000000000ff";

// --------------------------------------------------------------------------
// Providers - who, commercially. The wire quirks live in config.wire so that
// onboarding a new OpenAI-dialect vendor stays a data operation (design 100).
// --------------------------------------------------------------------------
const PROVIDERS = [
  {
    providerCode: "doubao",
    providerName: "火山引擎豆包",
    providerType: "online",
    description: "ByteDance Volcano Ark - the one provider wired to a real account here",
    homepageUrl: "https://www.volcengine.com/product/doubao",
    consoleUrl: "https://console.volcengine.com/ark",
    isActive: true,
    config: {
      egressRoute: "direct",
      wire: {
        schemaVersion: 1,
        chatPath: "/chat/completions",
        auth: { style: "bearer" },
        streamUsage: "stream_options",
        supports: { tools: true, toolChoice: true, topP: true },
      },
    },
  },
  {
    providerCode: "zhipu",
    providerName: "智谱 BigModel",
    providerType: "online",
    description: "OpenAI-compatible chat plus native embedding and rerank",
    homepageUrl: "https://bigmodel.cn",
    isActive: true,
    config: {
      egressRoute: "direct",
      wire: {
        schemaVersion: 1,
        chatPath: "/chat/completions",
        auth: { style: "bearer" },
        streamUsage: "stream_options",
        supports: { tools: true, toolChoice: true, topP: true },
      },
    },
  },
  {
    providerCode: "deepseek",
    providerName: "深度求索 DeepSeek",
    providerType: "online",
    description: "Onboarded by data alone - no adapter code, just protocol + wire",
    homepageUrl: "https://platform.deepseek.com",
    isActive: true,
    config: {
      egressRoute: "direct",
      wire: {
        schemaVersion: 1,
        chatPath: "/chat/completions",
        auth: { style: "bearer" },
        streamUsage: "stream_options",
        supports: { tools: true, toolChoice: false, topP: true },
        paramMap: { maxTokens: "max_tokens" },
      },
    },
  },
  {
    providerCode: "anthropic",
    providerName: "Anthropic",
    providerType: "online",
    description: "Different wire format - anthropic-messages, its own adapter",
    homepageUrl: "https://www.anthropic.com",
    isActive: false,
    config: {
      egressRoute: "proxy",
      wire: {
        schemaVersion: 1,
        auth: { style: "x-api-key" },
        headers: { "anthropic-version": "2023-06-01" },
        streamUsage: "native",
        supports: { tools: true, toolChoice: true, topP: true },
      },
    },
  },
  {
    providerCode: "private",
    providerName: "内网 vLLM",
    providerType: "private",
    description: "Self-hosted vLLM on the tailnet - no API key, endpoint-local auth",
    isActive: true,
    config: {
      egressRoute: "internal",
      wire: {
        schemaVersion: 1,
        chatPath: "/v1/chat/completions",
        auth: { style: "none" },
        streamUsage: "none",
        supports: { tools: false, toolChoice: false, topP: true },
      },
    },
  },
];

// --------------------------------------------------------------------------
// Models - dispatch is by `protocol`, never by provider_code (design 100 §6).
// --------------------------------------------------------------------------
const ARK = "https://ark.cn-beijing.volces.com/api/v3";
const MODELS = [
  {
    providerCode: "doubao",
    modelCode: "doubao-seed-2-0-lite-260428",
    modelType: "chat",
    protocol: "openai-chat-completions",
    modelName: "豆包 Seed 2.0 Lite",
    description: "REAL - resolves its key from the managed vault (ADR-003)",
    endpointUrl: ARK,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    capabilities: ["chat", "tools", "streaming"],
    supportsStreaming: true,
    isActive: true,
    sort: 1,
    config: { managedKeyAlias: "primary" },
  },
  {
    providerCode: "doubao",
    modelCode: "doubao-seed-2-0-pro-260215",
    modelType: "chat",
    protocol: "openai-chat-completions",
    modelName: "豆包 Seed 2.0 Pro",
    description: "REAL - resolves its key from the legacy env-var path, so both paths are exercised",
    endpointUrl: ARK,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    capabilities: ["chat", "tools", "streaming"],
    supportsStreaming: true,
    isActive: true,
    sort: 2,
    config: { apiKeyEnvVar: "DOUBAO_API_KEY" },
  },
  {
    providerCode: "zhipu",
    modelCode: "glm-5.2",
    modelType: "chat",
    protocol: "openai-chat-completions",
    modelName: "GLM-5.2",
    description: "Fixture - shape is real, the account behind it is not",
    endpointUrl: "https://open.bigmodel.cn/api/paas/v4",
    contextWindow: 131072,
    maxOutputTokens: 16384,
    capabilities: ["chat", "tools", "streaming"],
    supportsStreaming: true,
    isActive: true,
    sort: 10,
    config: { managedKeyAlias: "primary" },
  },
  {
    providerCode: "zhipu",
    modelCode: "embedding-3",
    modelType: "embedding",
    protocol: "openai-chat-completions",
    modelName: "智谱 Embedding-3",
    description: "A1 - dimension is immutable for this model_code; a new dimension is a new code",
    endpointUrl: "https://open.bigmodel.cn/api/paas/v4",
    capabilities: ["embedding"],
    supportsStreaming: false,
    isActive: true,
    sort: 20,
    config: { managedKeyAlias: "primary", dimension: 2048 },
  },
  {
    providerCode: "zhipu",
    modelCode: "rerank-v1",
    modelType: "rerank",
    protocol: "openai-chat-completions",
    modelName: "智谱 Rerank",
    description: "A3 - served through the special-case layer, rerank is not an OpenAI-protocol call",
    endpointUrl: "https://open.bigmodel.cn/api/paas/v4",
    capabilities: ["rerank"],
    supportsStreaming: false,
    isActive: true,
    sort: 21,
    config: { managedKeyAlias: "primary", upstreamModel: "rerank" },
  },
  {
    providerCode: "deepseek",
    modelCode: "deepseek-chat-v3",
    modelType: "chat",
    protocol: "openai-chat-completions",
    modelName: "DeepSeek Chat V3",
    description: "Zero-code onboarding: model_code is a dispatch key, upstreamModel is the wire value (TD-012)",
    endpointUrl: "https://api.deepseek.com/v1",
    contextWindow: 65536,
    maxOutputTokens: 8192,
    capabilities: ["chat", "streaming"],
    supportsStreaming: true,
    isActive: true,
    sort: 30,
    config: { managedKeyAlias: "primary", upstreamModel: "deepseek-chat" },
  },
  {
    providerCode: "anthropic",
    modelCode: "claude-sonnet-4",
    modelType: "chat",
    protocol: "anthropic-messages",
    modelName: "Claude Sonnet 4",
    description: "Different wire format - dispatches to the Claude adapter, not the generic one",
    endpointUrl: "https://api.anthropic.com/v1",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    capabilities: ["chat", "tools", "streaming"],
    supportsStreaming: true,
    isActive: false,
    sort: 40,
    config: { managedKeyAlias: "primary" },
  },
  {
    providerCode: "private",
    modelCode: "qwen3-8b-internal",
    modelType: "chat",
    protocol: "openai-chat-completions",
    modelName: "Qwen3 8B (内网)",
    description: "Endpoint-local auth - no API key required at all",
    endpointUrl: "http://100.76.219.48:8000",
    contextWindow: 32768,
    maxOutputTokens: 4096,
    capabilities: ["chat", "streaming"],
    supportsStreaming: true,
    isActive: true,
    sort: 50,
    config: {},
  },
  {
    providerCode: "private",
    modelCode: "layout-parse-v1",
    modelType: "parse",
    protocol: "openai-chat-completions",
    modelName: "版面解析 (内网)",
    description: "A2 - the registry entry TD-003 lacked; still 501 until a provider implements parseDocument",
    endpointUrl: "http://100.76.219.48:8001",
    capabilities: ["parse"],
    supportsStreaming: false,
    isActive: true,
    sort: 25,
    config: {},
  },
  {
    providerCode: "doubao",
    modelCode: "doubao-seed-2-0-lite-no-tools",
    modelType: "chat",
    protocol: "openai-chat-completions",
    modelName: "豆包 Lite (禁用 tools)",
    description: "Model-level config.wire deep-merged over the provider's - same account, narrower capability",
    endpointUrl: ARK,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    capabilities: ["chat", "streaming"],
    supportsStreaming: true,
    isActive: true,
    sort: 3,
    config: {
      managedKeyAlias: "primary",
      upstreamModel: "doubao-seed-2-0-lite-260428",
      wire: { supports: { tools: false, toolChoice: false } },
    },
  },
  {
    providerCode: "zhipu",
    modelCode: "glm-4-legacy",
    modelType: "chat",
    protocol: "openai",
    modelName: "GLM-4 (legacy protocol value)",
    description: "Deliberately carries the un-normalized protocol alias, so the fallback layer is observable",
    endpointUrl: "https://open.bigmodel.cn/api/paas/v4",
    contextWindow: 131072,
    capabilities: ["chat"],
    supportsStreaming: true,
    isActive: false,
    sort: 60,
    config: { managedKeyAlias: "primary" },
  },
];

// --------------------------------------------------------------------------
// Grants - who may call what. taskProfile lets a caller ask for a capability
// instead of naming a model (design 200 §5).
// --------------------------------------------------------------------------
const GRANTS = [
  { tenant: "acme", modelCode: "doubao-seed-2-0-lite-260428", taskProfile: "chat-default", priority: 10, reason: "默认对话模型" },
  { tenant: "acme", modelCode: "doubao-seed-2-0-pro-260215", taskProfile: "long-context", priority: 10, reason: "长上下文场景" },
  { tenant: "acme", modelCode: "doubao-seed-2-0-lite-260428", taskProfile: "summarization", priority: 20, reason: "摘要,便宜优先" },
  { tenant: "acme", modelCode: "embedding-3", taskProfile: "embedding", priority: 10, reason: "karda 知识库向量化" },
  { tenant: "acme", modelCode: "rerank-v1", taskProfile: "retrieval-rerank", priority: 10, reason: "检索重排" },
  { tenant: "acme", modelCode: "glm-5.2", taskProfile: "summarization", priority: 50, reason: "摘要备选,优先级更低" },
  { tenant: "globex", modelCode: "doubao-seed-2-0-lite-260428", taskProfile: "chat-default", priority: 10, reason: "默认对话模型" },
  { tenant: "globex", modelCode: "deepseek-chat-v3", taskProfile: null, priority: 100, reason: "仅授权,不参与画像路由" },
  { tenant: "globex", modelCode: "qwen3-8b-internal", taskProfile: "chat-internal", priority: 10, applicationType: "agent", reason: "内网 agent 专用" },
  { tenant: "initech", modelCode: "glm-5.2", taskProfile: "chat-default", priority: 10, reason: "默认对话模型" },
  { tenant: "initech", modelCode: "claude-sonnet-4", taskProfile: "long-context", priority: 10, isActive: false, reason: "模型未启用,授权先挂着" },
  { tenant: "personal", modelCode: "doubao-seed-2-0-lite-260428", taskProfile: "chat-default", priority: 10, reason: "个人租户试用" },
  { tenant: "personal", modelCode: "doubao-seed-2-0-pro-260215", taskProfile: null, priority: 100, expiresInDays: -3, reason: "已过期,用于验证过期不被选中" },
  { tenant: "acme", modelCode: "layout-parse-v1", taskProfile: "document-parse", priority: 10, reason: "karda 文档加工管线" },
  { tenant: "acme", modelCode: "doubao-seed-2-0-lite-no-tools", taskProfile: null, priority: 100, applicationId: AGENT, applicationType: "agent", reason: "指定 agent 专用,精确范围优先于租户通配" },
  { tenant: "acme", modelCode: "doubao-seed-2-0-lite-260428", taskProfile: "chat-default", priority: 5, applicationId: AGENT, applicationType: "agent", reason: "同一画像下 agent 精确匹配,优先于上面的租户级 chat-default" },
  { tenant: "globex", modelCode: "embedding-3", taskProfile: "embedding", priority: 10, reason: "第二个租户也做向量化" },
  { tenant: "personal2", modelCode: "glm-5.2", taskProfile: "chat-default", priority: 10, expiresInDays: 30, reason: "限期试用,30 天后过期" },
];

// --------------------------------------------------------------------------
// Prices - operations data. Atlas meters quantities; it does not bill.
// --------------------------------------------------------------------------
const PRICES = [
  { modelCode: "doubao-seed-2-0-lite-260428", input: "0.30", output: "3.00" },
  { modelCode: "doubao-seed-2-0-pro-260215", input: "2.00", output: "20.00" },
  { modelCode: "glm-5.2", input: "1.00", output: "6.00" },
  { modelCode: "embedding-3", input: "0.50", output: "0", request: "0" },
  { modelCode: "rerank-v1", input: "0", output: "0", request: "0.002", billingMode: "request" },
  { modelCode: "deepseek-chat-v3", input: "0.50", output: "8.00" },
  { modelCode: "claude-sonnet-4", input: "21.00", output: "105.00", currency: "USD" },
  { modelCode: "qwen3-8b-internal", input: "0", output: "0" },
  { modelCode: "layout-parse-v1", input: "0", output: "0", request: "0.05", billingMode: "request" },
  { modelCode: "doubao-seed-2-0-lite-no-tools", input: "0.30", output: "3.00" },
  // Price rules are versioned by append, not edited in place (98_column_locks
  // grants UPDATE only on the lifecycle columns). This is last quarter's rate
  // for the same model, expired rather than deleted.
  { modelCode: "doubao-seed-2-0-lite-260428", input: "0.50", output: "4.00", expiredDaysAgo: 30 },
];

// --------------------------------------------------------------------------
// Policies - the rate gate. RATE_LIMITED is specified but not yet enforced;
// this is the configuration it will read.
// --------------------------------------------------------------------------
const POLICIES = [
  { modelCode: "doubao-seed-2-0-lite-260428", tenant: null, name: "全局默认", rateLimitRpm: 600, rateLimitTpm: 800000n, maxConcurrent: 32, maxContextTokens: 262144 },
  { modelCode: "doubao-seed-2-0-lite-260428", tenant: "personal", name: "个人租户收紧", rateLimitRpm: 20, rateLimitTpm: 40000n, maxConcurrent: 2, priority: 10 },
  { modelCode: "doubao-seed-2-0-pro-260215", tenant: null, name: "全局默认", rateLimitRpm: 120, rateLimitTpm: 200000n, maxConcurrent: 8 },
  { modelCode: "glm-5.2", tenant: null, name: "全局默认", rateLimitRpm: 300, rateLimitTpm: 300000n, maxConcurrent: 16 },
  { modelCode: "embedding-3", tenant: null, name: "批量向量化", rateLimitRpm: 1200, rateLimitTpd: 50000000n, maxConcurrent: 64 },
];

// --------------------------------------------------------------------------
// Routing - provider endpoints, weighted routes, fallback chains.
// --------------------------------------------------------------------------
const PROVIDER_CONFIGS = [
  { providerCode: "doubao", endpointUrl: ARK, timeoutMs: 60000, retryPolicy: { maxRetries: 2, backoffMs: 500 } },
  { providerCode: "zhipu", endpointUrl: "https://open.bigmodel.cn/api/paas/v4", timeoutMs: 60000, retryPolicy: { maxRetries: 2, backoffMs: 500 } },
  { providerCode: "deepseek", endpointUrl: "https://api.deepseek.com/v1", timeoutMs: 60000, retryPolicy: { maxRetries: 1, backoffMs: 800 } },
  { providerCode: "anthropic", endpointUrl: "https://api.anthropic.com/v1", timeoutMs: 120000, retryPolicy: { maxRetries: 1, backoffMs: 1000 }, isActive: false },
  { providerCode: "private", endpointUrl: "http://100.76.219.48:8000", timeoutMs: 30000, retryPolicy: { maxRetries: 0 } },
];

const MODEL_ROUTES = [
  { modelCode: "doubao-seed-2-0-lite-260428", providerCode: "doubao", weight: 100 },
  { modelCode: "doubao-seed-2-0-pro-260215", providerCode: "doubao", weight: 100 },
  { modelCode: "glm-5.2", providerCode: "zhipu", weight: 100 },
  { modelCode: "deepseek-chat-v3", providerCode: "deepseek", weight: 100 },
  { modelCode: "embedding-3", providerCode: "zhipu", weight: 100 },
  { modelCode: "rerank-v1", providerCode: "zhipu", weight: 100 },
  { modelCode: "qwen3-8b-internal", providerCode: "private", weight: 100 },
];

const FALLBACKS = [
  { modelCode: "doubao-seed-2-0-pro-260215", fallbackModelCodes: ["doubao-seed-2-0-lite-260428", "glm-5.2"], condition: "provider_error" },
  { modelCode: "glm-5.2", fallbackModelCodes: ["doubao-seed-2-0-lite-260428"], condition: "rate_limited" },
];

// --------------------------------------------------------------------------

/**
 * AES-256-GCM, laid out as `iv || authTag || ciphertext`.
 *
 * Note the layout: provider-key-crypto.ts's own header comment and
 * 00_baseline.sql's schema comment both describe `nonce || ciphertext || tag`,
 * but the code writes and reads the tag second. The code is internally
 * consistent, so nothing is broken - the comments are wrong, and anything
 * written from them (this script, at first) fails to decrypt.
 */
function envelopeEncrypt(plaintext, masterKeyB64) {
  const key = Buffer.from(masterKeyB64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function resolveMasterKey() {
  const raw = process.env["PROVIDER_KEY_ENCRYPTION_KEYS"];
  const activeId = process.env["PROVIDER_KEY_ENCRYPTION_ACTIVE_KEY_ID"];
  if (!raw || !activeId) {
    throw new Error(
      "PROVIDER_KEY_ENCRYPTION_KEYS / _ACTIVE_KEY_ID are not set - the managed vault cannot be seeded",
    );
  }
  const keys = JSON.parse(raw);
  if (!keys[activeId]) throw new Error(`active key id "${activeId}" is not in the key set`);
  return { activeId, key: keys[activeId] };
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 86400_000);
}

async function main() {
  // Full replace, and DELETE rather than TRUNCATE. This script connects as
  // atlas_svc, exactly like the application: SELECT/INSERT/DELETE plus a
  // column-level UPDATE whitelist, no TRUNCATE, and no UPDATE on identity
  // columns (98_column_locks.sql, enforced by Postgres). An upsert would try
  // to write provider_code / model_code and be refused - correctly. Deleting
  // and re-inserting is both permitted and idempotent.
  console.log("clearing registry tables");
  await prisma.modelGrant.deleteMany({});
  await prisma.modelPriceRule.deleteMany({});
  await prisma.modelPolicy.deleteMany({});
  await prisma.keyRotationLog.deleteMany({});
  await prisma.providerApiKey.deleteMany({});
  await prisma.fallbackRule.deleteMany({});
  await prisma.modelRoute.deleteMany({});
  await prisma.providerConfig.deleteMany({});
  await prisma.modelDefinition.deleteMany({});
  await prisma.modelProvider.deleteMany({});

  const providerIds = new Map();
  for (const p of PROVIDERS) {
    const row = await prisma.modelProvider.create({
      data: { ...p, createdBy: OPERATOR, updatedBy: OPERATOR },
    });
    providerIds.set(p.providerCode, row.id);
  }
  console.log(`providers: ${PROVIDERS.length}`);

  const modelIds = new Map();
  for (const m of MODELS) {
    const { providerCode, ...rest } = m;
    const data = { ...rest, providerId: providerIds.get(providerCode) };
    const row = await prisma.modelDefinition.create({
      data: { ...data, createdBy: OPERATOR, updatedBy: OPERATOR },
    });
    modelIds.set(m.modelCode, row.id);
  }
  console.log(`models: ${MODELS.length}`);

  for (const g of GRANTS) {
    await prisma.modelGrant.create({
      data: {
        modelId: modelIds.get(g.modelCode),
        tenantId: TENANT[g.tenant],
        applicationId: g.applicationId ?? null,
        applicationType: g.applicationType ?? null,
        taskProfile: g.taskProfile ?? null,
        priority: g.priority ?? 100,
        isActive: g.isActive ?? true,
        reason: g.reason ?? null,
        expiresAt: g.expiresInDays === undefined ? null : daysFromNow(g.expiresInDays),
        createdBy: OPERATOR,
        updatedBy: OPERATOR,
      },
    });
  }
  console.log(`grants: ${GRANTS.length}`);

  for (const p of PRICES) {
    await prisma.modelPriceRule.create({
      data: {
        modelId: modelIds.get(p.modelCode),
        billingMode: p.billingMode ?? "token",
        currency: p.currency ?? "CNY",
        unitTokens: 1000000,
        inputUnitPrice: p.input,
        outputUnitPrice: p.output,
        requestUnitPrice: p.request ?? "0",
        isActive: p.expiredDaysAgo === undefined,
        ...(p.expiredDaysAgo === undefined
          ? {}
          : { effectiveAt: daysFromNow(-90), expiresAt: daysFromNow(-p.expiredDaysAgo) }),
        createdBy: OPERATOR,
        updatedBy: OPERATOR,
      },
    });
  }
  console.log(`price rules: ${PRICES.length}`);

  for (const p of POLICIES) {
    const modelId = modelIds.get(p.modelCode);
    const tenantId = p.tenant ? TENANT[p.tenant] : null;
    const data = {
      modelId,
      tenantId,
      name: p.name,
      priority: p.priority ?? 100,
      maxConcurrent: p.maxConcurrent ?? null,
      rateLimitRpm: p.rateLimitRpm ?? null,
      rateLimitTpm: p.rateLimitTpm ?? null,
      rateLimitTpd: p.rateLimitTpd ?? null,
      maxContextTokens: p.maxContextTokens ?? null,
      isActive: true,
      updatedBy: OPERATOR,
    };
    await prisma.modelPolicy.create({ data: { ...data, createdBy: OPERATOR } });
  }
  console.log(`policies: ${POLICIES.length}`);

  for (const c of PROVIDER_CONFIGS) {
    await prisma.providerConfig.create({ data: { ...c, isActive: c.isActive ?? true } });
  }
  for (const r of MODEL_ROUTES) {
    await prisma.modelRoute.create({ data: r });
  }
  for (const f of FALLBACKS) {
    await prisma.fallbackRule.create({ data: f });
  }
  console.log(
    `routing: ${PROVIDER_CONFIGS.length} configs, ${MODEL_ROUTES.length} routes, ${FALLBACKS.length} fallbacks`,
  );

  // Managed provider keys. Only doubao's is real; the rest are placeholders
  // that encrypt and decrypt correctly but will not authenticate upstream.
  const { activeId, key } = resolveMasterKey();
  const realDoubao = process.env["DOUBAO_API_KEY"];
  if (!realDoubao) throw new Error("DOUBAO_API_KEY is not set - .env.provider-keys missing?");
  const VAULT = [
    { providerCode: "doubao", keyAlias: "primary", secret: realDoubao, scope: "shared" },
    // A retired key kept alongside the live one: same provider, different
    // alias, inactive. Deactivating rather than deleting is what the rotation
    // flow does, so the registry must be readable in that state.
    { providerCode: "doubao", keyAlias: "retired-2026q2", secret: "fixture-doubao-old-key", scope: "shared", isActive: false },
    // key_scope=dedicated: a key reserved for one tenant rather than shared
    // across the provider.
    { providerCode: "zhipu", keyAlias: "acme-dedicated", secret: "fixture-zhipu-dedicated", scope: "dedicated" },
    { providerCode: "zhipu", keyAlias: "primary", secret: "fixture-zhipu-key-not-real", scope: "shared" },
    { providerCode: "deepseek", keyAlias: "primary", secret: "fixture-deepseek-key-not-real", scope: "shared" },
    { providerCode: "anthropic", keyAlias: "primary", secret: "fixture-anthropic-key-not-real", scope: "shared" },
  ];
  for (const v of VAULT) {
    const encryptedKey = envelopeEncrypt(v.secret, key);
    const row = await prisma.providerApiKey.create({
      data: {
        providerCode: v.providerCode,
        keyAlias: v.keyAlias,
        encryptedKey,
        encryptionKeyId: activeId,
        keyScope: v.scope,
        isActive: v.isActive ?? true,
        lastRotatedAt: new Date(),
      },
    });
    // Append-only rotation audit (no UPDATE granted on this table at all).
    // The live doubao key gets a history, not a single row, so the log is
    // exercised as a series rather than a one-off.
    const history =
      v.keyAlias === "primary" && v.providerCode === "doubao"
        ? [
            { reason: "initial onboarding", at: daysFromNow(-120) },
            { reason: "quarterly rotation", at: daysFromNow(-30) },
            { reason: "seeded by scripts/dev/seed-test-data.mjs", at: new Date() },
          ]
        : [{ reason: "seeded by scripts/dev/seed-test-data.mjs", at: new Date() }];
    for (const h of history) {
      await prisma.keyRotationLog.create({
        data: {
          providerApiKeyId: row.id,
          rotatedBy: OPERATOR,
          reason: h.reason,
          rotatedAt: h.at,
        },
      });
    }
  }
  console.log(`provider keys: ${VAULT.length} (doubao real, rest fixtures)`);

  // C3 provisioning receiver state. The webhook is implemented and tested but
  // its two tables had no seeded rows at all, so nothing exercised a read of
  // them. Deliveries are the append-only idempotency ledger; the
  // provisionings row is the per-workspace status with a monotonic seq.
  await prisma.webhookDelivery.deleteMany({});
  await prisma.workspaceProvisioning.deleteMany({});
  const PROVISIONED = [
    { key: "acme", status: "provisioned", seq: 3n },
    { key: "globex", status: "provisioned", seq: 1n },
    // Only pending/provisioned/deprovisioned exist - the DDL CHECK
    // constraint rejects anything else, which is how it should be.
    { key: "initech", status: "pending", seq: 5n },
    { key: "personal2", status: "deprovisioned", seq: 2n },
  ];
  for (const w of PROVISIONED) {
    await prisma.workspaceProvisioning.create({
      data: {
        workspaceId: WORKSPACE[w.key],
        tenantId: TENANT[w.key],
        productCode: "atlas",
        status: w.status,
        seq: w.seq,
        provisionedAt: daysFromNow(-60),
        ...(w.status === "deprovisioned" ? { deprovisionedAt: daysFromNow(-5) } : {}),
      },
    });
    for (let i = 1n; i <= w.seq; i++) {
      await prisma.webhookDelivery.create({
        data: {
          deliveryId: `seed-${w.key}-${i}`,
          workspaceId: WORKSPACE[w.key],
          productCode: "atlas",
          eventType: i === 1n ? "workspace.provisioned" : "workspace.updated",
          seq: i,
          receivedAt: daysFromNow(-60 + Number(i)),
        },
      });
    }
  }
  console.log(
    `provisioning: ${PROVISIONED.length} workspaces, ${PROVISIONED.reduce((n, w) => n + Number(w.seq), 0)} webhook deliveries`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
