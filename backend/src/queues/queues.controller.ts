import { Controller, Get, Post, Body, Param, UseGuards, Query, Patch } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard)
@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Post()
  create(@Body() createQueueDto: CreateQueueDto) {
    return this.queuesService.create(createQueueDto);
  }

  @Get()
  findAll(@Query('project_id') projectId: string) {
    return this.queuesService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.queuesService.findOne(id);
  }

  @Post(':id/pause')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  pause(@Param('id') id: string) {
    return this.queuesService.pause(id);
  }

  @Post(':id/resume')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  resume(@Param('id') id: string) {
    return this.queuesService.resume(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.queuesService.getStats(id);
  }
}
