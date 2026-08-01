# ADR-004: 不引入 Portkey Gateway 作为 provider 适配层，自建路径不变

**状态**：✅ Accepted
**日期**：2026-08-01

---

## 背景

Atlas 作为 model gateway 的六项核心能力中，实测只有 1.5 项落地
（2026-08-01 核对 `service/src`）：

| 能力 | 现状 | 证据 |
|---|---|---|
| 多厂商兼容 | 部分 | 4 个适配器 doubao/claude/zhipu/private |
| 流式 | 2/4 破损 | 仅 `doubao.provider.ts:37`、`zhipu.provider.ts:56` 实现 `chatStream`；claude 与 private 落到 `base.provider.ts:69` 抛 not-implemented |
| 统一 API | 有，自有形状 | `types/runtime.types.ts` `ChatRequest` |
| OpenAI 标准兼容 | 无 | 与 OpenAI 结构不同（`modelCode` vs `model`、`message` vs `choices[]`、自定义 SSE `StreamEvent`） |
| 负载均衡 | 无 | `model-router.service.ts` 全文 53 行，静态 Map，未命中即 503 |
| 限流 | 无 | `quota.service.ts` 是月度额度（`cycleMonth`），无 RPM/TPM/并发 |
| token 用量统计 | 一半 | `metering.service.ts` 38 行，无成本计算、未写平台计量内核（TD-017） |

缺失项全部无 vxture 治理语义，属于通用网关商品能力，因此评估以开源实现
（Portkey Gateway，TypeScript/MIT）替换 `providers/` + `router/`，保留
NestJS 外壳、Prisma、guards、registry/tenancy 不动。

## 决策选项

### 选项 A：`@portkey-ai/gateway` 作为 npm 依赖进程内嵌入

原定首选方案。**实测不可行**（2026-08-01，v1.15.2）：

- 该包不声明 `main`/`module`/`types`/`exports` 任何入口字段；
  `require.resolve('@portkey-ai/gateway')` 直接 `MODULE_NOT_FOUND`。
- `files` 只发布 `build/start-server.js`（483KB ESM，带 shebang）与
  `build/public`（Console 静态资源）。该 bundle 的 `export` 语句数为 **0**，
  尾部是启动 HTTP server 并打印 banner 的副作用代码。
- 无 `.d.ts`。

即它是一个**以 npm 分发的独立服务端可执行文件，不是库**。进程内嵌入路径
不存在，此方案作废。

### 选项 B：作为 sidecar 进程/容器运行

技术可行，且比 LiteLLM（Python）/Bifrost（Go）便宜——同为 Node 运行时，
可与 atlas-app 共用镜像，无第二套基础镜像与语言运行时。

**缺点**：仍是第二个进程 + 一跳 localhost HTTP；services profile
（product_240 §2.5）是单服务形态，deploy/rollback/健康检查全部要改；
且**不解决主要 provider**——见下。

### 选项 C：从源码 vendor 适配器（MIT 允许）

其 `src/providers/` 共 75 个 provider，含 deepseek、ollama、dashscope
（通义）、zhipu、moonshot、siliconflow、lingyi、anthropic、openai，
**但不含 doubao / volcengine / ark**——Atlas 当前的首要 provider 在其覆盖
之外，无论选 B 还是 C 都仍需自己维护。

且单个适配器体积很小（zhipu 4 文件约 5.6KB、deepseek 约 6.2KB、ollama 约
6.8KB，均约 150-250 行），与 Atlas 现有手写适配器（`providers/` 1484 行 /
4 家，含测试）处于同一量级。适配器本身不是成本大头，vendor 的净收益因此
远低于评估初期的假设；而它们均写在 Portkey 内部类型与 config-handler 之上，
不是复制粘贴而是移植。

### 选项 D：不引入依赖，只借鉴结构，自建缺失能力

## 决策

**选 D。** 依据是三条实测事实，而非偏好：

1. 进程内嵌入（选项 A，唯一与 services profile 无冲突的形态）不存在。
2. 首要 provider（doubao/volcengine）不在其 75 家覆盖内，任何采纳形态都
   留下手写适配器的长期维护。
3. 适配器不是成本大头（约 200 行/家），真正缺的是负载均衡、限流、
   OpenAI 兼容层、成本计量——这四项要么带 vxture 语义（限流按
   tenant×model 落 `policy`、计量接 `price_rule` 与平台计量内核），要么
   本就不在其开源范围（观测存储层留在其托管版）。

附带记录：试装 v1.15.2 会向 `pnpm-lock.yaml` 引入 74 个包，且其
`postinstall` 执行 `patch-package`（pnpm 默认已拦截）。对一个把依赖安全
硬门（osv 全阻断）写进治理基线的仓库，这是独立于功能之外的减分项。

自建时借鉴其结构（不引依赖）：

- 每 provider 目录拆 `api.ts` / `chatComplete.ts` / `stream` / 错误映射，
  取代当前单文件适配器——补齐 claude/private 的 `chatStream` 缺口。
- 路由策略以 JSON 配置表达（fallback / loadbalance / conditional），落在
  已有 `policy` 表，不新造配置源。

## 后果

- `providers/` 与 `router/` 的工作量按自建计入 workplan，不存在"引入依赖
  即完成"的捷径。
- OpenAI 兼容层必须自建。形态为**双入口单管线**：`/v1/chat` 保持 vxture
  内部 S2S 契约不变（karda/arda/varda 依赖，`tenantId`/`applicationType`/
  `featureId` 等计量授权维度在 OpenAI 协议中无对应位置），新增
  `/v1/chat/completions` 等 OpenAI 形状入口，二者共用鉴权 → 授权 → 限流 →
  路由 → provider → 计量同一条管线。
- 新入口的租户识别只能来自 token/虚拟 key 派生，不能来自 body——顺带修正
  `/v1/chat` 从 body 取 `tenantId` 与 `/tenancy/*`「scope 只来自 token」
  规范之间的现存不一致。
- 本 ADR 不排除将来重估：若该项目发布真正的库形态入口，或补齐
  volcengine/doubao 适配器，选项 A 可重新评估。
