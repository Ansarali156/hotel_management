/**
 * Minimal BullMQ type declarations for the test environment.
 *
 * The real `bullmq` package is declared as a runtime dependency in package.json
 * and must be installed (`npm install`) before running the production server.
 * In the test environment, `moduleNameMapper` in jest.config.ts redirects all
 * `require('bullmq')` calls to tests/__mocks__/bullmq.js.
 *
 * These declarations satisfy the TypeScript compiler (ts-jest) without requiring
 * the package to be physically present in node_modules.
 */

declare module 'bullmq' {
  export interface JobOptions {
    attempts?: number;
    backoff?: { type: string; delay: number };
    removeOnComplete?: boolean | { count: number };
    removeOnFail?: boolean | { count: number };
    jobId?: string;
  }

  export interface QueueOptions {
    connection?: { url?: string } | Record<string, unknown>;
    defaultJobOptions?: JobOptions;
  }

  export interface WorkerOptions {
    connection?: { url?: string } | Record<string, unknown>;
    concurrency?: number;
    lockDuration?: number;
  }

  export class Job<T = unknown> {
    id?: string;
    data: T;
    attemptsMade: number;
  }

  export class Queue<T = unknown> {
    constructor(name: string, opts?: QueueOptions);
    add(name: string, data: T, opts?: JobOptions): Promise<{ id?: string }>;
    close(): Promise<void>;
  }

  export class Worker<T = unknown> {
    constructor(
      name: string,
      processor: (job: Job<T>) => Promise<void>,
      opts?: WorkerOptions
    );
    on(event: 'completed', handler: (job: { id?: string }) => void): this;
    on(event: 'failed', handler: (job: { id?: string; attemptsMade?: number } | undefined, err: Error) => void): this;
    on(event: 'stalled', handler: (jobId: string) => void): this;
    on(event: string, handler: (...args: unknown[]) => void): this;
    close(): Promise<void>;
  }
}
