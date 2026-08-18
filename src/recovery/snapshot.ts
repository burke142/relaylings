import type { AgentJobReceipt, ProviderId } from '../orchestration/types';
import type { Agent, EyeStyle, Message, MessageKind, Mission, MissionStatus, Role, Task, TaskStatus } from '../runtime/types';

export const RECOVERY_VERSION = 1 as const;
export const RECOVERY_STORAGE_KEY = 'relaylings:mission:v1';
export const MAX_RECOVERY_BYTES = 512_000;

export type RecoveryLiveState = 'idle' | 'running' | 'paused' | 'complete' | 'failed' | 'cancelled';

export interface RecoverySnapshot {
  version: typeof RECOVERY_VERSION;
  savedAt: string;
  provider: ProviderId;
  goal: string;
  agents: Agent[];
  mission: Mission;
  receipts: AgentJobReceipt[];
  liveState: RecoveryLiveState;
}

export interface SnapshotInput {
  provider: ProviderId;
  goal: string;
  agents: Agent[];
  mission: Mission;
  receipts?: AgentJobReceipt[];
  liveState?: RecoveryLiveState;
  savedAt?: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PROVIDERS = new Set<ProviderId>(['simulation', 'openrouter', 'codex', 'claude']);
const ROLES = new Set<Role>(['planner', 'runner', 'checker', 'helper']);
const EYES = new Set<EyeStyle>(['wide', 'sleepy', 'sparkle', 'happy']);
const TASK_STATUSES = new Set<TaskStatus>(['pending', 'assigned', 'inProgress', 'stalled', 'done', 'cancelled']);
const MISSION_STATUSES = new Set<MissionStatus>(['draft', 'running', 'complete', 'failed', 'cancelled']);
const MESSAGE_KINDS = new Set<MessageKind>(['greet', 'assign', 'ack', 'progress', 'stall', 'handoff', 'done', 'arrive']);
const LIVE_STATES = new Set<RecoveryLiveState>(['idle', 'running', 'paused', 'complete', 'failed', 'cancelled']);
const RECEIPT_STATUSES = new Set<AgentJobReceipt['status']>(['completed', 'failed']);
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

const CREDENTIAL_PATTERNS = [
  /\b(?:OPENROUTER_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*[:=]\s*[^\s,;]+/i,
  /\b(?:api[_ -]?key|access[_ -]?token|password|secret|client[_ -]?secret)\s*[:=]\s*[^\s,;]+/i,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}\b/i,
  /\bsk-(?:or-v1-)?[A-Za-z0-9_-]{16,}\b/,
];

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryError';
  }
}

export function createRecoverySnapshot(input: SnapshotInput): RecoverySnapshot {
  const snapshot: RecoverySnapshot = {
    version: RECOVERY_VERSION,
    savedAt: input.savedAt ?? new Date().toISOString(),
    provider: input.provider,
    goal: input.goal,
    agents: clone(input.agents),
    mission: clone(input.mission),
    receipts: clone(input.receipts ?? []),
    liveState: input.liveState ?? stateFromMission(input.mission),
  };
  validateSnapshot(snapshot);
  assertNoCredentialLikeText(snapshot);
  return snapshot;
}

export function serializeRecoverySnapshot(snapshot: RecoverySnapshot): string {
  validateSnapshot(snapshot);
  assertNoCredentialLikeText(snapshot);
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (byteLength(text) > MAX_RECOVERY_BYTES) {
    throw new RecoveryError('This checkpoint is too large to save safely.');
  }
  return text;
}

export function parseRecoverySnapshot(text: string): RecoverySnapshot {
  if (!text.trim()) throw new RecoveryError('The handoff file is empty.');
  if (byteLength(text) > MAX_RECOVERY_BYTES) throw new RecoveryError('The handoff file is too large.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RecoveryError('The handoff file is not valid JSON.');
  }
  if (!isRecord(value) || value.version !== RECOVERY_VERSION) {
    throw new RecoveryError('This handoff version is not supported by this build.');
  }
  validateSnapshot(value);
  assertNoCredentialLikeText(value);
  return clone(value as RecoverySnapshot);
}

export function saveRecoverySnapshot(snapshot: RecoverySnapshot, storage: KeyValueStorage = window.localStorage): void {
  storage.setItem(RECOVERY_STORAGE_KEY, serializeRecoverySnapshot(snapshot));
}

export function loadRecoverySnapshot(storage: KeyValueStorage = window.localStorage): RecoverySnapshot | null {
  const text = storage.getItem(RECOVERY_STORAGE_KEY);
  return text === null ? null : parseRecoverySnapshot(text);
}

export function clearRecoverySnapshot(storage: KeyValueStorage = window.localStorage): void {
  storage.removeItem(RECOVERY_STORAGE_KEY);
}

export function shouldPauseLiveRestore(snapshot: RecoverySnapshot): boolean {
  return snapshot.provider !== 'simulation' && snapshot.mission.status !== 'complete';
}

export function recoveryFilename(snapshot: RecoverySnapshot): string {
  const date = snapshot.savedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'checkpoint';
  return `relaylings-handoff-${date}.json`;
}

function validateSnapshot(value: unknown): asserts value is RecoverySnapshot {
  const snapshot = objectWith(value, ['version', 'savedAt', 'provider', 'goal', 'agents', 'mission', 'receipts', 'liveState'], 'handoff');
  if (snapshot.version !== RECOVERY_VERSION) fail('Unsupported handoff version.');
  text(snapshot.savedAt, 'savedAt', 48);
  if (!Number.isFinite(Date.parse(snapshot.savedAt as string))) fail('savedAt must be an ISO date.');
  enumValue(snapshot.provider, PROVIDERS, 'provider');
  text(snapshot.goal, 'goal', 4_000);
  enumValue(snapshot.liveState, LIVE_STATES, 'liveState');

  const agents = array(snapshot.agents, 'agents', 2, 6);
  const parsedAgents = agents.map(validateAgent);
  unique(parsedAgents.map((agent) => agent.id), 'agent IDs');

  const mission = validateMission(snapshot.mission);
  if (mission.goal !== snapshot.goal) fail('The mission goal does not match the handoff goal.');
  if (JSON.stringify(mission.agents) !== JSON.stringify(parsedAgents)) fail('The mission team does not match the handoff team.');

  const receipts = array(snapshot.receipts, 'receipts', 0, 40).map(validateReceipt);
  for (const receipt of receipts) {
    if (receipt.provider !== snapshot.provider) fail('A receipt does not match the selected helper.');
    if (!receipt.jobId.startsWith(`${mission.id}:`)) fail('A receipt does not belong to this mission.');
  }
}

function validateAgent(value: unknown): Agent {
  const agent = objectWith(value, ['id', 'name', 'role', 'hue', 'eyeStyle'], 'agent');
  id(agent.id, 'agent.id');
  text(agent.name, 'agent.name', 40);
  enumValue(agent.role, ROLES, 'agent.role');
  integer(agent.hue, 'agent.hue', 0, 359);
  enumValue(agent.eyeStyle, EYES, 'agent.eyeStyle');
  return agent as unknown as Agent;
}

function validateMission(value: unknown): Mission {
  const mission = objectWith(value, ['id', 'goal', 'status', 'tick', 'seed', 'tasks', 'messages', 'agents', 'destinationReached', 'stallScheduled'], 'mission');
  id(mission.id, 'mission.id');
  text(mission.goal, 'mission.goal', 4_000);
  enumValue(mission.status, MISSION_STATUSES, 'mission.status');
  integer(mission.tick, 'mission.tick', 0, 1_000_000);
  integer(mission.seed, 'mission.seed', 0, 0xffffffff);
  if (typeof mission.destinationReached !== 'boolean') fail('mission.destinationReached must be true or false.');

  const agents = array(mission.agents, 'mission.agents', 2, 6).map(validateAgent);
  unique(agents.map((agent) => agent.id), 'mission agent IDs');
  const agentIds = new Set(agents.map((agent) => agent.id));

  const tasks = array(mission.tasks, 'mission.tasks', 1, 20).map(validateTask);
  unique(tasks.map((task) => task.id), 'task IDs');
  for (const task of tasks) {
    if (task.assignedTo && !agentIds.has(task.assignedTo)) fail('A task is assigned to an unknown helper.');
  }

  const messages = array(mission.messages, 'mission.messages', 0, 500).map(validateMessage);
  unique(messages.map((message) => message.id), 'message IDs');
  const taskIds = new Set(tasks.map((task) => task.id));
  for (const message of messages) {
    if (message.fromAgentId !== 'system' && !agentIds.has(message.fromAgentId)) fail('A message comes from an unknown helper.');
    if (message.toAgentId && !agentIds.has(message.toAgentId)) fail('A message points to an unknown helper.');
    if (message.taskId && !taskIds.has(message.taskId)) fail('A message points to an unknown task.');
  }

  const stall = objectWith(mission.stallScheduled, ['taskIndex', 'atTick', 'recoverAfterTicks', 'triggered', 'recovered'], 'mission.stallScheduled');
  integer(stall.taskIndex, 'mission.stallScheduled.taskIndex', 0, tasks.length - 1);
  integer(stall.atTick, 'mission.stallScheduled.atTick', 0, 1_000_000);
  integer(stall.recoverAfterTicks, 'mission.stallScheduled.recoverAfterTicks', 0, 100_000);
  if (typeof stall.triggered !== 'boolean' || typeof stall.recovered !== 'boolean') fail('The stall recovery flags are invalid.');

  if (mission.status === 'complete' && (!mission.destinationReached || tasks.some((task) => task.status !== 'done'))) {
    fail('A completed mission must reach the destination with every task done.');
  }
  return mission as unknown as Mission;
}

function validateTask(value: unknown): Task {
  const required = ['id', 'title', 'plain', 'status', 'stepsRemaining', 'stepsTotal', 'createdAtTick', 'preferredRole'];
  const optional = ['assignedTo', 'startedAtTick', 'stalledAtTick', 'recoveredAtTick', 'completedAtTick'];
  const task = objectWith(value, required, 'task', optional);
  id(task.id, 'task.id');
  text(task.title, 'task.title', 1_000);
  text(task.plain, 'task.plain', 2_000);
  enumValue(task.status, TASK_STATUSES, 'task.status');
  integer(task.stepsTotal, 'task.stepsTotal', 1, 1_000);
  integer(task.stepsRemaining, 'task.stepsRemaining', 0, task.stepsTotal as number);
  integer(task.createdAtTick, 'task.createdAtTick', 0, 1_000_000);
  enumValue(task.preferredRole, ROLES, 'task.preferredRole');
  if (task.assignedTo !== undefined) id(task.assignedTo, 'task.assignedTo');
  for (const key of optional.slice(1)) {
    if (task[key] !== undefined) integer(task[key], `task.${key}`, 0, 1_000_000);
  }
  return task as unknown as Task;
}

function validateMessage(value: unknown): Message {
  const message = objectWith(value, ['id', 'fromAgentId', 'kind', 'text', 'tick'], 'message', ['toAgentId', 'taskId']);
  id(message.id, 'message.id');
  id(message.fromAgentId, 'message.fromAgentId');
  if (message.toAgentId !== undefined) id(message.toAgentId, 'message.toAgentId');
  if (message.taskId !== undefined) id(message.taskId, 'message.taskId');
  enumValue(message.kind, MESSAGE_KINDS, 'message.kind');
  text(message.text, 'message.text', 4_000);
  integer(message.tick, 'message.tick', 0, 1_000_000);
  return message as unknown as Message;
}

function validateReceipt(value: unknown): AgentJobReceipt {
  const receipt = objectWith(value, ['version', 'jobId', 'provider', 'status', 'durationMs'], 'receipt', ['output', 'error', 'usage']);
  if (receipt.version !== 1) fail('A receipt version is unsupported.');
  id(receipt.jobId, 'receipt.jobId');
  enumValue(receipt.provider, PROVIDERS, 'receipt.provider');
  enumValue(receipt.status, RECEIPT_STATUSES, 'receipt.status');
  integer(receipt.durationMs, 'receipt.durationMs', 0, 86_400_000);
  if (receipt.output !== undefined) text(receipt.output, 'receipt.output', 12_000, true);
  if (receipt.error !== undefined) {
    const error = objectWith(receipt.error, ['code', 'message', 'retryable'], 'receipt.error');
    id(error.code, 'receipt.error.code');
    text(error.message, 'receipt.error.message', 1_000);
    if (typeof error.retryable !== 'boolean') fail('receipt.error.retryable must be true or false.');
  }
  if (receipt.usage !== undefined) {
    const usage = objectWith(receipt.usage, [], 'receipt.usage', ['inputTokens', 'outputTokens', 'costUsd']);
    if (usage.inputTokens !== undefined) integer(usage.inputTokens, 'receipt.usage.inputTokens', 0, 100_000_000);
    if (usage.outputTokens !== undefined) integer(usage.outputTokens, 'receipt.usage.outputTokens', 0, 100_000_000);
    if (usage.costUsd !== undefined) finite(usage.costUsd, 'receipt.usage.costUsd', 0, 400);
  }
  if (receipt.status === 'completed' && receipt.error !== undefined) fail('A completed receipt cannot include an error.');
  if (receipt.status === 'failed' && receipt.error === undefined) fail('A failed receipt must include an error.');
  return receipt as unknown as AgentJobReceipt;
}

function assertNoCredentialLikeText(value: unknown): void {
  const textValue = JSON.stringify(value);
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(textValue))) {
    throw new RecoveryError('This checkpoint looks like it contains a credential, so it was not saved or exported. Remove the credential and try again.');
  }
}

function stateFromMission(mission: Mission): RecoveryLiveState {
  return mission.status === 'complete' ? 'complete'
    : mission.status === 'failed' ? 'failed'
    : mission.status === 'cancelled' ? 'cancelled'
    : mission.status === 'running' ? 'running'
    : 'idle';
}

function objectWith(value: unknown, required: string[], label: string, optional: string[] = []): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) fail(`${label}.${key} is required.`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not allowed.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function array(value: unknown, label: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} has an invalid length.`);
  return value;
}

function text(value: unknown, label: string, max: number, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > max) fail(`${label} is invalid.`);
}

function id(value: unknown, label: string): asserts value is string {
  text(value, label, 160);
  if (!SAFE_ID.test(value)) fail(`${label} contains unsupported characters.`);
}

function integer(value: unknown, label: string, min: number, max: number): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(`${label} is invalid.`);
}

function finite(value: unknown, label: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} is invalid.`);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.has(value as T)) fail(`${label} is invalid.`);
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fail(message: string): never {
  throw new RecoveryError(message);
}
