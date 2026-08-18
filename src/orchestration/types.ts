import type { Agent, Message, Mission, Role, Task } from '../runtime/types';

export const JOB_PACKET_VERSION = 1 as const;

export type ProviderId = 'simulation' | 'openrouter' | 'codex' | 'claude';

export interface AgentJob {
  version: typeof JOB_PACKET_VERSION;
  id: string;
  missionId: string;
  goal: string;
  task: Pick<Task, 'id' | 'title' | 'plain' | 'preferredRole'>;
  assignee: Pick<Agent, 'id' | 'name' | 'role'>;
  attempt: number;
  context: Array<{
    taskId: string;
    summary: string;
  }>;
  limits: {
    timeoutMs: number;
    maxOutputChars: number;
  };
}

export interface AgentJobReceipt {
  version: typeof JOB_PACKET_VERSION;
  jobId: string;
  provider: ProviderId;
  status: 'completed' | 'failed';
  output?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  durationMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

export interface AgentAdapter {
  readonly id: ProviderId;
  readonly label: string;
  execute(job: AgentJob, signal: AbortSignal): Promise<AgentJobReceipt>;
}

export type OrchestrationEventKind =
  | 'assigned'
  | 'started'
  | 'stalled'
  | 'handoff'
  | 'completed'
  | 'mission-complete'
  | 'mission-failed';

export interface OrchestrationEvent {
  index: number;
  kind: OrchestrationEventKind;
  taskId?: string;
  agentId?: string;
  fromAgentId?: string;
  message: string;
}

export interface OrchestrationRun {
  status: 'complete' | 'failed' | 'cancelled';
  mission: Mission;
  receipts: AgentJobReceipt[];
  events: OrchestrationEvent[];
}

export interface ExecuteMissionOptions {
  signal?: AbortSignal;
  initialReceipts?: AgentJobReceipt[];
  timeoutMs?: number;
  maxOutputChars?: number;
  maxAgentAttempts?: 1 | 2;
  onEvent?: (event: OrchestrationEvent) => void;
  onState?: (mission: Mission) => void;
  onReceipt?: (receipt: AgentJobReceipt) => void;
}

export interface JobContext {
  taskId: string;
  summary: string;
}

export interface MessageDraft extends Omit<Message, 'id' | 'tick'> {}

export interface TaskAssignment {
  task: Task;
  agent: Agent;
  role: Role;
}
