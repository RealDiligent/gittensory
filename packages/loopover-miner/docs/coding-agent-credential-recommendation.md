# Coding-agent credential recommendation — claude-cli and codex-cli

Design recommendation for **#6845**. Recommendation only — the wizard change implementing this lives in the
separate, dependent issue (#6846).

## Summary

**Recommendation: default `init --interactive` to prompting for a provider API key
(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) whenever the process has no TTY (fleet/server/CI context), and keep
the current subscription-backed device-flow OAuth (`claude setup-token` / `codex login --device-auth`) as the
first offer only in a real interactive/laptop session.** Both credential types already work today for both
providers — this is a *default/ordering* change, not a new capability.

## What each CLI actually supports (verified directly against both real CLIs, not assumed)

### `claude` (Claude Code CLI)

| Mechanism | How | Billing | Notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` env var | Set once, no interactive step | Pay-per-token via the Anthropic Console | Already recognized by `packages/loopover-miner/lib/status.js:379`'s credential check — `nonEmptyEnv(env.CLAUDE_CODE_OAUTH_TOKEN) \|\| nonEmptyEnv(env.ANTHROPIC_API_KEY)`. Never surfaced by the `init --interactive` wizard as an explicit option today. |
| `claude setup-token` | Interactive device-flow-style browser step (visit a URL, paste back a code) | Included in the human's Claude Code/Claude.ai subscription plan, if any | Produces a `CLAUDE_CODE_OAUTH_TOKEN` valid for ~1 year. This is what `init --interactive`'s "Authorize with GitHub"-style first option currently drives toward for the AMS-specific `LOOPOVER_MINER_AMS_OAUTH_CLIENT_ID` flow — a *different* OAuth (GitHub identity, not Claude billing identity); the two are easy to conflate but serve different purposes. |

### `codex` (Codex CLI)

| Mechanism | How | Billing | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` env var | Set once, no interactive step | Pay-per-token via the OpenAI platform | Confirmed via `codex doctor --json`: with only `OPENAI_API_KEY` set and no `codex login` ever run, `auth.credentials` reports `status: "ok"`, `"summary": "auth is provided by environment"`. Exact parity with Claude's `ANTHROPIC_API_KEY` path. |
| `codex login --with-api-key` | Reads the key from stdin once, persists it to `auth.json` | Same as above | A persisted-file variant of the same API-key mechanism, for operators who don't want a long-lived env var. |
| `codex login --with-access-token` | Reads a pre-obtained `CODEX_ACCESS_TOKEN` from stdin | Depends on how the token was issued | Least relevant to AMS's own setup flow; listed for completeness. |
| `codex login --device-auth` | Interactive device-flow browser step | Included in a ChatGPT Plus/Pro/Business subscription, if any | The Codex-side equivalent of `claude setup-token` — subscription-backed, requires a browser. |

## Recommendation and reasoning

**Unattended / fleet-mode / server deployments (Docker, systemd, CI): recommend the API-key path
(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) as the default.** An interactive device-flow step fundamentally
does not fit a headless context — it requires a human to be present with a browser at setup time, and (per
#6205's own live verification) the underlying interactive wizard command hangs indefinitely over a
non-interactive SSH/CI invocation with no TTY, rather than failing fast or falling back. An API key is a
single env var an operator sets once, identical in shape to how this same class of infrastructure already
authenticates ORB (`ANTHROPIC_API_KEY` as a Worker secret) — this is the parity #6844 is about.

**Interactive / laptop use: keep the subscription-backed OAuth as a real, useful option, not remove it.** A
contributor who already pays for a Claude Code or ChatGPT subscription plan gets AMS attempts "for free"
(included in plan usage) rather than metered separately via API credits — genuinely cheaper for that person,
and the existing device-flow UX (visit a URL, paste a code) works fine when a human is actually present at a
keyboard. Removing this option would regress laptop-mode's cost story for exactly the users it's cheapest for.

**Detection, not a forced choice.** The wizard should detect a no-TTY/non-interactive context
(`process.stdin.isTTY`/`process.stdout.isTTY`, the same signal Node's own ecosystem commonly uses for this)
and switch its *default offered option*, not remove either path entirely — an operator who explicitly wants
OAuth in a scripted context (e.g. they've pre-authorized once and are replaying a token) should still be able
to opt into it.

## Non-goals of this recommendation

- Does not propose changing `LOOPOVER_MINER_AMS_OAUTH_CLIENT_ID`'s own device-flow mechanism (the GitHub-identity
  OAuth used for the miner's own `GITHUB_TOKEN`, unrelated to the coding-agent's own credential) — that's a
  separate identity question, already covered elsewhere (see #6205's findings on the existing dashboard OAuth
  App being reused for it).
- Does not implement the wizard change itself — see #6846.
