"use client";

import { useState, useEffect, useRef } from "react";
import { Sun, Moon, LogOut, Copy, Zap, Plus, X, Users, Check, XCircle } from "lucide-react";

// ==========================================
// CONFIGURABLE: Change this to your deployed backend URL
// ==========================================
const BACKEND_API_URL = "http://localhost:8000/api";
const TASK_STATUS_COLUMNS = ["Todo", "In Progress", "Done"];

type Task = {
  id: string;
  title: string;
  priority: string;
  assignee: string;
  due_date: string;
  status: string;
};

type StandupUpdate = {
  username: string;
  update: string;
};

type PendingRequest = {
  username: string;
  status: string;
};

export default function Home() {
  // Theme
  const [darkMode, setDarkMode] = useState(true);

  // Auth state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Org state
  const [orgCode, setOrgCode] = useState("");
  const [orgInput, setOrgInput] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "member" | "pending" | "none">("none");

  // Kanban state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [standups, setStandups] = useState<StandupUpdate[]>([]);

  // Admin state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  // Inline task creation state
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Dark mode sync
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Auto-focus the new task input
  useEffect(() => {
    if (addingToColumn && newTaskInputRef.current) {
      newTaskInputRef.current.focus();
    }
  }, [addingToColumn]);

  // Poll for status if pending
  useEffect(() => {
    if (userRole === "pending" && orgCode) {
      const interval = setInterval(() => {
        checkUserRole(orgCode);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [userRole, orgCode]);

  // ==========================================
  // AUTH HANDLERS
  // ==========================================
  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthError("Please enter both username and password");
      return;
    }
    setAuthError("");
    setAuthLoading(true);
    try {
      const endpoint = authMode === "register" ? "/register" : "/login";
      const res = await fetch(`${BACKEND_API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");
      setIsLoggedIn(true);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername("");
    setPassword("");
    setOrgCode("");
    setUserRole("none");
    setTasks([]);
    setStandups([]);
  };

  // ==========================================
  // ORG HANDLERS
  // ==========================================
  const checkUserRole = async (code: string) => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/orgs/${code}/role?username=${username}`);
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.status === "approved" ? data.role : data.status);
        if (data.status === "approved") {
          fetchTasks(code);
        }
      }
    } catch (err) {
      console.error("Failed to check role:", err);
    }
  };

  const handleJoinOrg = async () => {
    const code = orgInput.trim().toUpperCase();
    if (!code) return;
    setOrgCode(code);
    try {
      const res = await fetch(`${BACKEND_API_URL}/orgs/${code}/request?username=${username}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.status);
        if (data.status === "approved") {
          fetchTasks(code);
        }
      } else {
        const errorData = await res.json();
        alert(errorData.detail || "Failed to join organization");
        setOrgCode("");
      }
    } catch (err) {
      console.error("Failed to join org:", err);
      setOrgCode("");
    }
  };

  const handleCreateOrg = async () => {
    const code = "ORG-" + Math.floor(1000 + Math.random() * 9000).toString();
    try {
      const res = await fetch(`${BACKEND_API_URL}/orgs?org_code=${code}&username=${username}`, {
        method: "POST",
      });
      if (res.ok) {
        setOrgCode(code);
        setUserRole("admin");
        setTasks([]);
      }
    } catch (err) {
      console.error("Failed to create org:", err);
    }
  };

  const handleLeaveOrg = () => {
    setOrgCode("");
    setUserRole("none");
    setTasks([]);
    setStandups([]);
  };

  // ==========================================
  // ADMIN HANDLERS
  // ==========================================
  const fetchPendingRequests = async () => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/orgs/${orgCode}/requests?username=${username}`);
      if (res.ok) setPendingRequests(await res.json());
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    }
  };

  const handleMemberAction = async (memberUsername: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/orgs/${orgCode}/members/${memberUsername}?username=${username}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchPendingRequests();
      }
    } catch (err) {
      console.error(`Failed to ${action} member:`, err);
    }
  };

  const openMembersModal = () => {
    setShowMembersModal(true);
    fetchPendingRequests();
  };

  // ==========================================
  // TASK HANDLERS
  // ==========================================
  const fetchTasks = async (code: string) => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/tasks?org_code=${code}`);
      if (res.ok) setTasks(await res.json());
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    }
  };

  const handleCreateTask = async (status: string) => {
    if (!newTaskTitle.trim()) return;
    try {
      const res = await fetch(`${BACKEND_API_URL}/tasks?org_code=${orgCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          priority: "Medium",
          assignee: username,
          due_date: new Date().toLocaleDateString(),
          status,
        }),
      });
      if (res.ok) {
        setNewTaskTitle("");
        setAddingToColumn(null);
        fetchTasks(orgCode);
      }
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) fetchTasks(orgCode);
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      const res = await fetch(`${BACKEND_API_URL}/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchTasks(orgCode);
    } catch (err) {
      console.error("Failed to move task:", err);
      fetchTasks(orgCode);
    }
  };

  const handleGenerateStandup = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_API_URL}/standup?org_code=${orgCode}`, { method: "POST" });
      const data = await res.json();
      setStandups(data.standup_updates);
    } catch (err) {
      console.error("Failed to generate standup:", err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // DRAG AND DROP
  // ==========================================
  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "0.5";
  };
  const onDragEnd = (e: React.DragEvent) => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "1";
  };
  const onDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  };
  const onDrop = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedTaskId) {
      const task = tasks.find((t) => t.id === draggedTaskId);
      if (task && task.status !== column) handleMoveTask(draggedTaskId, column);
    }
    setDraggedTaskId(null);
  };

  // ==========================================
  // COMPONENTS
  // ==========================================
  const Header = () => (
    <header className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">FocusFlow</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Team Task Manager</p>
      </div>
      <div className="flex items-center gap-3">
        {isLoggedIn && (
          <>
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Signed in as <span className="font-bold text-slate-700 dark:text-slate-200">{username}</span>
            </span>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors" title="Sign Out">
              <LogOut size={18} />
            </button>
          </>
        )}
        <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors" title="Toggle Theme">
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );

  // ==========================================
  // SCREEN 1: LOGIN / REGISTER
  // ==========================================
  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Header />
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
            <div className="flex mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => { setAuthMode("login"); setAuthError(""); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all ${authMode === "login" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                Login
              </button>
              <button
                onClick={() => { setAuthMode("register"); setAuthError(""); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all ${authMode === "register" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                Register
              </button>
            </div>
            {authError && <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm text-center">{authError}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Username</label>
                <input className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-slate-100" placeholder="Enter your username" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Password</label>
                <input className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-slate-100" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAuth()} />
              </div>
              <button onClick={handleAuth} disabled={authLoading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-lg font-bold transition-colors text-sm">
                {authLoading ? "Please wait..." : authMode === "register" ? "Create Account" : "Sign In"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // SCREEN 2: ORGANIZATION ACCESS
  // ==========================================
  if (!orgCode) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6">
        <div className="max-w-7xl mx-auto">
          <Header />
          <div className="max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8 mt-8">
            <h2 className="text-2xl font-bold text-center mb-1">Welcome, {username}!</h2>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 text-sm">Join your team&apos;s organization or create a new one.</p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Join Existing Organization</label>
              <div className="flex gap-2">
                <input className="flex-1 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono tracking-wider text-slate-800 dark:text-slate-100" placeholder="e.g. ORG-1234" value={orgInput} onChange={(e) => setOrgInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleJoinOrg()} />
                <button onClick={handleJoinOrg} className="px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors text-sm">Join</button>
              </div>
            </div>
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
              <span className="text-slate-400 dark:text-slate-500 text-xs font-medium">OR</span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
            </div>
            <button onClick={handleCreateOrg} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-lg font-bold transition-colors text-sm flex justify-center items-center gap-2">
              <Plus size={18} /> Create New Organization
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // SCREEN 3: PENDING APPROVAL
  // ==========================================
  if (userRole === "pending") {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Request Sent</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            You have requested to join <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{orgCode}</span>. Please wait for an administrator to approve your request.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-8">
            <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"></span>
            Waiting for approval...
          </div>
          <button onClick={handleLeaveOrg} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold transition-colors">
            Cancel Request
          </button>
        </div>
      </main>
    );
  }

  // ==========================================
  // SCREEN 4: KANBAN DASHBOARD
  // ==========================================
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6">
      <div className="max-w-7xl mx-auto relative">
        <Header />

        {/* Org Banner */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 mb-8">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">Organization:</span>
            <span className="font-mono font-bold text-lg text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
              {orgCode}
            </span>
            <button onClick={() => navigator.clipboard.writeText(orgCode)} className="p-1.5 text-slate-400 hover:text-blue-500 bg-slate-50 dark:bg-slate-800 rounded-md transition-colors" title="Copy code">
              <Copy size={14} />
            </button>
            {userRole === "admin" && (
              <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold ml-2">ADMIN</span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {userRole === "admin" && (
              <button onClick={openMembersModal} className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                <Users size={16} /> Manage Members
              </button>
            )}
            <button onClick={handleGenerateStandup} disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg shadow-sm text-sm font-semibold transition-colors flex items-center gap-2">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap size={16} />}
              {loading ? "Generating..." : "Generate AI Standup"}
            </button>
            <button onClick={handleLeaveOrg} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold transition-colors">
              Leave Org
            </button>
          </div>
        </div>

        {/* Standup Result */}
        {standups.length > 0 && (
          <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border border-indigo-200 dark:border-indigo-800">
            <h2 className="text-sm font-bold text-indigo-700 dark:text-indigo-400 mb-4 flex items-center gap-2 border-b border-indigo-100 dark:border-indigo-800/50 pb-2">
              <Zap size={18} /> Team AI Standup Update
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {standups.map((s, idx) => (
                <div key={idx} className="bg-white/60 dark:bg-slate-900/60 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800/30 text-sm">
                  <div className="font-bold text-slate-800 dark:text-slate-200 mb-2">{s.username}</div>
                  <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{s.update}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TASK_STATUS_COLUMNS.map((column) => {
            const columnTasks = tasks.filter((t) => t.status === column);
            const isDropTarget = dragOverColumn === column;

            return (
              <div key={column} className={`flex flex-col rounded-xl p-4 border transition-colors ${isDropTarget ? "bg-blue-50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-600" : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`} onDragOver={(e) => onDragOver(e, column)} onDragLeave={onDragLeave} onDrop={(e) => onDrop(e, column)}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-slate-800 dark:text-slate-200">{column}</h2>
                  <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold px-2.5 py-0.5 rounded-full">{columnTasks.length}</span>
                </div>

                <div className="flex-1 flex flex-col gap-3 min-h-[180px]">
                  {columnTasks.map((task) => (
                    <div key={task.id} draggable onDragStart={(e) => onDragStart(e, task.id)} onDragEnd={onDragEnd} className={`bg-white dark:bg-slate-950 p-3 rounded-lg border shadow-sm group cursor-grab active:cursor-grabbing transition-all ${draggedTaskId === task.id ? "opacity-50 border-blue-400 dark:border-blue-600" : "border-slate-200 dark:border-slate-800 hover:shadow-md"}`}>
                      <div className="flex justify-between items-start">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{task.title}</p>
                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100 ml-2 shrink-0"><X size={14} /></button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{task.assignee}</p>
                      <div className="mt-2 flex items-center gap-1 text-slate-300 dark:text-slate-700">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
                        <span className="text-[10px] uppercase tracking-wider font-semibold">Drag to move</span>
                      </div>
                    </div>
                  ))}
                  {columnTasks.length === 0 && !isDropTarget && <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg py-10"><p className="text-slate-400 dark:text-slate-500 text-sm">No tasks</p></div>}
                  {isDropTarget && <div className="flex-1 flex items-center justify-center border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg py-6 bg-blue-50/50 dark:bg-blue-950/20"><p className="text-blue-500 dark:text-blue-400 text-sm font-medium">Drop task here</p></div>}
                </div>

                {addingToColumn === column ? (
                  <div className="mt-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <input ref={newTaskInputRef} className="w-full p-2 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 dark:text-slate-100 mb-2" placeholder="Task title..." value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateTask(column); if (e.key === "Escape") { setAddingToColumn(null); setNewTaskTitle(""); } }} />
                    <div className="flex gap-2">
                      <button onClick={() => handleCreateTask(column)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-md text-xs font-semibold transition-colors">Add Task</button>
                      <button onClick={() => { setAddingToColumn(null); setNewTaskTitle(""); }} className="px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 py-1.5 rounded-md text-xs font-semibold transition-colors">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setAddingToColumn(column); setNewTaskTitle(""); }} className="mt-3 w-full py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors flex items-center justify-center gap-1">
                    <Plus size={14} /> Add Task
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Manage Members Modal */}
        {showMembersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Users size={20} className="text-indigo-600 dark:text-indigo-400" /> Member Requests
                </h3>
                <button onClick={() => setShowMembersModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {pendingRequests.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-slate-400 text-sm py-8">No pending requests at the moment.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((req) => (
                      <div key={req.username} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{req.username}</span>
                        <div className="flex gap-2">
                          <button onClick={() => handleMemberAction(req.username, "approve")} className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30 rounded-md transition-colors" title="Approve">
                            <Check size={18} />
                          </button>
                          <button onClick={() => handleMemberAction(req.username, "reject")} className="p-1.5 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Reject">
                            <XCircle size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
