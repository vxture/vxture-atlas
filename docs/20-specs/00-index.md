# 20-specs - Product/business specifications

| File | Covers |
|------|--------|
| [`10-http-surface.md`](./10-http-surface.md) | Authoritative map of every route Atlas serves - data plane, capability plane, tenancy plane, health, protocol-fixed |

Link other products' integration docs at `10-http-surface.md` rather than
copying the table, so it cannot go stale in two places.

Endpoint contracts for the supplier surface are designed in
`docs/30-design/200-s2s-provider-surface.md`; the generation contract
(`ChatRequest`) is defined in the platform repo.
