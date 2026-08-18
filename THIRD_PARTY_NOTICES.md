# Third-party notices

The shipped browser bundle includes React, React DOM, and Scheduler, which are
licensed under the MIT License by Meta Platforms, Inc. and affiliates. Their
required notice is preserved in `public/third-party-licenses.txt` and is copied
into every production build.

Development-only packages are not part of the deployed browser bundle. Their
licenses remain in their npm packages and metadata:

- TypeScript — Apache-2.0
- Vite and `@vitejs/plugin-react` — MIT
- Vitest — MIT
- React and React DOM type declarations — MIT

Run `npm audit` and inspect `npm ls --all` before a release when dependencies
change. This file is informational and does not replace the license terms in
each package.
