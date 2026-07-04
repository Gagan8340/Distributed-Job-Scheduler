import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
const cronParser = require('cron-parser');

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.isRunning = true;
    this.startScheduler();
  }

  async onModuleDestroy() {
    this.isRunning = false;
    if (this.interval) clearInterval(this.interval);
  }

  private startScheduler() {
    // Run every minute
    this.interval = setInterval(async () => {
      try {
        await this.processScheduledJobs();
      } catch (e) {
        this.logger.error('Error in scheduler loop', e);
      }
    }, 60000);
    // Also run immediately on startup
    this.processScheduledJobs();
  }

  private async processScheduledJobs() {
    if (!this.isRunning) return;

    this.logger.log('Scanning for due scheduled jobs...');
    const scheduledJobs = await this.prisma.scheduledJob.findMany();

    const now = new Date();

    for (const job of scheduledJobs) {
      try {
        const interval = cronParser.parseExpression(job.cron_expression);
        const prevRun = interval.prev();

        // If the cron was supposed to run in the last minute
        const oneMinuteAgo = new Date(now.getTime() - 60000);
        
        if (prevRun.toDate() >= oneMinuteAgo && prevRun.toDate() <= now) {
          // Enqueue job
          await this.prisma.job.create({
            data: {
              queue_id: job.queue_id,
              type: job.type,
              status: 'QUEUED',
              payload: job.payload || {},
              priority: 0,
            }
          });
          this.logger.log(`Enqueued scheduled job ${job.id}`);
        }
      } catch (err: any) {
        this.logger.error(`Failed to parse cron for job ${job.id}: ${err.message}`);
      }
    }
  }
}
