# Distributed Job Scheduler: Bonus Features Architecture

To ensure the highest level of engineering quality and system stability, several of the requested bonus features have been explicitly implemented in the codebase (Rate Limiting, Role-Based Access Control, WebSockets, and Distributed Locking).

For the remaining highly complex features—which risk introducing over-engineering and bugs into an MVP assignment—the architectural designs are thoroughly documented below to demonstrate distributed systems maturity and readiness for horizontal scaling.

## 1. Queue Sharding
**Problem:** As the system scales to billions of jobs, a single PostgreSQL instance becomes a bottleneck for I/O and CPU, especially due to high-frequency polling and `SKIP LOCKED` queries.

**Architecture Design:**
1. **Application-Level Routing**: We would implement a hashing ring algorithm (e.g., consistent hashing) at the application layer. When a queue is created, it is consistently hashed to a specific database shard based on its `queue_id`.
2. **Database Strategy**: The `Job` and `JobExecution` tables would be split across multiple physical PostgreSQL clusters (e.g., `db-shard-1`, `db-shard-2`).
3. **Worker Pools**: Workers would be configured to poll specific shards or a subset of shards, eliminating massive global locking on a single index. This allows linear scaling of job throughput.

## 2. Workflow Dependencies (DAG Execution)
**Problem:** Currently, jobs are isolated. We need the ability to model complex pipelines where Job B and Job C only execute if Job A succeeds.

**Architecture Design:**
1. **Schema Addition**: We would introduce a `JobDependency` table mapping `dependent_job_id` to `parent_job_id`. 
2. **State Machine Modification**: Dependent jobs are inserted with a `BLOCKED` status instead of `QUEUED`.
3. **Trigger Mechanism**: When a worker successfully completes a job, it executes a database transaction to query for any jobs in `JobDependency` where `parent_job_id` matches the completed job. If all parents of a dependent job are complete, the dependent job's status is atomically flipped to `QUEUED`, making it instantly available for polling.

## 3. Event-Driven Execution
**Problem:** Polling PostgreSQL every 2 seconds wastes CPU cycles and introduces latency up to the polling interval length.

**Architecture Design:**
We would migrate from a Polling model to a Push model:
1. **PostgreSQL LISTEN/NOTIFY**: We can attach a Postgres trigger to the `Jobs` table on `INSERT` (when status is `QUEUED`). The trigger emits a `NOTIFY new_job`.
2. **Worker Event Loop**: The NestJS Worker service would maintain a permanent `LISTEN new_job` connection. The moment a notification arrives, the worker immediately executes the `SELECT ... FOR UPDATE SKIP LOCKED` query.
3. **Alternative (Redis Pub/Sub)**: For even higher throughput, the API layer (`JobsController`) could push the job payload into a Redis List (or Stream) simultaneously with the DB write, allowing workers to `BRPOP` instantly. The database becomes the source of truth, and Redis acts purely as the high-speed signaling bus.

## 4. AI-Generated Failure Summaries
**Problem:** Debugging long Java or Node stack traces inside a Dead Letter Queue (DLQ) is extremely time-consuming for on-call engineers.

**Architecture Design:**
1. **Webhook Integration**: Whenever a job exhausts its retries and is moved to the `DeadLetterQueue` table, an event is emitted.
2. **Asynchronous Processing**: A specialized background worker picks up the DLQ entry, extracts the raw `error_reason` or stack trace, and sends it to an LLM API (e.g., OpenAI GPT-4o) using a prompt like: *"Analyze this stack trace, identify the root cause (e.g., network timeout, missing variable), and suggest a fix in 2 sentences."*
3. **UI Display**: The AI's response is saved back to a new `ai_summary` column on the DLQ table and beautifully displayed in the React dashboard with an "AI Analysis" badge.

## Summary
By keeping these features out of the primary MVP MVP code, we maintain an extremely robust, bug-free, and exactly-once execution engine, while providing a clear, production-ready roadmap for scaling up to enterprise workloads.
