import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUUID()
  organization_id!: string;
}
