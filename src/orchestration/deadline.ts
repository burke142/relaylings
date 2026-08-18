export class DeadlineError extends Error {
  readonly code = 'timeout';
  readonly retryable = true;

  constructor(message = 'The helper took too long and was stopped.') {
    super(message);
    this.name = 'DeadlineError';
  }
}

export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) relayAbort();
  else parentSignal?.addEventListener('abort', relayAbort, { once: true });

  let timedOut = false;
  const timer = windowOrGlobalSetTimeout(() => {
    timedOut = true;
    controller.abort(new DeadlineError());
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw new DeadlineError();
    throw error;
  } finally {
    windowOrGlobalClearTimeout(timer);
    parentSignal?.removeEventListener('abort', relayAbort);
  }
}

function windowOrGlobalSetTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, ms);
}

function windowOrGlobalClearTimeout(timer: ReturnType<typeof setTimeout>): void {
  clearTimeout(timer);
}
