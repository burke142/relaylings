import type { Agent, Message, Mission, Role, Task } from './types';

// Pure, deterministic tick function. Given a mission, return the mission one step later.
export function tick(mission: Mission): Mission {
  if (mission.status === 'complete' || mission.status === 'failed' || mission.status === 'cancelled') return mission;

  const next: Mission = {
    ...mission,
    tick: mission.tick + 1,
    tasks: mission.tasks.map((t) => ({ ...t })),
    messages: mission.messages.slice(),
    agents: mission.agents.slice(),
    stallScheduled: { ...mission.stallScheduled },
    status: mission.status === 'draft' ? 'running' : mission.status,
  };
  const now = next.tick;
  const emit = (m: Omit<Message, 'id' | 'tick'>) => {
    next.messages.push({
      ...m,
      tick: now,
      id: `msg-${now}-${next.messages.length + 1}`,
    });
  };

  // 1. Assign any pending tasks whose predecessor is done (or which is first).
  for (let i = 0; i < next.tasks.length; i++) {
    const task = next.tasks[i];
    if (task.status !== 'pending') continue;
    const prev = next.tasks[i - 1];
    if (prev && prev.status !== 'done') continue;
    const agent = pickAgentForRole(next.agents, task.preferredRole, next.tasks);
    if (!agent) continue;
    task.assignedTo = agent.id;
    task.status = 'assigned';
    task.startedAtTick = now;
    emit({
      fromAgentId: agent.id,
      toAgentId: undefined,
      taskId: task.id,
      kind: 'assign',
      text: `I’ll take “${task.title}”.`,
    });
    emit({
      fromAgentId: agent.id,
      toAgentId: undefined,
      taskId: task.id,
      kind: 'ack',
      text: `Starting now.`,
    });
    break; // one assignment per tick keeps the log readable
  }

  // 2. Trigger the scheduled stall.
  const stall = next.stallScheduled;
  if (!stall.triggered && now >= stall.atTick) {
    const task = next.tasks[stall.taskIndex];
    if (task && (task.status === 'assigned' || task.status === 'inProgress')) {
      task.status = 'stalled';
      task.stalledAtTick = now;
      stall.triggered = true;
      if (task.assignedTo) {
        emit({
          fromAgentId: task.assignedTo,
          toAgentId: undefined,
          taskId: task.id,
          kind: 'stall',
          text: `I’m stuck on “${task.title}”. Can someone help?`,
        });
      }
    }
  }

  // 3. Recover the stalled task after the recovery window.
  if (stall.triggered && !stall.recovered) {
    const task = next.tasks[stall.taskIndex];
    if (task && task.status === 'stalled' && task.stalledAtTick !== undefined) {
      const canRecover = now - task.stalledAtTick >= stall.recoverAfterTicks;
      if (canRecover) {
        const prior = task.assignedTo;
        const helper = pickReassignAgent(next.agents, prior);
        if (helper) {
          task.assignedTo = helper.id;
          task.status = 'inProgress';
          task.recoveredAtTick = now;
          stall.recovered = true;
          emit({
            fromAgentId: helper.id,
            toAgentId: prior,
            taskId: task.id,
            kind: 'handoff',
            text: `I’ve got it from here. Taking over “${task.title}”.`,
          });
        }
      }
    }
  }

  // 4. Do one step of work on each in-flight (non-stalled) task.
  for (const task of next.tasks) {
    if (task.status !== 'assigned' && task.status !== 'inProgress') continue;
    if (task.stepsRemaining <= 0) continue;
    task.status = 'inProgress';
    task.stepsRemaining -= 1;
    if (task.stepsRemaining === Math.floor(task.stepsTotal / 2) && task.assignedTo) {
      emit({
        fromAgentId: task.assignedTo,
        toAgentId: undefined,
        taskId: task.id,
        kind: 'progress',
        text: `Halfway through “${task.title}”.`,
      });
    }
    if (task.stepsRemaining === 0) {
      task.status = 'done';
      task.completedAtTick = now;
      if (task.assignedTo) {
        emit({
          fromAgentId: task.assignedTo,
          toAgentId: undefined,
          taskId: task.id,
          kind: 'done',
          text: `Done: “${task.title}”.`,
        });
      }
    }
  }

  // 5. Mission complete?
  if (next.tasks.every((t) => t.status === 'done')) {
    if (!next.destinationReached) {
      next.destinationReached = true;
      next.status = 'complete';
      const last = next.agents[next.agents.length - 1] ?? next.agents[0];
      if (last) {
        emit({
          fromAgentId: last.id,
          toAgentId: undefined,
          kind: 'arrive',
          text: `We made it to the destination! Goal reached: “${next.goal}”.`,
        });
      }
    }
  }

  return next;
}

export function runUntilComplete(mission: Mission, maxTicks = 200): Mission {
  let m = mission;
  for (let i = 0; i < maxTicks; i++) {
    if (m.status === 'complete') return m;
    m = tick(m);
  }
  return m;
}

function pickAgentForRole(agents: Agent[], role: Role, tasks: Task[]): Agent | undefined {
  const load = new Map<string, number>();
  for (const t of tasks) {
    if (t.assignedTo && (t.status === 'assigned' || t.status === 'inProgress')) {
      load.set(t.assignedTo, (load.get(t.assignedTo) ?? 0) + 1);
    }
  }
  const sorted = agents
    .slice()
    .sort((a, b) => {
      const aMatch = a.role === role ? 0 : 1;
      const bMatch = b.role === role ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      const aLoad = load.get(a.id) ?? 0;
      const bLoad = load.get(b.id) ?? 0;
      if (aLoad !== bLoad) return aLoad - bLoad;
      return a.id.localeCompare(b.id);
    });
  return sorted[0];
}

function pickReassignAgent(agents: Agent[], avoidId?: string): Agent | undefined {
  const helper = agents.find((a) => a.role === 'helper' && a.id !== avoidId);
  if (helper) return helper;
  return agents.find((a) => a.id !== avoidId);
}
