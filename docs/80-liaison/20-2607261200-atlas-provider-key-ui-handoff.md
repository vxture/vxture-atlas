# atlas → platform：provider-key vault 缺少 admin/console UI 与 BFF 覆盖，交接实现

> **状态：草稿，暂存本仓，尚未通过正式渠道发出**——记录于本仓 `docs/80-liaison/`，
> 按现有惯例作为交接说明留存；platform 线接手时可直接据此实现，不需要额外澄清需求。
> **发件**：vxture-atlas（产品线）
> **收件**：vxture-platform（admin-bff / console-bff / portals/admin / portals/console 维护方）
> **主题**：`model-platform/admin/provider-keys*`（provider API key 管理接口，TD-006 新增）
> 目前没有对应的 admin/console UI 或 BFF 路由，需要 platform 侧补上
> **关联**：`docs/60-operations/10-tech-debt.md` TD-007（本仓）、
> `docs/30-design/decisions/ADR-003-provider-key-vault-envelope-encryption.md`（本仓）

---

## 1. 背景

Atlas 这边刚完成了 provider API key 的信封加密金库（TD-006）：新增/轮换第三方
provider 的密钥，现在是一次 DB 写入，不再需要重新部署。API 已经是稳定、可用的：

```
GET    /model-platform/admin/provider-keys?providerCode=<code>
POST   /model-platform/admin/provider-keys
POST   /model-platform/admin/provider-keys/:providerKeyId/rotate
PUT    /model-platform/admin/provider-keys/:providerKeyId/activate
PUT    /model-platform/admin/provider-keys/:providerKeyId/deactivate
```

全部挂 `S2sAuthGuard`（和 providers/models/grants 等其余 admin 接口同一套鉴权），
响应只回元数据（`id`/`providerCode`/`keyAlias`/`keyScope`/`isActive`/`lastRotatedAt`/
`createdAt`/`updatedAt`），明文密钥只在 `POST`/`rotate` 的请求体里接受一次，**任何
读接口都不会回显**。

排查发现：providers/models/grants/price-rules/policies/quotas/usage-summaries
这些 model-platform 资源，在 `portals/admin/src/modules/ai/ModelPlatformPage.tsx`、
`ModelGrantsPage.tsx`、`portals/console/.../model-platform/`、`.../quotas/`
以及对应的 `bff/admin-bff`/`bff/console-bff` 的 `model-platform.router.ts` 里
都已经有完整的 UI + BFF 覆盖——唯独这次新加的 provider-keys 没有。运营人员现在
只能直接拿 S2S token 调接口（curl/Postman），没有界面。

## 2. 请求

按现有 providers 资源已经建立的形状，补齐 provider-keys 的管理面：

- **admin-bff** `model-platform.router.ts` 新增 provider-keys 的代理路由（list/
  create/rotate/activate/deactivate），照抄 providers 那组路由的写法即可，后端
  地址不变（同一个 `MODEL_PLATFORM_URL`）。
- **portals/admin** 在 `ModelPlatformPage.tsx` 加一个 "Provider Keys" 分区，或者
  单独开一个子页面——列表展示元数据字段，创建/轮换表单只接受一次性输入密钥明文
  （提交后不回显、不缓存在前端状态里），激活/停用走已有的开关模式。
- **console-bff / portals/console 是否需要**：这个是运营侧（admin）的操作，
  console 侧（面向客户/租户自服务）大概率不需要，除非 platform 判断有自服务
  BYOK 之类的场景——如果不需要就只做 admin 侧即可，不必对称照搬到 console。

## 3. 不在本次请求范围内

- provider-keys 本身的接口契约（字段形状、鉴权、错误码）不需要重新讨论，已经
  实现完毕，直接对接即可。
- 密钥值的传输/展示安全约束（写时接受一次、任何读接口不回显）是硬约束，不是
  UI 实现细节上的建议——前端状态管理需要相应地不持久化/不缓存明文字段。

## 4. 为什么这次没有 Atlas 这边直接实现

`vxture-atlas` 是 services-profile 仓库，没有 `portals/`（product_240 第 2.5 节
既定的治理划分，不是遗漏）——UI 和 BFF 代码都应该落在 `vxture-platform`，不在
本仓写权限范围内。
