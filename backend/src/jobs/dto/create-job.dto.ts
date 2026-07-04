import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, IsDateString, IsObject } from 'class-validator';

export class CreateJobDto {
  @IsUUID()
  queue_id!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  payload!: Record<string, any>;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsDateString()
  run_at?: string;

  @IsOptional()
  @IsUUID('all', { each: true })
  dependencies?: string[];
}

export class CreateRecurringJobDto {
  @IsUUID()
  queue_id!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  payload!: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  cron_expression!: string;
}
