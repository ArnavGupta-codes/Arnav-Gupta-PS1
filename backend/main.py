from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import List, Optional
import threading
import uuid

# Rate limiting configuration using client IP address
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FocusFlow Backend", description="API for FocusFlow Task Manager")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Task(BaseModel):
    id: Optional[str] = None
    title: str
    priority: str
    assignee: str
    due_date: str
    status: str

# Thread-safe in-memory database (Replace with Supabase/PostgreSQL client connection here)
tasks_db = []
db_lock = threading.Lock()

@app.get("/api/tasks", response_model=List[Task])
@limiter.limit("20/minute") # CHANGE RATE LIMIT THRESHOLD HERE
def get_tasks(request: Request):
    with db_lock:
        return list(tasks_db)

@app.post("/api/tasks", response_model=Task)
@limiter.limit("10/minute") # CHANGE RATE LIMIT THRESHOLD HERE
def create_task(request: Request, task: Task):
    with db_lock:
        task.id = str(uuid.uuid4())
        tasks_db.append(task)
        return task

@app.post("/api/standup")
@limiter.limit("5/minute") # CHANGE RATE LIMIT THRESHOLD HERE
def generate_standup(request: Request):
    # INTEGRATE GEMINI / OPENAI API HERE:
    # 1. Fetch current tasks from database
    # 2. Call LLM client passing tasks summary as prompt context
    # 3. Return response generated from AI model
    update = (
        "Yesterday I completed API integration and task filtering.\n"
        "Today I'll work on authentication and deployment.\n"
        "Blockers: none."
    )
    return {"standup_update": update}

