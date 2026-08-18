import { JOB_PACKET_VERSION, type AgentAdapter, type AgentJob, type AgentJobReceipt } from '../types';
import { assertSafeJob } from '../jobPacket';

export class SimulationAdapter implements AgentAdapter {
  readonly id = 'simulation' as const;
  readonly label = 'Practice helpers';

  async execute(job: AgentJob, signal: AbortSignal): Promise<AgentJobReceipt> {
    assertSafeJob(job);
    if (signal.aborted) throw signal.reason ?? new Error('Cancelled.');
    const output = `${job.assignee.name} completed “${job.task.title}”: ${job.task.plain}`;
    return {
      version: JOB_PACKET_VERSION,
      jobId: job.id,
      provider: this.id,
      status: 'completed',
      output: output.slice(0, job.limits.maxOutputChars),
      durationMs: 0,
    };
  }
}
