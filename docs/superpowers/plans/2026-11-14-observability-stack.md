# Plan: a complete observability stack (US-157)

1. `packaging/observability/`: dashboard JSON, alert JSON, `load.sh`.
2. `compose.yaml`: `openobserve` and `openobserve-setup` under the profile, the `OTEL_*` variables on `beelot`; `.env.example`.
3. `.github/scripts/test-observability.sh` and a step in the `package-build` job (amd64).
4. README section, backlog note.
5. Fix against the first CI run: the schemas and names were not run locally.
