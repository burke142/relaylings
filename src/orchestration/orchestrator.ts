import type { Agent, Message, Mission, Role, Task } from '../runtime/types';
import { DeadlineError, withDeadline } from './deadline';
import { assertSafeJob } from './jobPacket';
import {
  JOB_PACKET_VERSION,
  type AgentAdapter,
  type AgentJob,
  type AgentJobReceipt,
  type ExecuteMissionOptions,
  type OrchestrationEvent,
  type OrchestrationRun,
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;

export async function executeMission(
  source: Mission,
  adapter: AgentAdapter,
  options: ExecuteMissionOptions = {},
): Promise<OrchestrationRun> {
  const mission = cloneMission(source);
  mission.status = 'running';
  const receipts: AgentJobReceipt[] = (options.initialReceipts ?? []).map((receipt) => ({
    ...receipt,
    error: receipt.error ? { ...receipt.error } : undefined,
    usage: receipt.usage ? { ...receipt.usage } : undefined,
  }));
  const events: OrchestrationEvent[] = [];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const maxAgentAttempts = options.maxAgentAttempts ?? 2;

  const emit = (event: Omit<OrchestrationEvent, 'index'>) => {
    const complete: OrchestrationEvent = { ...event, index: events.length + 1 };
    events.push(complete);
    options.onEvent?.(complete);
    options.onState?.(cloneMission(mission));
  };

  for (const task of mission.tasks) {
    if (options.signal?.aborted) return cancelled(mission, receipts, events, emit);
    if (task.status === 'done') continue;
    const primary = pickPrimary(mission.agents, task.preferredRole);
    if (!primary) return failed(mission, task, receipts, events, emit, 'No helper is available.');

    let assignee = primary;
    let succeeded = false;
    for (let attempt = 1; attempt <= maxAgentAttempts; attempt++) {
      task.assignedTo = assignee.id;
      task.status = 'inProgress';
      task.startedAtTick ??= nextTick(mission);
      addMessage(mission, {
        fromAgentId: assignee.id,
        taskId: task.id,
        kind: attempt === 1 ? 'assign' : 'handoff',
        text: attempt === 1
          ? `I’ll take “${task.title}”.`
          : `I’ve got it from here. Taking over “${task.title}”.`,
      });
      emit({
        kind: attempt === 1 ? 'assigned' : 'handoff',
        taskId: task.id,
        agentId: assignee.id,
        fromAgentId: attempt === 1 ? undefined : primary.id,
        message: `${assignee.name} ${attempt === 1 ? 'started' : 'took over'} ${task.title}.`,
      });
      emit({ kind: 'started', taskId: task.id, agentId: assignee.id, message: `${adapter.label} is working.` });

      const job = makeJob(mission, task, assignee, attempt, receipts, timeoutMs, maxOutputChars);
      try {
        const receipt = await withDeadline(
          (signal) => adapter.execute(job, signal),
          timeoutMs,
          options.signal,
        );
        const normalized = normalizeReceipt(receipt, job, adapter.id, maxOutputChars);
        receipts.push(normalized);
        options.onReceipt?.(normalized);
        if (receipt.status !== 'completed') throw receiptError(receipt);
        task.status = 'done';
        task.stepsRemaining = 0;
        task.completedAtTick = nextTick(mission);
        addMessage(mission, {
          fromAgentId: assignee.id,
          taskId: task.id,
          kind: 'done',
          text: `Done: “${task.title}”.`,
        });
        emit({ kind: 'completed', taskId: task.id, agentId: assignee.id, message: `${assignee.name} finished ${task.title}.` });
        succeeded = true;
        break;
      } catch (error) {
        if (options.signal?.aborted) return cancelled(mission, receipts, events, emit);
        task.status = 'stalled';
        task.stalledAtTick = nextTick(mission);
        const message = safeErrorMessage(error);
        addMessage(mission, {
          fromAgentId: assignee.id,
          taskId: task.id,
          kind: 'stall',
          text: `I’m stuck on “${task.title}”. Can someone help?`,
        });
        emit({ kind: 'stalled', taskId: task.id, agentId: assignee.id, message });
        if (attempt >= maxAgentAttempts || !canRetry(error)) break;
        const replacement = pickReplacement(mission.agents, assignee.id);
        if (!replacement) break;
        assignee = replacement;
        task.recoveredAtTick = mission.tick + 1;
      }
    }

    if (!succeeded) return failed(mission, task, receipts, events, emit, `${task.title} still needs help.`);
  }

  mission.status = 'complete';
  mission.destinationReached = true;
  const finisher = mission.agents[mission.agents.length - 1] ?? mission.agents[0];
  if (finisher) {
    addMessage(mission, {
      fromAgentId: finisher.id,
      kind: 'arrive',
      text: `We made it to the destination! Goal reached: “${mission.goal}”.`,
    });
  }
  emit({ kind: 'mission-complete', message: `Goal reached: ${mission.goal}` });
  return { status: 'complete', mission, receipts, events };
}

function makeJob(
  mission: Mission,
  task: Task,
  assignee: Agent,
  attempt: number,
  receipts: AgentJobReceipt[],
  timeoutMs: number,
  maxOutputChars: number,
): AgentJob {
  const job: AgentJob = {
    version: JOB_PACKET_VERSION,
    id: `${mission.id}:${task.id}:${attempt}`,
    missionId: mission.id,
    goal: mission.goal,
    task: {
      id: task.id,
      title: task.title,
      plain: task.plain,
      preferredRole: task.preferredRole,
    },
    assignee: { id: assignee.id, name: assignee.name, role: assignee.role },
    attempt,
    context: receipts
      .filter((receipt) => receipt.status === 'completed' && receipt.output)
      .slice(-8)
      .map((receipt) => ({ taskId: receipt.jobId.split(':').at(-2) ?? receipt.jobId, summary: receipt.output!.slice(0, 1_500) })),
    limits: { timeoutMs, maxOutputChars },
  };
  assertSafeJob(job);
  return job;
}

function pickPrimary(agents: Agent[], role: Role): Agent | undefined {
  return agents.find((agent) => agent.role === role) ?? agents[0];
}

function pickReplacement(agents: Agent[], avoidId: string): Agent | undefined {
  return agents.find((agent) => agent.role === 'helper' && agent.id !== avoidId)
    ?? agents.find((agent) => agent.id !== avoidId);
}

function normalizeReceipt(
  receipt: AgentJobReceipt,
  job: AgentJob,
  provider: AgentAdapter['id'],
  maxOutputChars: number,
): AgentJobReceipt {
  if (receipt.jobId !== job.id || receipt.provider !== provider) throw new Error('Helper returned a mismatched receipt.');
  return { ...receipt, output: receipt.output?.slice(0, maxOutputChars) };
}

function receiptError(receipt: AgentJobReceipt): Error {
  const error = new Error(receipt.error?.message ?? 'The helper could not complete this task.') as Error & { retryable?: boolean };
  error.retryable = receipt.error?.retryable ?? false;
  return error;
}

function canRetry(error: unknown): boolean {
  if (error instanceof DeadlineError) return true;
  if (error instanceof Error && 'retryable' in error && typeof error.retryable === 'boolean') return error.retryable;
  return true;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DeadlineError) return error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'The helper stopped unexpectedly.';
}

function failed(
  mission: Mission,
  task: Task,
  receipts: AgentJobReceipt[],
  events: OrchestrationEvent[],
  emit: (event: Omit<OrchestrationEvent, 'index'>) => void,
  message: string,
): OrchestrationRun {
  mission.status = 'failed';
  task.status = 'stalled';
  emit({ kind: 'mission-failed', taskId: task.id, agentId: task.assignedTo, message });
  return { status: 'failed', mission, receipts, events };
}

function cancelled(
  mission: Mission,
  receipts: AgentJobReceipt[],
  events: OrchestrationEvent[],
  emit: (event: Omit<OrchestrationEvent, 'index'>) => void,
): OrchestrationRun {
  mission.status = 'cancelled';
  for (const task of mission.tasks) {
    if (task.status === 'assigned' || task.status === 'inProgress') task.status = 'cancelled';
  }
  emit({ kind: 'mission-failed', message: 'Mission cancelled safely.' });
  return { status: 'cancelled', mission, receipts, events };
}

function addMessage(mission: Mission, draft: Omit<Message, 'id' | 'tick'>): void {
  const tick = nextTick(mission);
  mission.messages.push({ ...draft, id: `live-${tick}-${mission.messages.length + 1}`, tick });
}

function nextTick(mission: Mission): number {
  mission.tick += 1;
  return mission.tick;
}

function cloneMission(mission: Mission): Mission {
  return {
    ...mission,
    agents: mission.agents.map((agent) => ({ ...agent })),
    tasks: mission.tasks.map((task) => ({ ...task })),
    messages: mission.messages.map((message) => ({ ...message })),
    stallScheduled: { ...mission.stallScheduled },
  };
}
