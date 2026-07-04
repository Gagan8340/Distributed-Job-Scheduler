import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Request() req: any, @Body() createOrganizationDto: CreateOrganizationDto) {
    return this.organizationsService.create(req.user.id, createOrganizationDto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.organizationsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.organizationsService.findOne(req.user.id, id);
  }
}
