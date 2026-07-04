import { IsString, IsNotEmpty, IsUUID, IsOptional, IsInt, IsBoolean } from 'class-validator';

export class CreateQueueDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  concurrency_limit?: number;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}
