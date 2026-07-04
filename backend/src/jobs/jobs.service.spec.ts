import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: PrismaService,
          useValue: {
            job: {
              create: jest.fn(),
              createMany: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            $executeRawUnsafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should successfully create a single job', async () => {
      const mockDto = { queue_id: 'q1', type: 'email', payload: { to: 'test@test.com' } };
      const mockResult = { id: 'job1', status: 'QUEUED', ...mockDto };
      
      jest.spyOn(prisma.job, 'create').mockResolvedValue(mockResult as any);

      const result = await service.create(mockDto);
      expect(result).toEqual(mockResult);
      expect(prisma.job.create).toHaveBeenCalledWith({
        data: {
          queue_id: mockDto.queue_id,
          type: mockDto.type,
          payload: mockDto.payload,
          status: 'QUEUED',
          priority: 0,
          run_at: expect.any(Date),
        },
      });
    });

    it('should correctly schedule a delayed job', async () => {
      const runAt = new Date(Date.now() + 10000).toISOString();
      const mockDto = { queue_id: 'q1', type: 'email', payload: {}, run_at: runAt };
      const mockResult = { id: 'job1', status: 'SCHEDULED', ...mockDto };
      
      jest.spyOn(prisma.job, 'create').mockResolvedValue(mockResult as any);

      const result = await service.create(mockDto as any);
      expect(result.status).toEqual('SCHEDULED');
    });
  });

  describe('createBatch', () => {
    it('should insert multiple jobs utilizing createMany', async () => {
      const mockDtos = [
        { queue_id: 'q1', type: 'email', payload: { id: 1 } },
        { queue_id: 'q1', type: 'email', payload: { id: 2 } }
      ];
      jest.spyOn(prisma.job, 'createMany').mockResolvedValue({ count: 2 } as any);

      const result = await service.createBatch(mockDtos as any);
      expect(result).toEqual({ count: 2 });
      expect(prisma.job.createMany).toHaveBeenCalled();
    });
  });
});
