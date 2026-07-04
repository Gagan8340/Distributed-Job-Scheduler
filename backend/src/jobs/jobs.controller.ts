import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto, CreateRecurringJobDto } from './dto/create-job.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Body() createJobDto: CreateJobDto) {
    return this.jobsService.create(createJobDto);
  }

  @Post('batch')
  createBatch(@Body() createJobDtos: CreateJobDto[]) {
    return this.jobsService.createBatch(createJobDtos);
  }

  @Post('recurring')
  createRecurring(@Body() createRecurringDto: CreateRecurringJobDto) {
    return this.jobsService.createRecurring(createRecurringDto);
  }

  @Get()
  findAll(
    @Query('queue_id') queueId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.jobsService.findAll(
      queueId, 
      page ? parseInt(page, 10) : 1, 
      limit ? parseInt(limit, 10) : 50,
      status
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.jobsService.retry(id);
  }
}
