# ADR-003: provider API key 改用信封加密 vault，主密钥仍走 env（不引入 Vault/KMS）

**状态**：✅ Accepted
**日期**：2026-07-26

---

## 背景

Provider API key（第三方模型 provider 的密钥）此前只能通过
`model.config.apiKeyEnvVar` 引用一个环境变量解析（`resolve-api-key.ts`）——
新增一个 provider 或轮换一次密钥，都需要修改部署环境变量并重新部署服务。这
被明确判定为不可接受：provider 治理（增加/轮换三方 provider）应该是一个
常规、高频的运营动作（平台侧 operator 控制台驱动 Atlas 的
`model-platform/admin` API），被迫为每一次密钥变更走一次部署，违背了这个
定位。

`key` schema（`key.provider_api_keys`/`key.key_rotation_logs`，
`deploy/database/ddl/00_baseline.sql`）从一开始就是按信封加密设计的——
DDL 注释明确写着"密文 + 主密钥版本引用，从不存密钥本身"——但 Prisma 代理
补齐后从未被任何服务代码接入（见 `service/prisma/schema.prisma` 中 `key`
schema 块顶部的迁移备注）。

## 决策选项

### 选项 A：继续 env var 现状

**缺点**：这正是要解决的问题本身——每次增加/轮换 provider 密钥都要重新
部署，已被明确否决。

### 选项 B：信封加密落在 Atlas 自己的服务进程内，主密钥走 env

`service/src/provider-keys/` 实现 AES-256-GCM 信封加密——主密钥集合
（`PROVIDER_KEY_ENCRYPTION_KEYS`/`PROVIDER_KEY_ENCRYPTION_ACTIVE_KEY_ID`）
仍然是 env 配置，但这是极低频轮换的**主密钥**，不是每个 provider 各一个的
密钥；新增/轮换一个 provider 密钥，是通过
`model-platform/admin/provider-keys*`（`S2sAuthGuard` 保护，响应只回元数据、
明文只写不回显）对 `key.provider_api_keys` 表做一次 DB 写入，不需要重启
或重新部署。`AiModelRecord.config.managedKeyAlias`（`keyReference.source:
"managed"`，与既有的 `"env"` 并存）在请求时通过 `resolveApiKey` 的新依赖
`resolveManagedKey` 解析，chat/embed/rerank/parse 四条路径统一接入。

**优点**：直接解决"加一个 provider 要部署"的问题；复用了 DDL 从一开始就
设计好的信封加密结构，不是推翻重来；主密钥仍是极低频事件，符合密钥分层
（DEK 频繁轮换、KEK 极少轮换）的通行做法。
**缺点**：主密钥本身仍然是进程内 env 配置，不是外部 KMS/Vault 管理。

### 选项 C：主密钥立即接入外部 KMS/Vault

**缺点**：一次仓库范围排查（`vxture-platform` + `vxture-atlas`）确认，
组织内目前**不存在任何 Vault/KMS/SOPS 类基础设施**——文档化的密钥管理现状
（`vxture-platform/docs/10-standards/150-security.md` 1.3 节）是 GitHub
Actions Secrets（CI/部署期）+ 主机上 chmod-600 的明文 `.env` 文件（运行期），
Atlas 自己尚未实际执行的部署密钥（`DEPLOY_SSH_KEY`/ACR/tailscale）也是同一
套模式。为了这一个主密钥单独引入 Vault/KMS，会是组织里唯一一处、与其余所有
密钥管理方式不一致的基础设施，边际收益不足以支撑这个不一致。

## 决策

采用**选项 B**。信封加密的密文存储和主密钥管理解耦——密文结构
（`encrypted_key`/`encryption_key_id`）现在就对，主密钥来源以后可以换而不
需要改这层结构。选项 C（外部 KMS/Vault）评估后明确放弃，不是搁置：组织内
没有这类基础设施，专门为这一个主密钥新建一套是不一致的单点投入，收益不足。
主密钥保持 env 配置，视为一个稀疏的运维事件，与组织现有的密钥管理方式
保持一致。

## 后果

**正面：**

- 新增/轮换 provider 密钥是一次 DB 写入，不再需要重新部署——问题本身被
  解决。
- 信封加密结构（密文 + 主密钥版本引用）和主密钥来源解耦，以后如果组织真的
  上了共享密钥管理设施，只需要换掉主密钥加载函数，不需要动数据层。
- 管理端点响应只回元数据，明文写入后不可通过任何读接口回显，符合密钥类
  字段的通行处理方式。

**负面：**

- 主密钥仍然是进程内 env 配置，泄露该 env 等同于泄露解密所有 provider 密钥
  的能力——这个风险和组织现有的其他密钥（`DEPLOY_SSH_KEY` 等）处于同一
  信任级别，不是新增的薄弱点，但也没有比现状更强。
- 如果组织未来出于其他原因（不只是这一个场景）决定上共享密钥管理设施，
  需要重新评估主密钥来源，但这不需要现在预先设计。

---

_决策人：Atlas 团队（本次会话确认）| 实施于：`service/src/provider-keys/`、
`service/src/runtime/resolve-api-key.ts`、
`service/src/runtime/model-admin.service.ts` | 关联：TD-006
（`docs/60-operations/10-tech-debt.md`）_
