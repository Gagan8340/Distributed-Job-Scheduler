# Distributed Job Scheduler 

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)

A highly reliable, horizontally scalable, and atomic distributed job scheduling platform. Designed as a production-grade backend system with a real-time glassmorphism React dashboard.

This system guarantees **exactly-once execution semantics** across multiple distributed workers using raw SQL transaction locking (`FOR UPDATE SKIP LOCKED`).

---

##  Core Features

*   **Atomic Concurrency:** Workers claim jobs atomically. No race conditions, no deadlocks, and no duplicate executionseven if 100 workers poll simultaneously.
*   **Event-Driven Execution:** Workers utilize PostgreSQL `LISTEN/NOTIFY` pub/sub to instantly wake up when new jobs arrive, eliminating wasteful CPU polling loops.
*   **Robust Job Lifecycle:** Supports jobs transitioning smoothly through: `Queued`  `Scheduled`  `Claimed`  `Running`  `Completed` / `Failed`.
*   **Retry & Dead Letter Queue (DLQ):** Dynamic retry policies (Fixed Delay, Linear Backoff, Exponential Backoff) with permanent failures routed to a DLQ for auditing.
*   **Workflow Dependencies (DAGs):** Jobs can depend on parent jobs, remaining in a `BLOCKED` state until their prerequisites complete successfully.
*   **Real-Time Control Plane:** A React SPA connected via WebSockets (`socket.io`) that provides live updates on queue depth, worker heartbeats, and job logs.
*   **Multi-Tenant Architecture:** Full RBAC and JWT Authentication. Jobs belong to Queues, Queues belong to Projects, and Projects belong to Organizations.

---

## ️ Architecture & Database Design

The system relies on PostgreSQL as its unified datastore and locking engine. By using `SKIP LOCKED`, we bypass the need for an external Redis queue, reducing infrastructure complexity while maintaining strict ACID guarantees.

For deep dives into the architecture, ER diagrams, and design trade-offs, please read the documentation in the `/docs` directory:
*   [Architecture Overview](docs/architecture.md)
*   [Database Design & ER Diagram](docs/database-design.md)
*   [Concurrency & Design Decisions](docs/design-decisions.md)

---

##  Getting Started

### Prerequisites
*   **Node.js** (v18+)
*   **Docker** (for running the PostgreSQL instance)

### 1. Database Setup
Start the PostgreSQL database via Docker Compose:
```bash
docker-compose up -d
```
*(Runs on `localhost:5432` | user: `postgres` | password: `password`)*

### 2. Backend Setup
The backend is a modular NestJS monolith.
```bash
cd backend
npm install

# Push the schema to the database and generate Prisma client
npx prisma db push
npx prisma generate

# Start the REST API and background Worker processes
npm run start:dev
```
*The API will be available at `http://localhost:3000`.*

### 3. Frontend Dashboard Setup
The frontend is a Vite + React SPA.
```bash
cd frontend
npm install

# Start the development server
npm run dev
```
*The Dashboard will be available at `http://localhost:5173`.*

---

##  Testing

The backend includes an automated test suite verifying the core worker logic (atomic claims, transaction rollbacks, graceful shutdown).
```bash
cd backend
npm run test
```

---

##  API Endpoints

The REST API is highly structured and protected by JWT authentication and rate limiting (`@nestjs/throttler`).

**Authentication**
*   `POST /auth/register` - Create a new user account
*   `POST /auth/login` - Authenticate and retrieve JWT
*   `GET /auth/me` - Get current user profile

**Queues & Jobs**
*   `GET /queues` - List all queues for a project
*   `POST /queues` - Create a new queue
*   `POST /queues/:id/pause` - Pause job processing for a queue
*   `POST /queues/:id/resume` - Resume job processing
*   `POST /jobs` - Dispatch a single job
*   `POST /jobs/batch` - Dispatch multiple jobs in a single transaction
*   `POST /jobs/:id/retry` - Manually requeue a dead-lettered job

**Workers**
*   `GET /workers` - List all active worker nodes and their last heartbeats
