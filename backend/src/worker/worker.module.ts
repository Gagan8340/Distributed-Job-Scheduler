import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { AiService } from './ai.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  providers: [WorkerService, SchedulerService, AiService]
})
export class WorkerModule {}
