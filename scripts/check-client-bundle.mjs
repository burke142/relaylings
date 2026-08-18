import { readdir, readFile } from 'node:fs/promises';
const root = new URL('../dist/', import.meta.url);
const sizeLimits = { '.js': 250 * 1024, '.css': 80 * 1024 };
const patterns = [
  { name: 'OpenRouter secret', regex: /sk-or-v1-[A-Za-z0-9_-]{16,}/g },
  { name: 'OpenAI-style secret', regex: /sk-proj-[A-Za-z0-9_-]{16,}/g },
  { name: 'Anthropic secret', regex: /sk-ant-[A-Za-z0-9_-]{16,}/g },
  { name: 'client-side provider-key variable', regex: /VITE_(?:OPENROUTER|OPENAI|ANTHROPIC)_[A-Z_]+/g },
  { name: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

const files = await walk(root);
let failed = false;
const sizes = { '.js': 0, '.css': 0 };
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const extension of Object.keys(sizes)) {
    if (file.pathname.endsWith(extension)) sizes[extension] += Buffer.byteLength(text);
  }
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      process.stderr.write(`Client bundle contains ${pattern.name}: ${file.pathname}\n`);
      failed = true;
    }
    pattern.regex.lastIndex = 0;
  }
}
for (const [extension, limit] of Object.entries(sizeLimits)) {
  if (sizes[extension] > limit) {
    process.stderr.write(`Client ${extension} bundle is ${sizes[extension]} bytes; limit is ${limit} bytes.\n`);
    failed = true;
  }
}
try {
  await readFile(new URL('third-party-licenses.txt', root), 'utf8');
} catch {
  process.stderr.write('Production build is missing third-party-licenses.txt.\n');
  failed = true;
}
try {
  const index = await readFile(new URL('index.html', root), 'utf8');
  if (!index.includes('Content-Security-Policy') || !index.includes("default-src 'self'")) {
    process.stderr.write('Production index is missing its static Content Security Policy.\n');
    failed = true;
  }
} catch {
  process.stderr.write('Production build is missing index.html.\n');
  failed = true;
}
if (failed) process.exitCode = 1;
else process.stdout.write(`Client bundle gate passed: no secrets; JS ${sizes['.js']} / ${sizeLimits['.js']} bytes; CSS ${sizes['.css']} / ${sizeLimits['.css']} bytes; runtime notices and static CSP present.\n`);

async function walk(url) {
  const entries = await readdir(url, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
    return entry.isDirectory() ? walk(child) : [child];
  }));
  return nested.flat().filter((file) => /\.(?:html|js|css|map|json)$/i.test(file.pathname));
}
