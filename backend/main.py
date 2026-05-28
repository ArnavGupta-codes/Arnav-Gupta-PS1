from fastapi import FastAPI, Request, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import uuid
import hashlib
import os
import binascii
import urllib.request
import json
import ssl
import jwt
from datetime import datetime, timedelta, timezone

# ==========================================
# ENVIRONMENT CONFIGURATION (.env loader)
# ==========================================
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip('"').strip("'")

# ==========================================
# AUTH CONFIGURATION
# ==========================================
security = HTTPBearer()
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-fallback")
ALGORITHM = "HS256"

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_password_hash(password: str) -> str:
    """Hash a password using PBKDF2-SHA512 with a random salt."""
    salt = hashlib.sha256(os.urandom(60)).hexdigest().encode("ascii")
    pwdhash = hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt, 100000)
    pwdhash = binascii.hexlify(pwdhash)
    return (salt + pwdhash).decode("ascii")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a stored password against one provided by user."""
    salt = hashed_password[:64].encode("ascii")
    stored_password = hashed_password[64:]
    pwdhash = hashlib.pbkdf2_hmac("sha512", plain_password.encode("utf-8"), salt, 100000)
    pwdhash = binascii.hexlify(pwdhash).decode("ascii")
    return pwdhash == stored_password

# ==========================================
# DATABASE SETUP
# ==========================================
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "focusflow.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS users (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 username TEXT UNIQUE NOT NULL,
                 password_hash TEXT NOT NULL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS organizations (
                 org_code TEXT PRIMARY KEY,
                 admin_username TEXT NOT NULL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS org_members (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 org_code TEXT NOT NULL,
                 username TEXT NOT NULL,
                 status TEXT NOT NULL DEFAULT 'pending',
                 UNIQUE(org_code, username))""")
    c.execute("""CREATE TABLE IF NOT EXISTS tasks (
                 id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 priority TEXT NOT NULL,
                 assignee TEXT NOT NULL,
                 due_date TEXT NOT NULL,
                 status TEXT NOT NULL,
                 org_code TEXT NOT NULL)""")
    conn.commit()
    conn.close()

init_db()

# ==========================================
# APP + RATE LIMITING
# ==========================================
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="FocusFlow Backend", description="API for FocusFlow Task Manager")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# PYDANTIC MODELS
# ==========================================
class UserCreate(BaseModel):
    username: str
    password: str

class Task(BaseModel):
    id: Optional[str] = None
    title: str
    priority: str
    assignee: str
    due_date: str
    status: str

class StatusUpdate(BaseModel):
    status: str

class MemberAction(BaseModel):
    action: str  # "approve" or "reject"

# ==========================================
# AUTH ENDPOINTS
# ==========================================
@app.post("/api/register")
@limiter.limit("5/minute")
def register_user(request: Request, user: UserCreate):
    if not user.username or not user.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                  (user.username, get_password_hash(user.password)))
        conn.commit()
        access_token = create_access_token(data={"sub": user.username})
        return {
            "message": "User created successfully",
            "username": user.username,
            "access_token": access_token,
            "token_type": "bearer",
            "org_code": None,
            "role": "none",
            "status": "none"
        }
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already taken")
    finally:
        conn.close()

@app.post("/api/login")
@limiter.limit("10/minute")
def login_user(request: Request, user: UserCreate):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT password_hash FROM users WHERE username = ?", (user.username,))
    row = c.fetchone()
    if not row or not verify_password(user.password, row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check if user has an active organization request or membership
    c.execute("SELECT org_code, status FROM org_members WHERE username = ?", (user.username,))
    member_row = c.fetchone()
    org_code = None
    role = "none"
    status = "none"
    if member_row:
        org_code = member_row["org_code"]
        status = member_row["status"]
        # Check if admin
        c.execute("SELECT admin_username FROM organizations WHERE org_code = ?", (org_code,))
        org_row = c.fetchone()
        if org_row and org_row["admin_username"] == user.username:
            role = "admin"
        else:
            role = "member"
            
    conn.close()
    
    access_token = create_access_token(data={"sub": user.username})
    
    return {
        "message": "Login successful", 
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "org_code": org_code,
        "role": role,
        "status": status
    }

# ==========================================
# ORGANIZATION ENDPOINTS
# ==========================================
@app.post("/api/orgs")
@limiter.limit("5/minute")
def create_org(request: Request, org_code: str = Query(...), username: str = Depends(get_current_user)):
    """Create a new organization. The creator becomes admin and is auto-approved."""
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute("INSERT INTO organizations (org_code, admin_username) VALUES (?, ?)",
                  (org_code, username))
        c.execute("INSERT INTO org_members (org_code, username, status) VALUES (?, ?, 'approved')",
                  (org_code, username))
        conn.commit()
        return {"message": "Organization created", "org_code": org_code, "role": "admin"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Organization code already exists")
    finally:
        conn.close()

@app.post("/api/orgs/{org_code}/request")
@limiter.limit("10/minute")
def request_join_org(request: Request, org_code: str, username: str = Depends(get_current_user)):
    """Employee sends a join request to an organization."""
    conn = get_db()
    c = conn.cursor()
    # Check org exists
    c.execute("SELECT org_code FROM organizations WHERE org_code = ?", (org_code,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Organization not found")
    # Check if already a member
    c.execute("SELECT status FROM org_members WHERE org_code = ? AND username = ?", (org_code, username))
    existing = c.fetchone()
    if existing:
        conn.close()
        if existing["status"] == "approved":
            return {"message": "Already a member", "status": "approved"}
        elif existing["status"] == "pending":
            return {"message": "Request already pending", "status": "pending"}
        else:
            raise HTTPException(status_code=403, detail="Your request was rejected")
    try:
        c.execute("INSERT INTO org_members (org_code, username, status) VALUES (?, ?, 'pending')",
                  (org_code, username))
        conn.commit()
        return {"message": "Join request sent", "status": "pending"}
    finally:
        conn.close()

@app.get("/api/orgs/{org_code}/requests")
@limiter.limit("20/minute")
def get_pending_requests(request: Request, org_code: str, username: str = Depends(get_current_user)):
    """Admin fetches pending join requests."""
    conn = get_db()
    c = conn.cursor()
    # Verify caller is admin
    c.execute("SELECT admin_username FROM organizations WHERE org_code = ?", (org_code,))
    org = c.fetchone()
    if not org or org["admin_username"] != username:
        conn.close()
        raise HTTPException(status_code=403, detail="Only the admin can view requests")
    c.execute("SELECT username, status FROM org_members WHERE org_code = ? AND status = 'pending'", (org_code,))
    rows = c.fetchall()
    conn.close()
    return [{"username": r["username"], "status": r["status"]} for r in rows]

@app.patch("/api/orgs/{org_code}/members/{member_username}")
@limiter.limit("10/minute")
def handle_member_request(request: Request, org_code: str, member_username: str,
                          body: MemberAction, username: str = Depends(get_current_user)):
    """Admin approves or rejects a join request."""
    conn = get_db()
    c = conn.cursor()
    # Verify caller is admin
    c.execute("SELECT admin_username FROM organizations WHERE org_code = ?", (org_code,))
    org = c.fetchone()
    if not org or org["admin_username"] != username:
        conn.close()
        raise HTTPException(status_code=403, detail="Only the admin can manage members")
    new_status = "approved" if body.action == "approve" else "rejected"
    c.execute("UPDATE org_members SET status = ? WHERE org_code = ? AND username = ?",
              (new_status, org_code, member_username))
    conn.commit()
    updated = c.rowcount
    conn.close()
    if updated == 0:
        raise HTTPException(status_code=404, detail="Member request not found")
    return {"message": f"Member {new_status}", "username": member_username}

@app.get("/api/orgs/{org_code}/members")
@limiter.limit("20/minute")
def get_members(request: Request, org_code: str, current_user: str = Depends(get_current_user)):
    """Get all approved members of an organization."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT username, status FROM org_members WHERE org_code = ? AND status = 'approved'", (org_code,))
    rows = c.fetchall()
    conn.close()
    return [{"username": r["username"]} for r in rows]

@app.get("/api/orgs/{org_code}/role")
@limiter.limit("20/minute")
def get_user_role(request: Request, org_code: str, username: str = Depends(get_current_user)):
    """Check user's role and membership status in an org."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT admin_username FROM organizations WHERE org_code = ?", (org_code,))
    org = c.fetchone()
    if not org:
        conn.close()
        return {"role": "none", "status": "not_found"}
    is_admin = org["admin_username"] == username
    c.execute("SELECT status FROM org_members WHERE org_code = ? AND username = ?", (org_code, username))
    member = c.fetchone()
    conn.close()
    if not member:
        return {"role": "none", "status": "none"}
    return {"role": "admin" if is_admin else "member", "status": member["status"]}

# ==========================================
# TASK ENDPOINTS
# ==========================================
@app.get("/api/tasks", response_model=List[Task])
@limiter.limit("20/minute")
def get_tasks(request: Request, org_code: str = Query(...), current_user: str = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, title, priority, assignee, due_date, status FROM tasks WHERE org_code = ?", (org_code,))
    rows = c.fetchall()
    conn.close()
    return [Task(**dict(row)) for row in rows]

@app.post("/api/tasks", response_model=Task)
@limiter.limit("10/minute")
def create_task(request: Request, task: Task, org_code: str = Query(...), current_user: str = Depends(get_current_user)):
    task.id = str(uuid.uuid4())
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO tasks (id, title, priority, assignee, due_date, status, org_code) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (task.id, task.title, task.priority, task.assignee, task.due_date, task.status, org_code),
    )
    conn.commit()
    conn.close()
    return task

@app.delete("/api/tasks/{task_id}")
@limiter.limit("10/minute")
def delete_task(request: Request, task_id: str, current_user: str = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    deleted = c.rowcount
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

@app.patch("/api/tasks/{task_id}/status")
@limiter.limit("20/minute")
def update_task_status(request: Request, task_id: str, body: StatusUpdate, current_user: str = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE tasks SET status = ? WHERE id = ?", (body.status, task_id))
    conn.commit()
    updated = c.rowcount
    conn.close()
    if updated == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Status updated"}

# ==========================================
# GEMINI API HELPER
# ==========================================
def call_gemini_api(prompt: str) -> Optional[str]:
    """Call Google's Gemini API directly using standard library HTTP client."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        # Using a 12 second timeout for external API call
        with urllib.request.urlopen(req, timeout=12) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            candidates = res_data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
    except Exception as e:
        print(f"Gemini API call failed, falling back to template: {e}")
        if hasattr(e, 'read'):
            try:
                err_resp = e.read().decode('utf-8')
                print(f"Gemini API error details: {err_resp}")
            except Exception:
                pass
    return None

# ==========================================
# AI STANDUP ENDPOINT — generates for ALL members
# ==========================================
@app.post("/api/standup")
@limiter.limit("5/minute")
def generate_standup(request: Request, org_code: str = Query(...), current_user: str = Depends(get_current_user)):
    """Generate standup for ALL members in the organization using Gemini if configured, otherwise falls back to template."""
    import concurrent.futures
    conn = get_db()
    c = conn.cursor()
    # Get all approved members
    c.execute("SELECT username FROM org_members WHERE org_code = ? AND status = 'approved'", (org_code,))
    members = [r["username"] for r in c.fetchall()]
    # Get all tasks
    c.execute("SELECT title, status, assignee FROM tasks WHERE org_code = ?", (org_code,))
    rows = c.fetchall()
    conn.close()

    if not members:
        return {"standup_updates": []}

    def generate_member_update(member):
        member_done = [r["title"] for r in rows if r["status"] == "Done" and r["assignee"] == member]
        member_wip = [r["title"] for r in rows if r["status"] == "In Progress" and r["assignee"] == member]
        member_todo = [r["title"] for r in rows if r["status"] == "Todo" and r["assignee"] == member]

        yesterday = ", ".join(member_done) if member_done else "no completed tasks"
        today = ", ".join(member_wip + member_todo) if (member_wip or member_todo) else "no pending tasks"

        # Check if Gemini API key exists, otherwise use fallback template
        prompt = (
            f"Generate a short, professional, daily standup update in 1-3 sentences for a team member named {member}.\n"
            f"Their task details are:\n"
            f"- Completed tasks: {yesterday}\n"
            f"- Current/Pending tasks: {today}\n"
            f"- Blockers: None\n\n"
            f"Write it in the first person (e.g. 'Yesterday I completed...'). Keep it extremely concise and direct."
        )

        update_text = call_gemini_api(prompt)
        if not update_text:
            # Fallback template
            update_text = (
                f"Completed: {yesterday}.\n"
                f"Working on: {today}.\n"
                f"Blockers: none."
            )
        return {"username": member, "update": update_text}

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(members))) as executor:
        updates = list(executor.map(generate_member_update, members))

    return {"standup_updates": updates}
