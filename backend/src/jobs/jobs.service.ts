import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async create(createJobDto: CreateJobDto) {
    const hasDependencies = createJobDto.dependencies && createJobDto.dependencies.length > 0;
    let initialStatus = 'QUEUED';
    
    if (hasDependencies) {
      initialStatus = 'BLOCKED';
    } else if (createJobDto.run_at) {
      initialStatus = 'SCHEDULED';
    }

    const job = await this.prisma.job.create({
      data: {
        queue_id: createJobDto.queue_id,
        type: createJobDto.type,
        status: initialStatus,
        payload: createJobDto.payload,
        priority: createJobDto.priority || 0,
        run_at: createJobDto.run_at ? new Date(createJobDto.run_at) : new Date(),
        ...(hasDependencies && {
          dependencies: {
            create: createJobDto.dependencies!.map(parentId => ({ parent_job_id: parentId }))
          }
        })
      },
    });

    if (job.status === 'QUEUED') {
      await this.prisma.$executeRawUnsafe('NOTIFY new_job_queued');
    }

    return job;
  }

  async createBatch(createJobDtos: CreateJobDto[]) {
    const result = await this.prisma.job.createMany({
      data: createJobDtos.map(dto => ({
        queue_id: dto.queue_id,
        type: dto.type,
        status: dto.run_at ? 'SCHEDULED' : 'QUEUED',
        payload: dto.payload,
        priority: dto.priority || 0,
        run_at: dto.run_at ? new Date(dto.run_at) : new Date(),
      }))
    });

    if (createJobDtos.some(dto => !dto.run_at)) {
      await this.prisma.$executeRawUnsafe('NOTIFY new_job_queued');
    }

    return result;
  }

  async createRecurring(dto: { queue_id: string, type: string, payload: any, cron_expression: string }) {
    return this.prisma.scheduledJob.create({
      data: {
        queue_id: dto.queue_id,
        type: dto.type,
        payload: dto.payload,
        cron_expression: dto.cron_expression,
      }
    });
  }

  async findAll(queueId: string, page: number = 1, limit: number = 50, status?: string) {
    const whereCondition: any = { queue_id: queueId };
    if (status) {
      whereCondition.status = status;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where: whereCondition,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.job.count({ where: whereCondition })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { executions: true, logs: true }
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async retry(id: string) {
    const job = await this.findOne(id);
    if (job.status !== 'DEAD_LETTERED' && job.status !== 'FAILED' && job.status !== 'COMPLETED') {
       throw new Error('Can only manually retry failed, dead-lettered, or completed jobs');
    }

    return this.prisma.job.update({
      where: { id },
      data: {
        status: 'QUEUED',
        attempts: 0, // Reset attempts for a fresh manual retry
        run_at: new Date(),
        locked_by: null,
        locked_at: null,
      }
    });
  }
}
