import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Database Seed for Demo User, Project, Queue, and Jobs
  const prisma = app.get(PrismaService);
  let org = await prisma.organization.findFirst({ where: { name: 'Demo Organization' } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: 'Demo Organization' } });
  }

  const project = await prisma.project.findFirst({ where: { name: 'Demo Project' } });
  let projectId;
  if (!project) {
    const newProj = await prisma.project.create({
      data: { name: 'Demo Project', organization_id: org.id }
    });
    projectId = newProj.id;
    
    // Seed a queue
    const queue = await prisma.queue.create({
      data: { name: 'default-queue', project_id: projectId }
    });

    // Seed some jobs so Job Explorer isn't empty
    await prisma.job.createMany({
      data: [
        { queue_id: queue.id, type: 'email_dispatch', payload: { to: 'user@test.com' }, status: 'COMPLETED' },
        { queue_id: queue.id, type: 'data_sync', payload: { source: 'salesforce' }, status: 'FAILED', attempts: 3, max_attempts: 3 }
      ]
    });
  }

  const config = new DocumentBuilder()
    .setTitle('Distributed Job Scheduler API')
    .setDescription('API documentation for the job scheduler control plane')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
