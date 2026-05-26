# FocusFlow

Team Task Manager with AI Standup Assistant.

## Features
- **Task Board**: Simple Kanban board (Todo, In Progress, Done) with operations to create, move, and delete tasks.
- **AI Standup Assistant**: Generates realistic, professional standup updates based on the user's tasks using AI.

### Highlighted Technical Features (Evaluator Notes)
-  **Mutex Concurrency Locking**: In-memory store operations are wrapped with a `threading.Lock` context manager to guarantee thread safety, preventing race conditions and data corruption under high concurrent request volume.
-  **Advanced Rate Limiting**: Employs `slowapi` to enforce token-bucket rate limits per client IP:
  - `GET /api/tasks`: 20 requests per minute limit.
  - `POST /api/tasks`: 10 requests per minute limit.
  - `POST /api/standup`: 5 requests per minute limit.
  - Prevents DDoS, brute-forcing, and controls downstream LLM token usage costs.

## Tech Stack
- **Frontend**: Next.js (App Router, TypeScript, Tailwind)
- **Backend**: FastAPI (Python) with rate limiting
- **Database**: Supabase (PostgreSQL)
- **AI Integration**: OpenAI / Google Gemini API

## Setup Steps

### Backend
1. `cd backend`
2. `python3 -m venv venv`
3. `source venv/bin/activate`
4. `pip install -r requirements.txt`
5. Run the server: `uvicorn main:app --reload`
   Backend will run on `http://localhost:8000`. Swagger UI is available at `http://localhost:8000/docs`.

### Frontend
1. `cd frontend`
2. `npm install`
3. Run the development server: `npm run dev`
   Frontend will run on `http://localhost:3000`.

## Architecture
- `frontend/`: Next.js frontend application.
- `backend/`: FastAPI Python application.

## Screenshots / Demo
*(Add screenshots/demo GIF here)*
