import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const pairs = [
  ['main text', '#f4f6ff', '#10132a'],
  ['secondary text', '#b6bee0', '#1b214a'],
  ['primary button', '#1a1400', '#ffb84d'],
  ['preview badge', '#4a3a00', '#ffb84d'],
  ['step badge', '#1a0e42', '#b7a7ff'],
  ['completed step', '#0b3218', '#a1f0b7'],
  ['speech bubble', '#1a0e42', '#dff8f3'],
];

let failed = false;
for (const [name, foreground, background] of pairs) {
  if (!css.toLowerCase().includes(foreground) || !css.toLowerCase().includes(background)) {
    process.stderr.write(`Contrast gate cannot find the ${name} palette values in styles.css.\n`);
    failed = true;
    continue;
  }
  const ratio = contrast(foreground, background);
  if (ratio < 4.5) {
    process.stderr.write(`${name} contrast is ${ratio.toFixed(2)}:1; required 4.5:1.\n`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else process.stdout.write(`Contrast gate passed (${pairs.length} essential text pairs at 4.5:1 or better).\n`);

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
