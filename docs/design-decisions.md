# Design Decisions and Major Trade-offs

This document explicitly details the major architectural trade-offs made during the engineering of the Distributed Job Scheduler MVP. 

## Trade-off 1: PostgreSQL vs. Redis for the Queue Engine
**Decision**: PostgreSQL was selected as the unified datastore and queue engine using the `FOR UPDATE SKIP LOCKED` query.
- **The Trade-off**: Redis natively operates in RAM and can pop queue items in sub-millisecond latencies, whereas PostgreSQL requires disk I/O and slightly higher CPU overhead to scan row indexes.
- **The Justification**: By choosing PostgreSQL, we eliminated the operational complexity of maintaining a secondary database. Furthermore, PostgreSQL provides strict ACID guarantees—we never have to worry about data loss during a Redis eviction or a split-brain failover scenario. `SKIP LOCKED` flawlessly solves concurrent worker deadlocks, making Postgres highly suitable for queues processing up to tens of thousands of jobs per second.

## Trade-off 2: Polling vs. Event-Driven Push (WebSockets/PubSub)
**Decision**: The Worker engine uses interval-based polling (`setInterval` running a `SELECT` query every 2 seconds).
- **The Trade-off**: Polling wastes minor CPU cycles on empty queues and inherently introduces up to a 2-second latency between job enqueueing and execution. A push-based system (like RabbitMQ) has zero polling overhead and instant delivery.
- **The Justification**: Polling is vastly simpler to implement and infinitely easier to reason about in crash-recovery scenarios. If a worker hard-crashes in an event-driven model, complex redelivery and manual ACKs are required. In our polling model, if a worker crashes, its heartbeat times out, its lock drops, and the next standard polling cycle safely re-claims the job. 

## Trade-off 3: Monolithic Deployment vs. Microservices
**Decision**: The system is built as a single NestJS application containing both the REST APIs and the Worker/Scheduler loops.
- **The Trade-off**: Scaling the API servers inherently scales the worker processes, which wastes resources if your API traffic is high but job throughput is low, and vice-versa.
- **The Justification**: A modular monolith significantly accelerates development speed, simplifies CI/CD pipelines, and eliminates complex inter-service HTTP latency. Because the NestJS modules (`ApiModule` and `WorkerModule`) are logically decoupled inside the code, we retain the option to deploy them as separate Docker containers in the future by simply swapping the bootstrap script, securing both simplicity now and scalability later.

## Trade-off 4: Exactly-Once Claiming vs. Exactly-Once Execution
**Decision**: The architecture guarantees exactly-once *claiming*, but offloads exactly-once *execution* to the developer.
- **The Trade-off**: The system will not automatically roll back third-party API calls (e.g., charging a credit card via Stripe) if the worker crashes post-API call but pre-database commit.
- **The Justification**: Distributed transactions (Two-Phase Commit) are notoriously slow and brittle. Instead, we mandate **Idempotency** at the payload layer. Workers must be designed to pass idempotency tokens to downstream systems so that if the Job Scheduler re-executes a failed job, duplicate side-effects are natively rejected by the target API.

## Trade-off 5: Hybrid Heartbeat Storage
**Decision**: Heartbeats update an in-place `last_heartbeat_at` timestamp on the `Worker` table, while simultaneously appending to a `WorkerHeartbeat` log table.
- **The Trade-off**: Adding a secondary insert to an append-only log table marginally increases I/O load per heartbeat tick compared to just an in-place update.
- **The Justification**: The assignment requires tracking "Worker Heartbeats" as a historical entity for auditing and metric tracking (e.g. CPU/load over time). By keeping the `last_heartbeat_at` field directly on the `Worker` row, the cluster manager's crash-detection query remains an extremely fast single-table scan, entirely unaffected by the growing size of the historical `WorkerHeartbeat` table.
