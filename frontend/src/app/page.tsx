"use client";

import { useState, useEffect } from "react";

// ==========================================
// CONFIGURABLE VALUES (Adjust as needed)
// ==========================================
const BACKEND_API_URL = "http://localhost:8000/api"; // Endpoint for backend tasks & standups
const TASK_PRIORITIES = ["Low", "Medium", "High"]; // Available task priority levels
const TASK_STATUS_COLUMNS = ["Todo", "In Progress", "Done"]; // Kanban board columns

type Task = {
  id: string;
  title: string;
  priority: string;
  assignee: string;
  due_date: string;
  status: string;
};

export default function Home() {
  // Theme state: default to dark mode for high-contrast professional look
  const [darkMode, setDarkMode] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [standup, setStandup] = useState("");

  // Sync state to <html> classList to activate Tailwind class-based dark mode selectors
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const handleGenerateStandup = async () => {
    setLoading(true);
    // Simulated endpoint hit for the standup UI generator
    setTimeout(() => {
      setStandup("Yesterday I completed API integration and task filtering.\nToday I'll work on authentication and deployment.\nBlockers: none.");
      setLoading(false);
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-8 transition-colors duration-150">
      <div className="max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              FocusFlow
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Team Task Manager
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Theme Toggle Button */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-slate-200 dark:bg-slate-850 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-800 hover:bg-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Toggle Theme"
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* AI Standup Action Button */}
            <button
              onClick={handleGenerateStandup}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              Generate Standup Update
            </button>
          </div>
        </header>

        {/* AI generated status updates section */}
        {standup && (
          <div className="mb-8 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-top-4">
            <h2 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-3 uppercase tracking-wider">
              AI Standup Update
            </h2>
            <div className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {standup}
            </div>
          </div>
        )}

        {/* Kanban Board Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TASK_STATUS_COLUMNS.map((column) => (
            <div key={column} className="flex flex-col bg-slate-100 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="font-bold text-slate-800 dark:text-slate-200">{column}</h2>
                <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  0
                </span>
              </div>
              
              {/* Empty State */}
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950">
                <p className="text-slate-400 dark:text-slate-500 text-sm mb-4">No tasks yet.</p>
                <button className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer">
                  + Create {column} Task
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
