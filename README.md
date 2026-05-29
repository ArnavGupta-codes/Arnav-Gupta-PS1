# FocusFlow

**Project URL (live / deployed)**: [https://arnav-gupta-ps-1.vercel.app/](https://arnav-gupta-ps-1.vercel.app/)

## Project Description

**FocusFlow** is a modern, responsive team task manager featuring an AI-powered Standup Assistant. Designed to streamline collaboration and project tracking, FocusFlow enables teams to organize tasks through an intuitive Kanban board, manage workspaces and user roles (Admins and Employees), and automatically generate daily team standup updates using AI based on real-time task data.

## Features

- **Organization Roles & Workspaces**: Create an organization as an **Admin**, or join an existing one as an **Employee**. Admins have exclusive rights to approve or reject join requests.
- **Task Board**: Kanban board (Todo, In Progress, Done) with full CRUD — create, drag-and-drop between columns, and delete tasks.
- **Team-wide AI Standup**: Generates realistic, professional standup updates for **all approved members** in an organization based on actual task data, displayed seamlessly on the portal.
- **User Authentication**: Secure registration and login with PBKDF2-SHA512 password hashing using unique salts per user.
- **Dark / Light Mode**: Full theme toggle across all screens with clean, modern SVG icons (powered by Lucide React).
- **Database Persistence**: All data (users, organizations, roles, tasks) is stored in SQLite — survives server restarts without data loss.

### Highlighted Technical Features (Evaluator Notes)

-  **Multi-Tenant Organization Flow**: 
  - Organizations are tied to an Admin.
  - Employees must submit a join request.
  - Custom UI handles "Pending Approval" polling and an Admin "Manage Members" modal.
-  **Secure Password Hashing**: Uses Python's native `hashlib.pbkdf2_hmac` with SHA-512 and unique random salts per user. No deprecated third-party libraries — 100,000 iterations for brute-force resistance.
-  **Advanced Rate Limiting**: Employs `slowapi` to enforce token-bucket rate limits per client IP:
  - `GET /api/tasks`: 20 requests per minute limit.
  - `POST /api/tasks`: 10 requests per minute limit.
  - `POST /api/standup`: 5 requests per minute limit.
  - Prevents DDoS, brute-forcing, and controls downstream LLM token usage costs.
-  **SQLite Relational Persistence**: Utilizes a relational schema (`users`, `organizations`, `org_members`, `tasks`) to strictly enforce access controls and data isolation.
-  **Context-Aware Team AI Standup**: The standup generator dynamically aggregates tasks for every approved employee in an organization, categorized by status, outputting a complete team report.

## Tech Stack

- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4, Lucide React)
- **Backend**: FastAPI (Python) with rate limiting via slowapi
- **Database**: SQLite (persistent, file-based)

## Setup Steps

### Backend
1. `cd backend`
2. `python3 -m venv venv`
3. `source venv/bin/activate`
4. `pip install -r requirements.txt`
5. Run the server: `uvicorn main:app --reload`
   Backend runs on `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`.

### Frontend
1. `cd frontend`
2. `npm install`
3. Run the dev server: `npm run dev`
   Frontend runs on `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Create a new user account |
| POST | `/api/login` | Authenticate with username/password |
| POST | `/api/orgs` | Create a new organization (User becomes Admin) |
| POST | `/api/orgs/{code}/request` | Employee requests to join an organization |
| GET | `/api/orgs/{code}/requests` | Admin fetches pending join requests |
| PATCH | `/api/orgs/{code}/members/{user}` | Admin approves or rejects a request |
| GET | `/api/orgs/{code}/role` | Returns a user's role and approval status |
| GET | `/api/tasks?org_code=X` | Get all tasks for an organization |
| POST | `/api/tasks?org_code=X` | Create a new task |
| DELETE | `/api/tasks/{id}` | Delete a task |
| PATCH | `/api/tasks/{id}/status` | Move a task between columns |
| POST | `/api/standup?org_code=X` | Generate AI standup for all approved members |

## Screenshots / Demo
Light Mode
<img width="1470" height="834" alt="image" src="https://github.com/user-attachments/assets/baf0c714-a760-47b6-a2d6-a309e39ca5fe" />

Dark Mode
<img width="1470" height="833" alt="image" src="https://github.com/user-attachments/assets/ab81f0a1-97ec-4e3f-b8ae-dad2b963a1ee" />

View On Phone
<img width="360" height="1600" alt="image" src="https://github.com/user-attachments/assets/a42673c2-3c90-4164-9b5f-f189c969a915" />


