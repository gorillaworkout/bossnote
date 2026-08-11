'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface User { id: string; name: string; role: string }
interface Task {
  id: string; title: string; description: string; priority: string; status: string;
  transcript: string | null; summary: string | null;
  steps: string[]; deliverables: string[]; questions: string[];
  ai_error: string | null;
  deadline: string | null; voice_path: string; voice_duration: number | null;
  boss_name: string; assignee_name: string; assignee_id: string; created_by: string;
  created_at: string; reply_count: number;
}
interface Reply {
  id: string; user_id: string; user_name: string; voice_path: string;
  voice_duration: number | null; transcript: string; created_at: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [aiModel, setAiModel] = useState('ag/gemini-3-flash');
  const [processing, setProcessing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [replyRecording, setReplyRecording] = useState(false);
  const [replyBlob, setReplyBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const replyRecorderRef = useRef<MediaRecorder | null>(null);

  // Load data
  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterAssignee) params.set('assignee', filterAssignee);
    if (filterStatus) params.set('status', filterStatus);
    const res = await fetch(`/api/tasks?${params}`);
    const data = await res.json();
    setTasks(data.tasks || []);
  }, [filterAssignee, filterStatus]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { window.location.href = '/'; return; }
      setUser(d.user);
      fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || []));
      fetch('/api/settings/model').then(r => r.json()).then(d => setAiModel(d.model || 'ag/gemini-3-flash'));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user) fetchTasks(); }, [user, fetchTasks]);

  // Voice recording
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Create task with AI
  const createTask = async () => {
    if (!audioBlob) return;
    setShowNewTask(false);
    setProcessing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('voice', audioBlob, 'recording.webm');
      form.append('assignee_id', users.find(u => u.role === 'member')?.id || 'bayu-001');
      form.append('voice_duration', String(recordingTime));
      form.append('model', aiModel);

      const res = await fetch('/api/tasks', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Gagal membuat task (${res.status})`);

      // Task is saved either way; surface the AI failure so it isn't silent.
      if (data.ai_error) setError(`Task tersimpan, tapi transkrip AI gagal: ${data.ai_error}`);

      setAudioBlob(null);
      await fetchTasks();
      if (data.task?.id) await loadTaskDetail(data.task.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  // Re-run the AI pipeline on a stored voice note
  const retranscribe = async (taskId: string) => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/retranscribe`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Transkrip gagal lagi');
      setSelectedTask(data.task);
      await fetchTasks();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  // Load task detail + replies
  const loadTaskDetail = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    setSelectedTask(data.task);
    setReplies(data.replies || []);
  };

  // Update task status
  const updateStatus = async (taskId: string, status: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchTasks();
    if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, status } : null);
  };

  // Voice reply
  const startReplyRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      setReplyBlob(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    replyRecorderRef.current = recorder;
    recorder.start();
    setReplyRecording(true);
  };

  const stopReplyRecording = async () => {
    replyRecorderRef.current?.stop();
    setReplyRecording(false);
  };

  const sendReply = async () => {
    if (!replyBlob || !selectedTask) return;
    setProcessing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('voice', replyBlob, 'reply.webm');
      const res = await fetch(`/api/tasks/${selectedTask.id}/reply`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim reply');
      if (data.ai_error) setError(`Reply terkirim, tapi transkrip gagal: ${data.ai_error}`);
      setReplyBlob(null);
      await loadTaskDetail(selectedTask.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
    fetchTasks();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-[var(--text-muted)]">Loading...</p></div>;
  if (!user) return null;

  const isBoss = user.role === 'boss';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold">BossNote</h1>
            <p className="text-[10px] text-[var(--text-muted)]">{user.name} · {isBoss ? 'Boss' : 'Team'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={aiModel}
            onChange={e => { setAiModel(e.target.value); fetch('/api/settings/model', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: e.target.value }) }); }}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text-muted)] focus:outline-none focus:border-indigo-500"
          >
            <option value="ag/gemini-3-flash">Gemini 3 Flash</option>
            <option value="ag/gemini-3.6-flash-medium">Gemini 3.6 Flash</option>
            <option value="ag/gemini-3.5-flash-high">Gemini 3.5 Flash</option>
            <option value="ag/gemini-3-flash-agent">Gemini 3 Flash Agent</option>
          </select>
          {isBoss && (
            <button
              onClick={() => { setShowNewTask(true); setAudioBlob(null); setAudioUrl(null); }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Task
            </button>
          )}
        </div>
      </header>

      {processing && (
        <div className="bg-indigo-600/15 border-b border-indigo-500/30 px-4 py-2 text-xs text-indigo-300 flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          AI sedang mendengarkan voice note dan menyusun task…
        </div>
      )}

      {error && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2 text-xs text-red-300 flex items-start gap-2">
          <span className="flex-1 break-words">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="border-b border-[var(--border)] px-4 py-2 flex items-center gap-3 flex-wrap">
        {isBoss && (
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
            <option value="">All people</option>
            {users.filter(u => u.role === 'member').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
          <option value="">All status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">{tasks.length} tasks</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task list */}
        <div className={`${selectedTask ? 'hidden sm:block sm:w-80 lg:w-96' : 'flex-1'} overflow-y-auto border-r border-[var(--border)]`}>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <p className="text-sm text-[var(--text-muted)]">No tasks yet</p>
              {isBoss && <p className="text-xs text-[var(--text-muted)] mt-1">Click "New Task" to create one by voice</p>}
            </div>
          ) : (
            tasks.map(task => (
              <div
                key={task.id}
                onClick={() => loadTaskDetail(task.id)}
                className={`p-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors ${selectedTask?.id === task.id ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text)] truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[var(--text-muted)]">👤 {task.assignee_name}</span>
                      {task.deadline && <span className="text-[10px] text-[var(--text-muted)]">⏰ {formatDate(task.deadline)}</span>}
                      {task.voice_duration && <span className="text-[10px] text-[var(--text-muted)]">🎤 {formatTime(task.voice_duration)}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <StatusBadge status={task.status} />
                      {task.reply_count > 0 && <span className="text-[10px] text-indigo-400">💬 {task.reply_count} replies</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Task detail panel */}
        {selectedTask && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 sm:p-6">
              <button onClick={() => setSelectedTask(null)} className="sm:hidden text-xs text-[var(--text-muted)] mb-3 hover:text-[var(--text)]">← Back</button>

              {/* Task header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedTask.priority === 'high' ? 'bg-red-500/20 text-red-400' : selectedTask.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {selectedTask.priority.toUpperCase()}
                  </span>
                  <StatusBadge status={selectedTask.status} />
                </div>
                <h2 className="text-xl font-bold">{selectedTask.title}</h2>
                <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
                  <span>From: {selectedTask.boss_name}</span>
                  <span>To: {selectedTask.assignee_name}</span>
                  {selectedTask.deadline && <span>Deadline: {formatDate(selectedTask.deadline)}</span>}
                </div>
              </div>

              {/* AI failure banner + retry */}
              {selectedTask.ai_error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                  <p className="text-xs font-medium text-red-400 mb-1">Transkrip AI gagal</p>
                  <p className="text-xs text-[var(--text-muted)] mb-3 break-words">{selectedTask.ai_error}</p>
                  <button
                    onClick={() => retranscribe(selectedTask.id)}
                    disabled={retrying}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {retrying ? 'Memproses…' : 'Coba transkrip lagi'}
                  </button>
                </div>
              )}

              {/* Original voice + verbatim transcript */}
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
                <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">Voice Note Boss</p>
                <audio controls className="w-full h-8 mb-3" src={selectedTask.voice_path}>
                  Your browser does not support audio playback.
                </audio>
                <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">Transkrip</p>
                <p className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                  {selectedTask.transcript || <span className="text-[var(--text-muted)] italic">Belum ada transkrip</span>}
                </p>
              </div>

              {/* What this task actually means */}
              {selectedTask.summary && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">Maksudnya</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedTask.summary}</p>
                </div>
              )}

              {selectedTask.steps?.length > 0 && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Yang harus dikerjakan</p>
                  <ol className="space-y-2">
                    {selectedTask.steps.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600/20 text-indigo-400 text-[11px] flex items-center justify-center font-medium">{i + 1}</span>
                        <span className="leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {selectedTask.deliverables?.length > 0 && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Hasil yang diserahkan</p>
                  <ul className="space-y-1.5">
                    {selectedTask.deliverables.map((d, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed">
                        <span className="text-emerald-400 shrink-0">✓</span>{d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.questions?.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-medium text-amber-400 uppercase tracking-wider mb-3">Perlu dikonfirmasi ke Boss</p>
                  <ul className="space-y-1.5">
                    {selectedTask.questions.map((q, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed">
                        <span className="text-amber-400 shrink-0">?</span>{q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Replies thread */}
              {replies.map(r => (
                <div key={r.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-3 ml-4 sm:ml-8">
                  <p className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    {r.user_name} replied · {new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <audio controls className="w-full h-8 mb-2" src={r.voice_path} />
                  {r.transcript && r.transcript !== 'Voice reply' && (
                    <p className="text-sm text-[var(--text)] whitespace-pre-wrap">{r.transcript}</p>
                  )}
                </div>
              ))}

              {/* Actions */}
              <div className="border-t border-[var(--border)] pt-4 mt-4 flex items-center gap-2 flex-wrap">
                {!replyRecording && !replyBlob && (
                  <button onClick={startReplyRecording} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                    Reply
                  </button>
                )}
                {replyRecording && (
                  <button onClick={stopReplyRecording} className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-2 rounded-lg transition-colors animate-pulse flex items-center gap-1.5">
                    ⏹ Stop
                  </button>
                )}
                {replyBlob && (
                  <div className="flex items-center gap-2">
                    <button onClick={sendReply} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg transition-colors">Send Reply</button>
                    <button onClick={() => setReplyBlob(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
                  </div>
                )}

                {selectedTask.status !== 'done' && (
                  <button onClick={() => updateStatus(selectedTask.id, selectedTask.status === 'todo' ? 'in_progress' : 'done')} className="ml-auto bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text)] px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                    {selectedTask.status === 'todo' ? '▶ Start' : '✅ Done'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-6">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all ${recording ? 'bg-red-600 animate-pulse shadow-lg shadow-red-600/30' : 'bg-indigo-600'}`}>
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">
                {!audioBlob ? (recording ? 'Recording...' : 'New Voice Task') : 'Review Recording'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {!audioBlob
                  ? (recording ? formatTime(recordingTime) : 'Tap mic and speak your task')
                  : `${formatTime(recordingTime)} recorded`}
              </p>
            </div>

            {!audioBlob ? (
              <button
                onClick={recording ? stopRecording : startRecording}
                className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${recording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                {recording ? '⏹ Stop Recording' : '🎤 Start Recording'}
              </button>
            ) : (
              <div className="space-y-3">
                <audio controls className="w-full h-10" src={audioUrl || ''} />
                <div className="flex gap-2">
                  <button onClick={createTask} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                    Create Task with AI
                  </button>
                  <button onClick={() => { setAudioBlob(null); setAudioUrl(null); setRecordingTime(0); }} className="px-4 bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm hover:text-[var(--text)] transition-colors">
                    Re-record
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => { setShowNewTask(false); stopRecording(); }} className="w-full mt-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)] py-2">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: 'bg-zinc-500/20 text-zinc-400',
    in_progress: 'bg-sky-500/20 text-sky-400',
    done: 'bg-emerald-500/20 text-emerald-400',
  };
  const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors[status] || colors.todo}`}>{labels[status] || status}</span>;
}
