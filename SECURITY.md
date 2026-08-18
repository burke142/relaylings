# Security policy

## Supported boundary

The current public preview is the latest commit on the default branch. Practice
mode is static and local-first. The optional provider bridge is supported only
when bound to loopback (`127.0.0.1` or `::1`) and reached through the paired
local Vite proxy with a fresh per-launch token. Direct LAN or internet exposure
of the bridge is unsupported.

Never place provider credentials in browser fields, handoff files, source,
issues, logs, or `VITE_*` variables. Keep them only in an ignored local `.env`
or the server process environment. Portable handoffs can contain private goal
text and provider outputs even though their schema excludes credentials.

## Reporting a vulnerability

Use the repository's private GitHub Security Advisory reporting feature. Do not
open a public issue containing a secret, exploit, private prompt, or user data.
Include the affected commit, reproduction steps with fake credentials, impact,
and the smallest safe fix if known. If private reporting is unavailable, open a
public issue containing no sensitive or exploit details and ask the maintainer
for a private contact route.

No bug bounty or response-time guarantee is offered. Maintainers should
acknowledge a complete report, reproduce it safely, isolate provider spending,
and avoid publishing a fix until the release gate passes.
