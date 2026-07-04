import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Job, Queue } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { AiService } from './ai.service';
import { Client } from 'pg';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private workerId!: string;
  private isRunning = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private activeJobs = 0;
  private maxConcurrency = 10;
  private pgClient!: Client;
  private sleepResolve: ((value: unknown) => void) | null = null;
  private assignedShardId = 1; // Logical Sharding demonstration

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private aiService: AiService
  ) {}

  async onModuleInit() {
    const worker = await this.prisma.worker.create({
      data: {
        name: `worker-${Math.random().toString(36).substring(7)}-shard-${this.assignedShardId}`,
        status: 'ACTIVE',
      }
    });
    this.workerId = worker.id;
    this.logger.log(`Worker ${this.workerId} registered (Assigned Shard: ${this.assignedShardId})`);

    this.isRunning = true;
    this.startHeartbeat();
    
    // Setup LISTEN for Event-Driven Execution
    await this.setupListen();

    this.pollJobs(); 
  }

  async setupListen() {
    // Note: uses standard process.env.DATABASE_URL loaded by Prisma/Dotenv
    this.pgClient = new Client({
      connectionString: process.env.DATABASE_URL
    });
    await this.pgClient.connect();
    await this.pgClient.query('LISTEN new_job_queued');
    
    this.pgClient.on('notification', (msg) => {
      if (msg.channel === 'new_job_queued') {
        this.wakeUpPolling();
      }
    });
    this.logger.log('PostgreSQL LISTEN connected for Event-Driven execution');
  }

  wakeUpPolling() {
    if (this.sleepResolve) {
      this.sleepResolve(true);
      this.sleepResolve = null;
    }
  }

  async onModuleDestroy() {
    this.isRunning = false;
    this.wakeUpPolling();
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pgClient) await this.pgClient.end();
    
    while (this.activeJobs > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await this.prisma.worker.update({
      where: { id: this.workerId },
      data: { status: 'STOPPED' }
    });
    this.logger.log(`Worker ${this.workerId} stopped gracefully`);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.prisma.$transaction([
          this.prisma.worker.update({
            where: { id: this.workerId },
            data: { last_heartbeat_at: new Date() }
          }),
          this.prisma.workerHeartbeat.create({
            data: {
              worker_id: this.workerId,
              current_load: this.activeJobs,
              cpu_percent: null // Could be populated via 'os' module
            }
          })
        ]);
      } catch (e) {
        this.logger.error('Failed to send heartbeat', e);
      }
    }, 5000);
  }

  private async pollJobs() {
    while (this.isRunning) {
      if (this.activeJobs >= this.maxConcurrency) {
        await new Promise(resolve => { this.sleepResolve = resolve; setTimeout(resolve, 1000); });
        continue;
      }

      try {
        const jobs = await this.claimJobs(this.maxConcurrency - this.activeJobs);
        if (jobs.length > 0) {
          jobs.forEach(job => {
            this.eventsGateway.broadcastJobUpdate(job);
            this.executeJob(job);
          });
        } else {
          // Sleep until woken up by NOTIFY or timeout (Event-Driven)
          await new Promise(resolve => { this.sleepResolve = resolve; setTimeout(resolve, 5000); });
        }
      } catch (error) {
        this.logger.error('Error polling jobs', error);
        await new Promise(resolve => { this.sleepResolve = resolve; setTimeout(resolve, 5000); });
      }
    }
  }

  private async claimJobs(limit: number): Promise<(Job & { queue: any })[]> {
    return this.prisma.$transaction(async (tx) => {
      // Logical Sharding: worker only claims from its assigned shard
      const candidates = await tx.$queryRaw<Job[]>`
        SELECT j.id
        FROM "Job" j
        JOIN "Queue" q ON q.id = j.queue_id
        WHERE j.status = 'QUEUED'
          AND q.paused = false
          AND j.shard_id = ${this.assignedShardId}
          AND j.run_at <= NOW()
        ORDER BY j.priority DESC, j.run_at ASC, j.created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (candidates.length === 0) return [];

      const ids = candidates.map(c => c.id);

      await tx.$queryRaw`
        UPDATE "Job"
        SET status = 'CLAIMED',
            locked_by = ${this.workerId}::uuid,
            locked_at = NOW()
        WHERE id IN (${ids.join(',')})
      `;

      return tx.job.findMany({
        where: { id: { in: ids } },
        include: { queue: true } 
      });
    });
  }

  private async executeJob(job: Job & { queue: any }) {
    this.activeJobs++;
    
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'RUNNING' }
    });
    this.eventsGateway.broadcastJobUpdate({ ...job, status: 'RUNNING' });

    const execution = await this.prisma.jobExecution.create({
      data: {
        job_id: job.id,
        worker_id: this.workerId,
        attempt_number: job.attempts + 1,
        status: 'RUNNING'
      }
    });

    await this.prisma.jobLog.create({
      data: { job_id: job.id, message: `Worker ${this.workerId} started execution attempt ${job.attempts + 1}` }
    });

    const startTime = Date.now();

    try {
      this.logger.log(`Executing job ${job.id} (type: ${job.type})`);
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
      
      if (Math.random() < 0.1) throw new Error('Simulated random failure');

      const duration = Date.now() - startTime;

      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', completed_at: new Date() }
        }),
        this.prisma.jobExecution.update({
          where: { id: execution.id },
          data: { status: 'COMPLETED', finished_at: new Date(), duration_ms: duration }
        }),
        this.prisma.jobLog.create({
          data: { job_id: job.id, message: `Execution completed successfully in ${duration}ms` }
        })
      ]);
      
      this.eventsGateway.broadcastJobUpdate({ ...job, status: 'COMPLETED' });
      this.logger.log(`Job ${job.id} completed successfully`);

      // WORKFLOW DEPENDENCIES: Unblock dependents
      await this.unblockDependents(job.id);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      await this.handleJobFailure(job, execution.id, error.message, duration);
    } finally {
      this.activeJobs--;
      this.wakeUpPolling(); // Free slot, try polling again
    }
  }

  private async unblockDependents(jobId: string) {
    const dependents = await this.prisma.jobDependency.findMany({
      where: { parent_job_id: jobId },
      include: { dependent: true }
    });

    for (const dep of dependents) {
      const uncompletedParents = await this.prisma.jobDependency.count({
        where: {
          dependent_job_id: dep.dependent_job_id,
          parent: { status: { not: 'COMPLETED' } }
        }
      });

      if (uncompletedParents === 0 && dep.dependent.status === 'BLOCKED') {
        await this.prisma.job.update({
          where: { id: dep.dependent_job_id },
          data: { status: 'QUEUED' }
        });
        this.eventsGateway.broadcastJobUpdate({ id: dep.dependent_job_id, status: 'QUEUED' });
        
        // Emit NOTIFY to wake up workers immediately
        if (this.pgClient) {
          await this.pgClient.query('NOTIFY new_job_queued');
        }
        this.logger.log(`Job ${dep.dependent_job_id} unblocked!`);
      }
    }
  }

  private async handleJobFailure(job: Job & { queue: any }, executionId: string, errorMessage: string, duration: number) {
    this.logger.warn(`Job ${job.id} failed: ${errorMessage}`);
    
    const attempts = job.attempts + 1;
    
    await this.prisma.jobExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', finished_at: new Date(), duration_ms: duration, error_message: errorMessage }
    });

    await this.prisma.jobLog.create({
      data: { job_id: job.id, message: `Execution failed: ${errorMessage}` }
    });

    if (attempts >= job.max_attempts) {
      // AI SUMMARY
      const aiSummary = await this.aiService.generateFailureSummary(errorMessage);

      await this.prisma.$transaction([
        this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'DEAD_LETTERED', attempts, locked_by: null, locked_at: null }
        }),
        this.prisma.deadLetterQueue.create({
          data: {
            queue_id: job.queue_id,
            job_id: job.id,
            payload: job.payload || {},
            error_reason: errorMessage,
            ai_summary: aiSummary
          }
        }),
        this.prisma.jobLog.create({
          data: { job_id: job.id, message: `Max attempts reached. AI Summary: ${aiSummary}` }
        })
      ]);
      this.eventsGateway.broadcastJobUpdate({ ...job, status: 'DEAD_LETTERED' });
      this.logger.error(`Job ${job.id} dead-lettered with AI Summary`);
    } else {
      let delayMs = 5000;
      
      if (job.queue?.retry_policy_id) {
        const policy = await this.prisma.retryPolicy.findUnique({ where: { id: job.queue.retry_policy_id }});
        if (policy) {
          if (policy.strategy === 'FIXED') delayMs = policy.base_delay_ms;
          if (policy.strategy === 'LINEAR') delayMs = policy.base_delay_ms * attempts;
          if (policy.strategy === 'EXPONENTIAL') delayMs = policy.base_delay_ms * Math.pow(2, attempts - 1);
          if (delayMs > policy.max_delay_ms) delayMs = policy.max_delay_ms;
        }
      } else {
        delayMs = 5000 * Math.pow(2, attempts - 1);
      }

      const nextRun = new Date(Date.now() + delayMs);

      await this.prisma.job.update({
        where: { id: job.id },
        data: { 
          status: 'RETRY_SCHEDULED',
          attempts,
          run_at: nextRun,
          locked_by: null,
          locked_at: null
        }
      });
      this.eventsGateway.broadcastJobUpdate({ ...job, status: 'RETRY_SCHEDULED' });
      this.logger.log(`Job ${job.id} scheduled for retry at ${nextRun.toISOString()}`);
    }
  }
}
