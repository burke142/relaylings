export type Role = 'planner' | 'runner' | 'checker' | 'helper';

export const ROLE_LABEL: Record<Role, string> = {
  planner: 'Planner',
  runner: 'Doer',
  checker: 'Checker',
  helper: 'Rescuer',
};

export const ROLE_BLURB: Record<Role, string> = {
  planner: 'breaks a goal into smaller pieces',
  runner: 'does the main work',
  checker: 'looks over finished work',
  helper: 'jumps in when someone is stuck',
};

export type EyeStyle = 'wide' | 'sleepy' | 'sparkle' | 'happy';

export interface Agent {
  id: string;
  name: string;
  role: Role;
  hue: number;
  eyeStyle: EyeStyle;
}

export type TaskStatus = 'pending' | 'assigned' | 'inProgress' | 'stalled' | 'done' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  plain: string;
  status: TaskStatus;
  assignedTo?: string;
  stepsRemaining: number;
  stepsTotal: number;
  createdAtTick: number;
  startedAtTick?: number;
  stalledAtTick?: number;
  recoveredAtTick?: number;
  completedAtTick?: number;
  preferredRole: Role;
}

export type MessageKind =
  | 'greet'
  | 'assign'
  | 'ack'
  | 'progress'
  | 'stall'
  | 'handoff'
  | 'done'
  | 'arrive';

export interface Message {
  id: string;
  fromAgentId: string;
  toAgentId?: string;
  taskId?: string;
  kind: MessageKind;
  text: string;
  tick: number;
}

export type MissionStatus = 'draft' | 'running' | 'complete' | 'failed' | 'cancelled';

export interface Mission {
  id: string;
  goal: string;
  status: MissionStatus;
  tick: number;
  seed: number;
  tasks: Task[];
  messages: Message[];
  agents: Agent[];
  destinationReached: boolean;
  stallScheduled: {
    taskIndex: number;
    atTick: number;
    recoverAfterTicks: number;
    triggered: boolean;
    recovered: boolean;
  };
}
