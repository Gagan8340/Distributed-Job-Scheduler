import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQueueDto } from './dto/create-queue.dto';

@Injectable()
export class QueuesService {
  constructor(private prisma: PrismaService) {}

  async create(createQueueDto: CreateQueueDto) {
    const assignedShardId = Math.floor(Math.random() * 4) + 1; // Logical sharding across 4 shards
    return this.prisma.queue.create({
      data: {
        name: createQueueDto.name,
        project_id: createQueueDto.project_id,
        priority: createQueueDto.priority || 0,
        concurrency_limit: createQueueDto.concurrency_limit || 10,
        paused: createQueueDto.paused || false,
        shard_id: assignedShardId,
      },
    });
  }

  async findAll(projectId: string) {
    return this.prisma.queue.findMany({
      where: { project_id: projectId }
    });
  }

  async findOne(id: string) {
    const queue = await this.prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundException('Queue not found');
    return queue;
  }

  async pause(id: string) {
    return this.prisma.queue.update({
      where: { id },
      data: { paused: true }
    });
  }

  async resume(id: string) {
    return this.prisma.queue.update({
      where: { id },
      data: { paused: false }
    });
  }

  async getStats(id: string) {
    const stats = await this.prisma.job.groupBy({
      by: ['status'],
      where: { queue_id: id },
      _count: {
        _all: true,
      },
    });

    const formattedStats = stats.reduce((acc, curr) => {
      acc[curr.status] = curr._count._all;
      return acc;
    }, {} as Record<string, number>);

    return formattedStats;
  }
}
