# Architecture Document: Distributed Job Scheduler

## 1. High-Level System Architecture

The system is designed as a modular, monolithic repository utilizing NestJS for the backend, React for the control plane, and PostgreSQL as the unified datastore and locking engine. The architecture ensures high throughput, strict referential integrity, and horizontal scalability of worker nodes.

```mermaid
graph TD
    Client[React SPA Dashboard] -->|HTTP REST / JWT| APIGateway
    Client -->|WebSocket| WSGateway[WebSocket Gateway]

    subgraph Backend Services [NestJS Monolith]
        APIGateway(API Controller Layer)
        AuthService(Auth & RBAC Service)
        QueueService(Queue Management)
        JobService(Job Dispatcher)
        Scheduler(Cron Scheduler Engine)
        WSGateway
    end

    APIGateway --> AuthService
    APIGateway --> QueueService
    APIGateway --> JobService

    subgraph Data Layer [PostgreSQL]
        DB[(Primary DB Instance)]
        DB -.-> |FOR UPDATE SKIP LOCKED| Index[Job Polling Index]
    end

    QueueService -->|Prisma ORM| DB
    JobService -->|Prisma ORM| DB
    Scheduler -->|Scan & Enqueue| DB

    subgraph Worker Fleet
        Worker1(Worker Node 1)
        Worker2(Worker Node N)
    end

    Worker1 -->|Polls Queue| Index
    Worker2 -->|Polls Queue| Index
    
    Worker1 -.->|Emits Event| WSGateway
    Worker2 -.->|Emits Event| WSGateway
```

## 2. Job Lifecycle State Machine

To guarantee exactly-once claiming and safe retry semantics, jobs transition through a strict state machine validated at the database level.

```mermaid
stateDiagram-v2
    [*] --> QUEUED : Immediate Job Created
    [*] --> SCHEDULED : Delayed/Cron Job Created
    
    SCHEDULED --> QUEUED : Scheduler Time Matched
    QUEUED --> RUNNING : Worker Claims (SKIP LOCKED)
    
    RUNNING --> COMPLETED : Execution Success
    RUNNING --> FAILED : Execution Throws Error
    
    FAILED --> QUEUED : Retry Strategy Active (Backoff)
    FAILED --> DEAD_LETTERED : Max Attempts Reached
    
    DEAD_LETTERED --> QUEUED : Manual Admin Retry
    
    COMPLETED --> [*]
    DEAD_LETTERED --> [*]
```

## 3. Core Component Breakdown

### API Server (Controllers)
Exposes the RESTful endpoints. It is protected globally by `@nestjs/throttler` (Rate Limiting) and uses Passport-JWT alongside a custom `RolesGuard` for Role-Based Access Control (RBAC). It ensures that HTTP traffic is physically separated from worker execution loops to prevent event-loop blocking.

### Worker Engine (`WorkerService`)
The beating heart of the scheduler. It runs an asynchronous `setInterval` loop that executes raw SQL:
`SELECT id FROM "Job" WHERE status = 'QUEUED' AND run_at <= NOW() ORDER BY priority DESC LIMIT $1 FOR UPDATE SKIP LOCKED`
This query safely claims jobs without deadlocking concurrent workers. The worker updates the `JobExecution` table with start times, executes the payload (which must be designed idempotently), and records the final result (success/fail) to the `JobLog` table.

### Scheduler Engine (`SchedulerService`)
Handles recurring Cron jobs and delayed jobs. It utilizes `cron-parser` to continuously evaluate the `ScheduledJob` table, dynamically injecting new job records into the main `Job` table when the cron interval triggers.

### WebSocket Gateway (`EventsGateway`)
Forwards real-time execution events (e.g., job completions, job failures, worker heartbeats) back to the React Dashboard. This allows the UI to stay perfectly synchronized with the database state without expensive HTTP polling.

## 4. Scaling Characteristics
While the current MVP operates on a single PostgreSQL instance (which can easily handle thousands of jobs per second with the optimized `@@index([queue_id, status, run_at, priority])`), the architecture is entirely stateless at the application layer. You can instantly spin up 100 `WorkerService` instances across a Kubernetes cluster, and they will safely share the queue load due to the atomic `SKIP LOCKED` database design.
