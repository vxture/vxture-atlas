# ADR-001: quota/usage 读写在 C2/C3 未接通期间采用 fail-open，而非报错或拒绝

**状态**：✅ Accepted
**日期**：2026-07-24

---

## 背景

物理数据库拆分（repo-split Phase 2）移除了 `metering` schema 的三个代理模型
（`TenantSubscriptionQuota`/`TenantUsageEvent`/`TenantUsageSummary`）——这个
schema 属于平台 DB，Atlas 拆分后不再直连（零跨库 FK，boundary #1）。

但服务代码（`quota.service.ts`/`metering.service.ts`/
`model-registry.repository.ts`）仍然调用这三个已不存在的 Prisma delegate。
一次代码状态审计发现，一个后续提交为了让编译通过，给 `service/src/prisma.ts`
手写了一个 `ModelPlatformPrismaClient` 接口把这三个 delegate 声明进去，再用
`as unknown as ModelPlatformPrismaClient` 断言到真实生成的 client 上——编译
期符合，但生成的 client 根本没有这些属性，调用即在请求热路径上抛出
`Cannot read properties of undefined`。`quota.service.ts` 的 `assertAllowed`
在每一次 `/model-platform/chat` 请求上都会走到这条路径，是一个正在生产环境
运行的真实崩溃风险，只是没有测试覆盖到（`model-registry.repository.spec.ts`
直接 mock 了这个幽灵 delegate，从未真正触达真实 Prisma 访问）。

真正的修复——C2 entitlement 读 + C3 consume 写——依赖平台侧
`tenant/application/agent → workspace/product/metric` 的 scope-key 归约
（`data_model_200_schema.md` §2），而这依赖平台的 `product.agent_catalog`，
截至决策时尚未落地。这不是 Atlas 仓库能绕过的依赖。

## 决策选项

### 选项 A：保留幽灵 delegate + 类型断言现状

**缺点**：编译通过掩盖了运行时必崩的事实，是最不诚实的状态——留给下一个人
的信号是"这里能用"，实际上一用就炸。

### 选项 B：让编译失败，如实反映"未接通"

**缺点**：`TD-005` 原本记录的正是"预期会编译失败"，但这不是真实情况（已经
用断言绕过了）；即便让它重新编译失败，也只是把崩溃提前到构建期，服务本身
在这条路径接通之前完全不可用，而 quota/usage 缺失并不应该阻塞主链路。

### 选项 C：删除幽灵 delegate，按平台文档的 fail-open doctrine 改写

平台架构自己的文档（`data_model_200_schema.md` §3，"同步 + 有界本地
fail-open + 异步对账"）已经为这类场景定义了标准应对：暂时拿不到权威数据时，
有边界地放行，而不是报错或拒绝。将
`findCurrentSubscriptionQuota`/`listSubscriptionQuotas`/`findUsageSummary`/
`listUsageSummaries` 改为直接返回 `null`/`[]`，`QuotaService.assertAllowed`
在解析不到 quota 时记录警告并放行（跳过依赖 quota 配置本身的 model-allowlist
gating，因为那部分校验在没有真实 quota 数据时无法被有意义地执行），而不是
抛 `QUOTA_EXCEEDED`。

**优点**：消除生产环境崩溃风险；不伪造一个不存在的计量结果；行为符合平台
自己已经写好的架构原则，不是 Atlas 自创的例外。
**缺点**：quota/usage 在这段时间内实质上不生效——但这本来就是现状（幽灵
delegate 从未真正工作过），只是从"崩溃"变成"不生效但不崩溃"。

## 决策

采用**选项 C**。删除三个幽灵 delegate 及其 `QuotaPoolRow`/`UsageEventRow`/
`UsageSummaryRow` 类型（`service/src/prisma.ts`），`model-registry.repository.ts`
的四个读方法直接返回空结果，`quota.service.ts` 的 `assertAllowed` 对"查不到
quota"做有边界的 fail-open 而非拒绝。

这是一个**过渡态修复，不是 Phase 3 完成**——真正的 C2/C3 接线仍然阻塞在平台
的 `product.agent_catalog` 上，在此之前无法关闭 TD-002/TD-005。

## 后果

**正面：**

- 消除了一个正在生产环境运行的请求热路径崩溃风险。
- 代码行为如实反映"计量暂未接通"的真实状态，不再有一个看似能用、实际必炸
  的类型断言。
- 遵循平台自己文档化的架构原则，未来接通 C2/C3 时不需要推翻这个阶段的代码，
  只是把 fail-open 的分支换成真实调用。

**负面：**

- 在 C2/C3 真正接通之前，quota 强制和 usage 计量完全不生效——任何依赖这两项
  的运营/计费判断都拿不到真实数据。
- model-allowlist gating 在 fail-open 分支被跳过，这段时间内的模型访问控制
  比预期宽松。

---

_决策人：Atlas 团队（本次会话确认）| 实施于：`service/src/prisma.ts`、
`service/src/quota/quota.service.ts`、`service/src/registry/model-registry.repository.ts`
| 关联：TD-002、TD-005（`docs/60-operations/10-tech-debt.md`）_
