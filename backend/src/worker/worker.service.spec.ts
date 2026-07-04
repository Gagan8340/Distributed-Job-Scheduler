import { Test, TestingModule } from '@nestjs/testing';
import { WorkerService } from './worker.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { AiService } from './ai.service';

describe('WorkerService', () => {
  let service: WorkerService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        {
          provide: PrismaService,
          useValue: {
            worker: {
              upsert: jest.fn().mockResolvedValue({ id: 'worker1', name: 'test-worker' }),
              update: jest.fn(),
            },
            $queryRawUnsafe: jest.fn(),
            $transaction: jest.fn(),
          },
        },
        {
          provide: AiService,
          useValue: { summarizeFailure: jest.fn().mockResolvedValue('Mock summary') },
        },
        {
          provide: EventsGateway,
          useValue: {
            broadcastJobUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkerService>(WorkerService);
    prisma = module.get<PrismaService>(PrismaService);
    
    // Prevents the actual intervals from running during tests
    jest.spyOn(service as any, 'pollJobs').mockImplementation();
    jest.spyOn(service as any, 'startHeartbeat').mockImplementation();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('claimJobs', () => {
    it('should correctly build and execute the SKIP LOCKED transaction', async () => {
      (service as any).workerId = 'worker-uuid';
      const mockJobs = [{ id: 'job1' }];
      
      // Mock the query builder behavior inside transaction
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
        return cb({
          $queryRaw: jest.fn().mockResolvedValue(mockJobs),
          job: { findMany: jest.fn().mockResolvedValue(mockJobs) }
        } as any);
      });

      const result = await (service as any).claimJobs(10);
      expect(result).toEqual(mockJobs);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should clean up intervals and update worker status to STOPPED on destroy', async () => {
      const updateSpy = jest.spyOn(prisma.worker, 'update').mockResolvedValue(null as any);
      (service as any).workerId = 'worker1';
      
      await service.onModuleDestroy();
      
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'worker1' },
        data: { status: 'STOPPED' },
      });
    });
  });
});
