# atlas → platform：集成对接现状汇总与待办清单

> **状态：草稿，暂存本仓，尚未通过正式渠道发出**——本函目的是给 platform 线一份准确、完整的
> Atlas 当前状态快照，覆盖"已就绪可对接"和"仍需 platform 侧配合"两类事项，供规划对接工作使用。
> 是否要正式发出（如在 vxture-platform 仓库开 issue、或同步给对应负责人）需要人工确认——这是
> 一次跨仓库、对外可见的动作，本函先在 Atlas 侧准备好内容。
> **发件**：vxture-atlas（产品线）
> **收件**：vxture-platform（admin-bff / console-bff / auth-bff / 运维部署线）
> **主题**：Atlas repo-split 当前对接现状——已就绪的部分、仍然阻塞的部分、各自的负责方
> **关联**：`docs/60-operations/10-tech-debt.md`（TD-001/002/004/005/007）、
> `docs/70-workplan/00-index.md`、`docs/50-deployment/00-index.md`、
> `20-2607261200-atlas-provider-key-ui-handoff.md`（本函之前已发的独立信，provider-keys UI 缺口）

---

## 1. Atlas 侧已经就绪、platform 现在就可以开始对接的部分

### 1.1 S2S 鉴权（callee 侧已实现，等 platform 侧签发 token）

以下路由已经挂 `S2sAuthGuard`（RS256、JWKS、`iss`/`aud`/`exp` 校验，product_210 §3.3 八条规则）：

```
POST   /model-platform/chat                          (生成，ModelRuntimeController)
GET/POST/PUT/DELETE  /model-platform/admin/*          (providers/models/grants/price-rules/policies/quotas/usage-summaries)
GET/POST/PUT  /model-platform/admin/provider-keys*    (provider API key 管理，TD-006 新增)
POST   /v1/embed                                      (契约层已实现，真实 provider 调用留 501)
POST   /v1/rerank                                     (同上)
POST   /v1/parse                                      (同上)
```

这些路由现在**验证 token 会失败**（没有真正的 issuer 签发过合法 token）——不是 Atlas 这边的
问题，是 platform 侧 token-exchange 端点还没实现（见下文 2.2）。一旦该端点上线，Atlas 侧不需要
任何改动即可直接消费。

### 1.2 C3 provisioning webhook（和 arda 生产环境同一套契约）

`POST /provisioning/webhook` 已实现，HMAC-SHA256 验签（`t=<ts>,v1=<hex>`，双密钥轮换）、
幂等（`delivery_id`）、per-workspace 单调 `seq` 排序，`docs/30-design/identity/080-rp-integration.md`
§4/§5 的同一套线路契约。**platform 侧需要做的**：把 atlas 的 webhook 地址加入下发列表，
分配 `PROVISION_WEBHOOK_SECRET`（+ 轮换用的 `_NEXT`），后续所有 `tenant.provisioned`/
`tenant.deprovisioned` 事件即可正常送达——不需要 Atlas 再改代码。

### 1.3 model-platform admin API（BFF 可直接代理，UI 已有大半）

排查确认 `vxture-platform` 的 `portals/admin`/`portals/console` + `bff/admin-bff`/
`bff/console-bff` 已经有 providers/models/grants/price-rules/policies/quotas/usage-summaries
的完整 UI + BFF 路由，代理到 `MODEL_PLATFORM_URL`（即 Atlas）——这部分已经在正常对接，
无需额外工作。唯一缺口是新增的 provider-keys 管理面，已经单独发过一封信
（`20-2607261200-atlas-provider-key-ui-handoff.md`，对应 TD-007），此处不重复。

## 2. 仍然阻塞、需要 platform 侧配合的部分

### 2.1 C2/C3 真正接通（TD-002、TD-005）

**阻塞点**：`tenant/application/agent → workspace/product/metric` 的 scope-key 归约
（`data_model_200_schema.md` §2）依赖平台的 `product.agent_catalog`（application/agent →
product 映射），截至目前尚未落地。Atlas 侧已经用平台自己文档化的 fail-open doctrine
（`data_model_200_schema.md` §3）兜底，消除了崩溃风险，但 quota 强制和 usage 计量在此之前
都不是真的生效——任何依赖这两项的运营/计费判断，现在拿到的都不是真实数据。
**需要 platform 做的**：`product.agent_catalog` 落地是唯一的解锁条件，这不是 Atlas 能绕过或
提前做的事。

### 2.2 S2S token-exchange 签发端点 + BFF/varda 调用方改造（TD-004）

Atlas 侧（被调用方验签）已经完整实现，见 1.1。**需要 platform 做的**：
- 实现 token-exchange 端点，按 product_210 规范签发 RS256 S2S token；
- `bff/admin-bff`/`bff/console-bff`/`agent-server/varda` 的 `model-runtime-client` 从当前的
  裸 `fetch`（无 token）切换为携带这个 token 调用 Atlas。

### 2.3 部署链路（TD-001、Phase 6）

repo 侧配置已经清干净（`ALIYUN_ACR_NAMESPACE=vx-foundation`、`APP_PUBLISH_PORT=3100` 均已设置，
ACR 主备顺序已定），仍然卡住的纯 owner/平台动作：

- `vxture-platform` 自己的 `docs/50-deployment/13-infra-allocation-registry.md` atlas 行仍是
  "待分配"占位，需要同步 worker-02 的实际分配（worker-02、`/srv/md0/atlas`、端口 3100、
  tailnet class 2）——这个文件在 `vxture-platform` 仓库，不在 Atlas 写权限范围。
- Atlas 自己仓库这边：`production` GitHub Environment 尚未创建，`DEPLOY_HOST`/`DEPLOY_USER`/
  `DEPLOY_SSH_KEY`/`DEPLOY_KNOWN_HOSTS`/`DEPLOY_DIR`/`ENV_FILE_BASE64` 等部署密钥一个都没配置
  （2026-07-26 用 `gh api`/`gh secret list` 核实）。`DEPLOY_KNOWN_HOSTS` 尤其需要从可信网络对
  worker-02 实测 `ssh-keyscan` 采集，不是能凭空生成的。

### 2.4 provider-keys 管理 UI（TD-007）

已经单独发信，见 `20-2607261200-atlas-provider-key-ui-handoff.md`，此处仅作索引，不重复内容。

## 3. 优先级建议（供参考，非承诺）

- **2.2（token-exchange）** 是解锁 1.1 全部路由真实可用的唯一前提，建议优先级最高——现在
  Atlas 侧的鉴权、gating、provisioning webhook、provider-key 管理全部处于"实现完毕但没有真实
  token 能通过"的状态，一旦 2.2 落地，之前几批工作立刻可用，不需要 Atlas 再动一行代码。
- **2.1（product.agent_catalog）** 决定 TD-002/005 能不能关闭，这条 Atlas 完全无法绕过，
  只能等。
- **2.3（部署链路）** 中 platform 需要做的部分（infra-allocation-registry 同步）相对独立、
  工作量小，可以和其他项并行推进，不必等 2.1/2.2。
