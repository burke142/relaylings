# Deployment decision

Selected: a public GitHub repository plus GitHub Pages for the static practice
mode. This path is free for public repositories, keeps source and deployment
evidence together, and exposes no provider credential or local bridge.

## Ranked options

1. **GitHub Pages** — selected. Best fit for the existing Vite static build,
   authenticated publication account, public-source goal, and no-new-charge
   boundary.
2. **GitHub release bundle only** — smallest publication surface, but it makes a
   nontechnical visitor download and serve the build instead of opening a demo.
3. **Cloudflare Pages** — technically suitable, but adds another account,
   permission surface, and vendor without improving the static preview.
4. **Vercel** — useful preview deployment tooling, with the same extra-vendor
   cost for this release.
5. **Offline kiosk bundle** — retained as a future demonstration and resilience
   option, not the main public destination.

## Public boundary

The deployed site contains deterministic practice mode only. OpenRouter keys,
Codex/Claude CLI access, the loopback bridge, local cost ledgers, handoff files,
and ignored review packets are never deployed. Connected helpers remain an
explicit local opt-in described in the README and security policy.

## Build and workflow

`npm run build:pages` creates the same checked production bundle with the
repository-relative `/relaylings/` base required by the project Pages URL. The
pinned GitHub Actions workflow installs from `package-lock.json`, runs the full
release gate, builds the Pages artifact, and grants write/id-token permissions
only to the deployment job.

Official references:

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite static deployment guide](https://vite.dev/guide/static-deploy.html)

Source and live URLs are recorded in the README and release notes after the
first successful deployment. Relaylings remains a reversible preview name, not
professional trademark clearance; see `NAME_RESEARCH.md`.
