# Release checklist

Every required item must be checked from a clean clone before a release. Record
the exact command output and deployed URL in the release or deployment notes.

## Machine gates

- [ ] `npm ci`
- [ ] `npm run check:release`
- [ ] Client tests and server tests have zero failures or skips.
- [ ] Production build includes `third-party-licenses.txt`.
- [ ] Production `index.html` includes the static Content Security Policy.
- [ ] Bundle secret scan and JavaScript/CSS size caps pass.
- [ ] `git status --short` contains no unexpected or private files.
- [ ] No `.env`, ignored ledger, CLI sandbox, credential, downloaded handoff,
      or source map is published unless intentionally required.

## Browser and accessibility gates

- [ ] New user completes make helpers → set goal → destination with keyboard only.
- [ ] Focus is visible; controls use native button/input/select semantics and
      have accessible names; Space on a focused control activates that control.
- [ ] Progress, activity, provider state, cancellation, failure, rescue, and
      recovery messages are exposed to assistive technology without relying on
      color alone.
- [ ] System reduced-motion and **Calm motion** both suppress nonessential motion.
- [ ] Desktop and 390px layouts do not hide mission stops or primary controls.
- [ ] Reload checkpoint, Continue, handoff download/import preview, and Start
      fresh work; restored outside-provider work stays paused.
- [ ] Practice mode works with the bridge offline and makes no outside request.

## Security, privacy, and provider gates

- [ ] Bridge binds only to loopback and requires a per-launch token whenever an
      outside provider is configured.
- [ ] Health is honest; requests are closed-schema, capped, redacted,
      rate-limited, idempotent, timeout-bounded, and disconnect-cancellable.
- [ ] Provider keys remain server-side and are absent from argv, child CLI
      environments, browser storage, portable handoffs, and built files.
- [ ] OpenRouter uses an explicit model, maximum-price filter, reservations,
      durable conservative accounting, $400 project ceiling, and a documented
      observed-spend update. No non-OpenRouter charge is authorized.
- [ ] Restored live work never auto-runs; retry copy warns about an unfinished
      outside task that might already have completed.

## Originality, license, and publication gates

- [ ] Product uses Relaylings or a newly cleared name, never Agent Arcade.
- [ ] `NAME_RESEARCH.md` is current and the visual originality boundary holds.
- [ ] Apache-2.0 `LICENSE` and deployed runtime third-party notices are present.
- [ ] README setup, security limits, recovery/privacy warning, and current
      verification results match the release.
- [ ] Public repository and deployment contain no private history or secrets.
- [ ] Pages workflow actions are commit-pinned and deployment permissions are
      limited to `contents: read`, `pages: write`, and `id-token: write`.
- [ ] Live URL works in a signed-out browser; source and deployment URLs are
      recorded in the release or deployment notes.
