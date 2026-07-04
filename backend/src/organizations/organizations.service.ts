import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createOrganizationDto: CreateOrganizationDto) {
    return this.prisma.organization.create({
      data: {
        name: createOrganizationDto.name,
        members: {
          create: {
            user_id: userId,
          }
        }
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.organization.findMany({
      where: {
        members: {
          some: { user_id: userId }
        }
      }
    });
  }

  async findOne(userId: string, id: string) {
    const org = await this.prisma.organization.findFirst({
      where: {
        id,
        members: { some: { user_id: userId } }
      }
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }
}
