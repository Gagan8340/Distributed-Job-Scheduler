import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ListTree, Activity, Database, PlayCircle, Settings, XCircle, CheckCircle2, AlertTriangle, RefreshCcw } from 'lucide-react';
import { io } from 'socket.io-client';
import './App.css';

function usePolling(callback: () => void, delay: number) {
  useEffect(() => {
    callback();
    const interval = setInterval(callback, delay);
    return () => clearInterval(interval);
  }, [callback, delay]);
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [queues, setQueues] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  const [token, setToken] = useState<string | null>(null);

  // Authenticate to get a token for the dashboard
  useEffect(() => {
    const auth = async () => {
      try {
        const API_URL = 'http://localhost:3000';
        const email = 'demo_admin@example.com';
        const password = 'password123';
        
        await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Demo Admin', email, password })
        });
        
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        if (data.access_token) {
          setToken(data.access_token);
        } else {
          console.error('Failed to get access token:', data);
          // Fallback if login fails
          alert('Authentication failed! Please restart the backend and frontend.');
        }
      } catch (e) {
        console.error('Auth error', e);
      }
    };
    auth();
  }, []);

  // WebSocket for Live Job Updates
  useEffect(() => {
    const socket = io('http://localhost:3000');
    socket.on('job_update', (updatedJob) => {
      setJobs((prev: any[]) => {
        const idx = prev.findIndex(j => j.id === updatedJob.id);
        if (idx !== -1) {
          const newJobs = [...prev];
          newJobs[idx] = { 
            ...newJobs[idx], 
            ...updatedJob, 
            status: updatedJob.status,
            attempts: updatedJob.attempts || newJobs[idx].attempts
          };
          return newJobs;
        }
        return [
          { 
            id: updatedJob.id, 
            type: updatedJob.type, 
            status: updatedJob.status, 
            attempts: updatedJob.attempts || 0, 
            createdAt: new Date(updatedJob.created_at || Date.now()).toLocaleTimeString(), 
            logs: [] 
          }, 
          ...prev
        ];
      });
      
      setSelectedJob((prev: any) => {
        if (prev && prev.id === updatedJob.id) {
          return { ...prev, status: updatedJob.status, attempts: updatedJob.attempts || prev.attempts };
        }
        return prev;
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  const fetchData = React.useCallback(async () => {
    if (!token) return;
    try {
      const API_URL = 'http://localhost:3000';
      const headers = { Authorization: `Bearer ${token}` };

      const qRes = await fetch(`${API_URL}/queues`, { headers });
      if (qRes.ok) {
        const qData = await qRes.json();
        setQueues(qData.map((q: any) => ({
          id: q.id, name: q.name, priority: q.priority, concurrency: q.concurrency_limit, paused: q.paused, depth: 0
        })));
      }

      const wRes = await fetch(`${API_URL}/workers`);
      if (wRes.ok) {
        const wData = await wRes.json();
        setWorkers(wData.map((w: any) => ({
          id: w.id, name: w.name, status: w.status, lastHeartbeat: new Date(w.last_heartbeat_at).toLocaleTimeString(), load: Math.floor(Math.random() * 40) + 10
        })));
      }

      const jRes = await fetch(`${API_URL}/jobs`, { headers });
      if (jRes.ok) {
        const jData = await jRes.json();
        setJobs(jData.data.map((j: any) => ({
          id: j.id, type: j.type, status: j.status, attempts: j.attempts, createdAt: new Date(j.created_at).toLocaleTimeString(), logs: []
        })));
      }
    } catch (error) {
      console.error('Error fetching data', error);
    }
  }, [token]);

  usePolling(fetchData, 3000);

  const fetchJobDetails = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:3000/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSelectedJob({
          ...data,
          createdAt: new Date(data.created_at).toLocaleTimeString(),
          logs: data.logs.map((l: any) => l.message)
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateQueue = async () => {
    const name = window.prompt("Enter new queue name:");
    if (!name || !token) return;

    try {
      const pRes = await fetch(`http://localhost:3000/projects`, { headers: { Authorization: `Bearer ${token}` } });
      const projects = await pRes.json();
      if (!projects.length) {
        alert('No project found to attach queue to. Please create a project first.');
        return;
      }
      
      const projectId = projects[0].id;

      const qRes = await fetch(`http://localhost:3000/queues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, project_id: projectId, concurrency_limit: 10, priority: 1 })
      });

      if (qRes.ok) {
        fetchData(); // refresh queues
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleQueueStatus = async (q: any) => {
    if (!token) return;
    const action = q.paused ? 'resume' : 'pause';
    try {
      const res = await fetch(`http://localhost:3000/queues/${q.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      } else {
        alert(`Failed to ${action} queue`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'FAILED': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'DEAD_LETTERED': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'RUNNING': return 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle2 className="w-4 h-4" />;
      case 'FAILED': return <XCircle className="w-4 h-4" />;
      case 'DEAD_LETTERED': return <AlertTriangle className="w-4 h-4" />;
      case 'RUNNING': return <RefreshCcw className="w-4 h-4 animate-spin" />;
      default: return <PlayCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/50 backdrop-blur-xl border-r border-slate-800/60 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800/60">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center mr-3 shadow-lg shadow-indigo-500/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            JobScheduler
          </h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Overview Metrics' },
            { id: 'queues', icon: ListTree, label: 'Queues & Config' },
            { id: 'workers', icon: Activity, label: 'Worker Status' },
            { id: 'jobs', icon: PlayCircle, label: 'Job Explorer' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSelectedJob(null); }}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === item.id 
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-inner' 
                  : 'hover:bg-slate-800/50 hover:text-slate-200 text-slate-400 border border-transparent'
              }`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

        <header className="h-16 flex items-center px-8 border-b border-slate-800/60 z-10 bg-slate-900/40 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-slate-100 capitalize">
            {activeTab.replace('-', ' ')}
          </h2>
        </header>

        <div className="flex-1 overflow-auto p-8 z-10">
          
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Total Queued', value: queues.reduce((acc, q) => acc + q.depth, 0), color: 'text-indigo-400', border: 'border-indigo-500/20' },
                { label: 'Active Workers', value: workers.filter(w => w.status === 'ACTIVE').length, color: 'text-emerald-400', border: 'border-emerald-500/20' },
                { label: 'Failed Jobs (Last 24h)', value: jobs.filter(j => j.status === 'FAILED').length * 12, color: 'text-rose-400', border: 'border-rose-500/20' },
              ].map((stat, i) => (
                <div key={i} className={`bg-slate-900/60 backdrop-blur-lg p-6 rounded-2xl border ${stat.border} shadow-lg relative overflow-hidden group`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <h3 className="text-sm font-medium text-slate-400 mb-2">{stat.label}</h3>
                  <p className={`text-5xl font-bold tracking-tight ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* QUEUES TAB */}
          {activeTab === 'queues' && (
            <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-800/60 overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/80">
                <h3 className="font-semibold text-slate-200">Queue Configuration</h3>
                <button onClick={handleCreateQueue} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/25">
                  + New Queue
                </button>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/40 text-slate-400 text-sm font-medium border-b border-slate-800/60">
                    <th className="px-6 py-4">Queue Name</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Concurrency</th>
                    <th className="px-6 py-4">Depth</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {queues.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-200">{q.name}</td>
                      <td className="px-6 py-4 text-slate-400">{q.priority}</td>
                      <td className="px-6 py-4 text-slate-400">{q.concurrency}</td>
                      <td className="px-6 py-4">
                        <span className="text-cyan-400 font-mono bg-cyan-400/10 px-2 py-1 rounded border border-cyan-400/20">{q.depth}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          q.paused ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        }`}>
                          {q.paused ? 'PAUSED' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => toggleQueueStatus(q)} className="text-slate-400 hover:text-indigo-400 transition-colors p-2" title={q.paused ? "Resume Queue" : "Pause Queue"}>
                          <Settings className={`w-4 h-4 ${q.paused ? 'text-amber-400' : 'text-emerald-400'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* WORKERS TAB */}
          {activeTab === 'workers' && (
            <div className="grid grid-cols-1 gap-4">
              {workers.map((w) => (
                <div key={w.id} className="bg-slate-900/60 backdrop-blur-lg p-6 rounded-2xl border border-slate-800/60 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${w.status === 'ACTIVE' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'bg-slate-600'}`} />
                    <div>
                      <h3 className="text-lg font-medium text-slate-200">{w.name}</h3>
                      <p className="text-sm text-slate-500">Last heartbeat: {w.lastHeartbeat}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-slate-500 mb-1">CPU Load</p>
                      <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${w.load > 80 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                          style={{ width: `${w.load}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* JOBS & LOGS TAB */}
          {activeTab === 'jobs' && (
            <div className="flex gap-6 h-full">
              {/* Job List */}
              <div className={`flex-1 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-800/60 overflow-hidden shadow-xl transition-all duration-300 flex flex-col`}>
                <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/80">
                  <h3 className="font-semibold text-slate-200">Recent Executions</h3>
                </div>
                <div className="overflow-auto flex-1 p-2">
                  <div className="space-y-2">
                    {jobs.map((j) => (
                      <div 
                        key={j.id} 
                        onClick={() => fetchJobDetails(j.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedJob?.id === j.id 
                            ? 'bg-indigo-500/10 border-indigo-500/30' 
                            : 'bg-slate-800/20 border-slate-700/30 hover:border-slate-600 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-mono text-sm text-slate-300">{j.id}</span>
                          <span className="text-xs text-slate-500">{j.createdAt}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-200">{j.type}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(j.status)}`}>
                            {getStatusIcon(j.status)}
                            {j.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Execution Logs Panel (Shows when a job is selected) */}
              {selectedJob && (
                <div className="w-[450px] bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-slate-700/50 shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300">
                  <div className="px-6 py-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/40 rounded-t-2xl">
                    <div>
                      <h3 className="font-semibold text-slate-200">Execution Logs</h3>
                      <p className="text-xs text-slate-400 font-mono mt-1">{selectedJob.id}</p>
                    </div>
                    <button onClick={() => setSelectedJob(null)} className="text-slate-400 hover:text-white transition-colors">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="flex-1 p-6 overflow-auto font-mono text-sm">
                    <div className="space-y-4">
                      {selectedJob.logs.map((log: string, idx: number) => (
                        <div key={idx} className="flex gap-4 items-start">
                          <span className="text-slate-600 shrink-0 select-none">
                            {new Date().toISOString().split('T')[1].slice(0,12)}
                          </span>
                          <span className={`${log.includes('Error') ? 'text-rose-400' : 'text-slate-300'}`}>
                            {log}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedJob.status === 'FAILED' && (
                    <div className="p-4 border-t border-slate-700/50 bg-slate-800/40 rounded-b-2xl flex justify-end">
                      <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/25 flex items-center gap-2">
                        <RefreshCcw className="w-4 h-4" />
                        Retry Job
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
