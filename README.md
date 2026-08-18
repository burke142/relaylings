# Relaylings

**[Open the live practice-mode demo](https://burke142.github.io/relaylings/)** ·
[Deployment boundary and decision](DEPLOYMENT.md)

Local-first, delightful, dependency-light prototype where a nontechnical person can
make a few original orb helpers, give them a plain-language goal, and watch them
divide the work, chat, stall, recover, and cross the finish line — entirely inside
the browser by default. An optional local-only bridge can hand the same visible
tasks to OpenRouter, Codex, or Claude Code without putting credentials in the browser.

"Relaylings" is the selected open-source preview name after a preliminary
collision search; it is not legal trademark clearance. See `NAME_RESEARCH.md`
and `DEPLOYMENT.md`. This preview covers the runnable, delightful UX, secure
local provider orchestration, durable recovery, and static deployment.

## What's in this snapshot

- Three plain-language steps: **make helpers → set a goal → watch them work**.
- Original round orb characters with expressive eyes, cheeks, and a small
  role badge (Planner, Doer, Checker, Rescuer). No copied names, characters,
  maze layouts, mouths, or sounds.
- Winding SVG mission route with spark tokens per stop that clear as work gets
  done; a live progress gauge; speech bubbles above each active helper that show
  assignment, halfway progress, stalls, and rescues.
- A visible bench of waiting helpers; on a stall the Rescuer glows and steps in.
- A confetti celebration when the mission reaches the finish (suppressed under
  reduced motion).
- Deterministic decomposition of any goal into five visible tasks.
- Keyboard controls: <kbd>Space</kbd> play/pause, <kbd>S</kbd> single step,
  <kbd>R</kbd> start over. Speed toggle: slow / normal / fast. All controls
  reachable via <kbd>Tab</kbd>.
- Honors `prefers-reduced-motion`, plus a manual "Calm motion" toggle that
  disables bobbing, wobbling, confetti, dashed path flow, and bubble entrance.
- Pure, tested runtime logic (`src/runtime/`) separated from React UI (`src/ui/`).
- An optional real-helper panel stays folded during first use. It discovers only
  a loopback bridge and lists only helpers actually enabled there.
- Provider-neutral job packets, bounded timeouts, one visible rescue attempt, safe
  cancellation, idempotent requests, output caps, and readable result cards.
- Versioned local mission checkpoints plus portable JSON handoffs. Reloading
  offers a plain-language Continue choice; restored live-provider work stays
  paused until the user explicitly resumes it, and completed tasks are skipped.

## Requirements

- Node.js 20.19+ (or 22.12+/24+; current patched Vite requirement)
- npm 9+ (or pnpm / yarn — commands below use npm)

## Setup

```sh
cd "relaylings"
npm install
```

## Commands

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server (default: http://127.0.0.1:5173)           |
| `npm run dev:connected` | Start Vite + authenticated local bridge from ignored `.env`      |
| `npm run bridge`    | Start the local-only helper bridge using current shell environment    |
| `npm run bridge:env`| Start the bridge using a local ignored `.env` file                    |
| `npm run typecheck` | Run the TypeScript compiler in `--noEmit` mode                       |
| `npm test`          | Run client/runtime and local bridge tests                            |
| `npm run test:watch`| Vitest in watch mode                                                 |
| `npm run build`     | Typecheck + production build to `dist/`                              |
| `npm run build:pages` | Build the checked `/relaylings/` GitHub Pages artifact             |
| `npm run check:a11y` | Verify essential palette pairs meet 4.5:1 text contrast             |
| `npm run check:release` | Run all tests/build gates and a high-severity dependency audit   |
| `npm run preview`   | Preview the production build locally                                 |

## Try it end-to-end

1. `npm run dev`, open the printed URL.
2. Add or edit helpers (name, job, color, eyes). At minimum, keep one Doer and
   one Rescuer — the Rescuer is the one who takes over when a task stalls.
3. Click **Next**, type a goal like "plan a small birthday party", press
   <kbd>Enter</kbd>.
4. Watch the journey: five task stops from **Start** to **Destination**. One task
   will visibly stall around tick 7, and the Helper will take it over a few ticks
   later. Every message appears in the activity log with a timestamp.
5. Press <kbd>Space</kbd> to pause, <kbd>S</kbd> to step, <kbd>R</kbd> to reset.

## Checkpoints and handoffs

Once a mission starts, Relaylings saves a validated checkpoint in this
browser's local storage after every visible state change. Reload the page and
choose **Continue** to restore the team, goal, task progress, messages, selected
helper, and receipts. Practice mode can continue immediately. Any unfinished
Codex, Claude Code, or OpenRouter checkpoint stays paused behind an explicit
**Resume unfinished task** button; already completed tasks are not sent again.

Choose **Save handoff** to download a portable JSON file, or **Open handoff** on
the first screen to validate and preview one before continuing. Handoffs are
closed-schema, size-capped, versioned, and rejected if they contain
credential-like text. They can contain the goal, helper names, messages, and
provider outputs, so treat them as private working files. Provider credentials,
bridge tokens, environment variables, and local filesystem contents are never
part of the snapshot schema. **Start fresh** clears the local checkpoint.

## Optional real helpers

Practice mode needs no account, key, bridge, or network. To connect outside helpers:

1. Copy `.env.example` to `.env` locally. For OpenRouter, set both
   `OPENROUTER_API_KEY` and an explicit `OPENROUTER_MODEL`. For locally installed
   Codex/Claude CLIs, set `ENABLE_CLI_BRIDGE=1`. Never paste credentials into the UI.
2. Run `npm run dev:connected`. It creates a fresh bridge token in memory, starts
   the bridge and Vite together, and injects the token at the proxy—not the browser.
3. On **Set a goal**, open **Want real AI helpers?**, select **Find connected
   helpers**, and choose one. The UI plainly marks live mode before work starts.

The bridge binds to loopback, requires a per-launch random token, rejects unknown
packet fields and credential-like job text, rate-limits requests, deduplicates
concurrent jobs, caps time/output, and keeps provider keys out of child CLI
environments. Codex runs ephemeral with its documented shell, web, image, app,
skill-install, and multi-agent capabilities disabled; Claude runs non-persistent
in plan mode with tools, settings sources, slash commands, and MCP disabled. Both run from an ignored empty
sandbox directory and receive the bounded task on stdin, never inside a shell
command. CLI helpers fail closed on Windows until process-tree isolation is added.
See the [official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

OpenRouter reserves a configured maximum before each request, applies OpenRouter's
provider `max_price` filter, refuses work that would exceed the operator-selected
hard/session caps, and writes an ignored JSONL cost ledger under `.relaylings/`.
On restart it reloads that ledger; `RELAYLINGS_PRIOR_SPEND_USD` adds other spend
the operator needs counted. `RELAYLINGS_PROJECT_LEDGER_PATH` can also point to a
private Markdown ledger containing the documented observed and conservative
spend fields. The default and example hard/session cap is $5, the per-call
ceiling is $0.25, and the maximum configurable hard cap is $400.
See [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
and [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Layout

```
relaylings/
├── src/
│   ├── main.tsx              # React entry
│   ├── styles.css            # All UI styling (reduced-motion aware)
│   ├── runtime/              # Pure, tested; no React import
│   │   ├── types.ts
│   │   ├── rng.ts            # deterministic mulberry32 + fnv-1a
│   │   ├── planner.ts        # goal → tasks
│   │   ├── mission.ts        # mission constructor
│   │   ├── simulator.ts      # pure tick(mission) → mission
│   │   └── *.test.ts         # Vitest suites
│   ├── orchestration/        # typed jobs, adapters, deadlines, rescue coordinator
│   ├── recovery/             # validated local snapshots + portable handoffs
│   └── ui/                   # React components
│       ├── App.tsx
│       ├── AgentCreator.tsx
│       ├── GoalForm.tsx
│       ├── MissionBoard.tsx  # winding route, spark tokens, bench, celebration
│       ├── ActivityLog.tsx
│       ├── SpeechBubble.tsx  # floating message above active helpers
│       ├── Celebration.tsx   # confetti + finish banner
│       └── OrbAgent.tsx      # original SVG orb + role badge
├── server/                   # loopback-only Node bridge; secrets stay here
├── scripts/                  # client-bundle secret gate
├── .env.example              # placeholders and conservative caps only
├── LICENSE                   # Apache License 2.0
├── NAME_RESEARCH.md          # preliminary collision + originality record
├── RELEASE_CHECKLIST.md      # machine, browser, security, publication gates
├── THIRD_PARTY_NOTICES.md    # dependency license summary
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Determinism

`src/runtime/simulator.ts` exports a pure `tick(mission)` function; each call
returns a new `Mission` without mutating the input. Given identical starting
input, `runUntilComplete` produces byte-identical message logs and task states.
This is asserted in `simulator.test.ts`.

## Originality and safety

- All characters are simple round SVG orbs with configurable hue/eyes — no traced
  or copied designs.
- No maze layout. The journey is a winding but non-branching sequence of task stops.
- No sound effects.
- Practice mode makes no provider calls; the optional bridge is explicit and local-only.
- No analytics or tracking.
- Relaylings is licensed under Apache-2.0. Runtime dependency notices ship at
  `/third-party-licenses.txt` in every production build.

## What isn't in this slice

- Commercial trademark clearance or a final paid brand investment.
- Hosted outside-provider execution; the public static preview remains practice-first.
- Public accounts, telemetry, shared cloud missions, or a hosted provider proxy.

## Security and privacy

The public preview is a static practice-mode app. Connected Codex, Claude Code,
and OpenRouter helpers require the optional loopback bridge described above; do
not expose that bridge directly to a LAN or the internet. See `SECURITY.md` for
the supported boundary and private reporting route.

## License

Relaylings is open source under the [Apache License 2.0](LICENSE). See
`THIRD_PARTY_NOTICES.md` for dependency notices.

## Preview status

This is a testable public preview, not a tagged stable release. The full release
gate currently passes 55 tests, production build, secret/size/license/CSP checks,
contrast checks, and a zero-vulnerability dependency audit.
