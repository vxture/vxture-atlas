# 40-implementation - Package/layer guides, coding rules, dev setup

Empty as of this scaffold - `service/` has not landed yet (Phase 4 of the
repo-split plan, a history-preserving `git filter-repo` move from
vxture-platform, not a copy). Once it lands, this directory should carry:

- The NestJS module layout guide (`runtime/`, `registry/`, `router/`,
  `quota/`, `metering/`, `providers/`) - currently only documented in the
  platform repo (`docs/40-implementation/packages/services/40-model-platform.md`
  and `docs/40-implementation/packages/ai/10-model-runtime-client.md` for the
  consumer-side client that stays in vxture-platform).
- Dev setup (`pnpm install`, `pnpm --filter @vxture/service-model-platform dev`).
- The request contract (`ChatRequest` etc.) once it is this repo's to own.
