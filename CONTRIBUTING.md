# Contributing

Thank you for helping Relaylings make collaborative automation understandable,
delightful, and safe for nontechnical people.

## Start safely

1. Create a focused branch and inspect `git status` before editing.
2. Run `npm ci` and `npm run check:release`.
3. Keep changes bounded; preserve unrelated work.
4. Add or update tests for observable behavior.
5. Explain user impact and verification in the pull request.

## Product and security rules

- Use plain language. First-run screens should not require knowledge of models,
  tokens, runtimes, or provider infrastructure.
- Pair animated status with readable text, keyboard access, visible focus, and
  reduced-motion behavior.
- Use original orb characters and layouts. Do not copy or name protected game
  characters, branding, assets, sounds, or trade dress.
- Keep deterministic practice mode as the default. Provider integrations are
  explicit local opt-ins and must fail visibly.
- Never commit credentials, private prompts, handoffs, user data, generated
  secrets, provider outputs, or local ledgers.
- Never read provider credentials from browser code or a `VITE_*` variable.
  Browser adapters call only the same-origin `/api` proxy.
- Keep job and receipt schemas closed, bounded, inspectable, and free of shell
  interpolation. Provider results never replace mission state directly.
- CLI prompts travel on stdin with `shell: false`, run in the ignored empty
  sandbox, retain disabled tools/persistence, and terminate the process group on
  timeout, disconnect, or bridge shutdown.
- Outside helpers require the per-launch bridge token. Never expose that token
  or a provider key in client JavaScript.
- OpenRouter work must reserve spend before a request, settle the ignored local
  ledger afterward, and stay within the operator-selected hard/session/per-call
  limits. Never raise a caller's limit implicitly.
- Preserve release gates for name/originality, accessibility, bundle size,
  secrets, licenses, notices, static CSP, tests, and dependency audit.

## Pull requests

Run `npm run check:release` before opening a pull request. Include what changed,
why, user impact, security or privacy impact, and exact checks. Keep commits
reviewable and do not mix unrelated cleanup with a behavior change.

## License of contributions

Unless you clearly state otherwise, contributions intentionally submitted for
inclusion are provided under the repository's Apache License 2.0, consistent
with section 5 of that license. Do not submit code, art, text, or assets you do
not have permission to license.
