import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class SpendLedger {
  #reservedUsd = 0;
  #settledSessionUsd = 0;
  #reservations = new Map();

  static async open(options, { read = readFile } = {}) {
    const historicalSpendUsd = await readHistoricalSpend(options.filePath, read);
    return new SpendLedger({ ...options, historicalSpendUsd });
  }

  constructor({ filePath, hardCapUsd, priorSpendUsd, historicalSpendUsd = 0, sessionCapUsd, maxCostPerCallUsd, append = appendFile, makeDir = mkdir }) {
    this.filePath = filePath;
    this.hardCapUsd = hardCapUsd;
    this.configuredPriorSpendUsd = priorSpendUsd;
    this.historicalSpendUsd = historicalSpendUsd;
    this.priorSpendUsd = priorSpendUsd + historicalSpendUsd;
    if (this.priorSpendUsd > hardCapUsd) throw new Error('Recorded OpenRouter spend already exceeds the authorized ceiling.');
    this.sessionCapUsd = sessionCapUsd;
    this.maxCostPerCallUsd = maxCostPerCallUsd;
    this.append = append;
    this.makeDir = makeDir;
  }

  snapshot() {
    return {
      priorSpendUsd: round(this.priorSpendUsd),
      configuredPriorSpendUsd: round(this.configuredPriorSpendUsd),
      historicalSpendUsd: round(this.historicalSpendUsd),
      sessionSpendUsd: round(this.#settledSessionUsd),
      reservedUsd: round(this.#reservedUsd),
      sessionCapUsd: round(this.sessionCapUsd),
      hardCapUsd: round(this.hardCapUsd),
      remainingAuthorizedUsd: round(Math.max(0, this.hardCapUsd - this.priorSpendUsd - this.#settledSessionUsd - this.#reservedUsd)),
    };
  }

  reserve(jobId) {
    if (this.#reservations.has(jobId)) throw new Error('This paid job is already in flight.');
    const projectedSession = this.#settledSessionUsd + this.#reservedUsd + this.maxCostPerCallUsd;
    const projectedTotal = this.priorSpendUsd + projectedSession;
    if (projectedSession > this.sessionCapUsd || projectedTotal > this.hardCapUsd) {
      const error = new Error('OpenRouter spend cap reached; no paid call was started.');
      error.code = 'spend_cap';
      throw error;
    }
    this.#reservations.set(jobId, this.maxCostPerCallUsd);
    this.#reservedUsd += this.maxCostPerCallUsd;
    return { jobId, reservedUsd: this.maxCostPerCallUsd };
  }

  async settle(jobId, observedCostUsd, metadata = {}) {
    const reservation = this.#take(jobId);
    const observed = Number(observedCostUsd);
    const costUsd = Number.isFinite(observed) && observed >= 0 ? observed : reservation;
    this.#settledSessionUsd += costUsd;
    const record = {
      at: new Date().toISOString(),
      jobId,
      costUsd: round(costUsd),
      costSource: Number.isFinite(observed) && observed >= 0 ? 'provider' : 'reserved-maximum',
      ...metadata,
    };
    await this.makeDir(dirname(this.filePath), { recursive: true });
    await this.append(this.filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
    return record;
  }

  release(jobId) {
    this.#take(jobId);
  }

  #take(jobId) {
    const amount = this.#reservations.get(jobId);
    if (amount === undefined) throw new Error('Unknown spend reservation.');
    this.#reservations.delete(jobId);
    this.#reservedUsd -= amount;
    return amount;
  }
}

export async function readProjectLedgerSpend(filePath, read = readFile) {
  let text;
  try { text = await read(filePath, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
  const observed = moneyField(text, 'Observed spend so far');
  const conservative = moneyField(text, 'Conservatively unobserved/cancelled allowance so far');
  return observed + conservative;
}

async function readHistoricalSpend(filePath, read) {
  let text;
  try { text = await read(filePath, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
  let total = 0;
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch { throw new Error(`Spend ledger is malformed at line ${index + 1}.`); }
    if (!Number.isFinite(record.costUsd) || record.costUsd < 0) throw new Error(`Spend ledger has an invalid cost at line ${index + 1}.`);
    total += record.costUsd;
  }
  return total;
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function moneyField(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}:\\s*\\*\\*\\$([0-9]+(?:\\.[0-9]+)?)`, 'i'));
  if (!match) throw new Error(`Project spend ledger is missing “${label}”.`);
  return Number(match[1]);
}
