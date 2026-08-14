'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

/* ── Types ── */

interface User { id: string; name: string; role: string }
interface Task {
  id: string; title: string; title_id: string | null; description: string;
  priority: string; status: string;
  transcript: string | null; transcript_id: string | null;
  summary: string | null; summary_id: string | null;
  steps: string[]; steps_id: string[];
  deliverables: string[]; deliverables_id: string[];
  questions: string[]; questions_id: string[];
  answered_questions: number[];
  ai_error: string | null;
  deadline: string | null; voice_path: string; voice_duration: number | null;
  boss_name: string; assignee_name: string; assignee_id: string; created_by: string;
  created_at: string; reply_count: number;
}
interface Reply {
  id: string; user_id: string; user_name: string; voice_path: string;
  voice_duration: number | null; transcript: string; created_at: string;
}

/* ── Icons (inline SVGs — no dependency) ── */

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const AlertIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
);

/* ── Sub-components ── */

const PriorityDot = ({ level }: { level: string }) => {
  const map: Record<string, string> = { high: 'bg-red-400 shadow-[0_0_6px_rgb(248_113_113/0.4)]', medium: 'bg-amber-400 shadow-[0_0_4px_rgb(251_191_36/0.3)]', low: 'bg-zinc-600' };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-[5px] ${map[level] || map.low}`} />;
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    todo: 'bg-zinc-800 text-zinc-400',
    in_progress: 'bg-blue-950/60 text-blue-400',
    waiting: 'bg-red-950/50 text-red-400',
    done: 'bg-emerald-950/50 text-emerald-400',
  };
  const labels: Record<string, string> = {
    todo: 'To Do', in_progress: 'In Progress', waiting: 'Stuck', done: 'Done',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium tracking-wide uppercase ${map[status] || map.todo}`}>
      {status === 'done' && <CheckIcon />}{labels[status] || status}
    </span>
  );
};

/* ── Main page ── */

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
  const [searchQuery, setSearchQuery] = useState('');
  const [aiModel, setAiModel] = useState('ag/gemini-3-flash');
  const [processing, setProcessing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [replyRecording, setReplyRecording] = useState(false);
  const [replyBlob, setReplyBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replyRecorderRef = useRef<MediaRecorder | null>(null);

  const [answering, setAnswering] = useState<{ idx: number; blob: Blob | null; recording: boolean }>({ idx: -1, blob: null, recording: false });
  const questionRecorderRef = useRef<MediaRecorder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [kanbanTab, setKanbanTab] = useState<'todo' | 'in_progress' | 'waiting' | 'done'>('todo');
  const [mobileDetail, setMobileDetail] = useState(false);

  /* ── Data fetching ── */

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterAssignee) params.set('assignee', filterAssignee);
    if (filterStatus) params.set('status', filterStatus);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    const res = await fetch(`/api/tasks?${params}`);
    setTasks((await res.json()).tasks || []);
  }, [filterAssignee, filterStatus, searchQuery]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { window.location.href = '/'; return; }
      setUser(d.user);
      fetch('/api/users').then(r => r.json()).then(d => { const u = d.users || []; setUsers(u); setAssigneeId(prev => prev || u.find((x: User) => x.role === 'member')?.id || ''); });
      fetch('/api/settings/model').then(r => r.json()).then(d => setAiModel(d.model || 'ag/gemini-3-flash'));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user) fetchTasks(); }, [user, fetchTasks]);

  /* ── Recording ── */

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => { setAudioBlob(new Blob(chunks, { type: 'audio/webm' })); stream.getTracks().forEach(t => t.stop()); };
    recorder.onstart = () => { setRecordingTime(0); timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000); };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const createTask = async () => {
    if (!audioBlob || processing) return;
    setShowNewTask(false); setProcessing(true); setError(null);
    try {
      const form = new FormData(); form.append('voice', audioBlob, 'recording.webm'); form.append('assignee_id', assigneeId || users.find(u => u.role === 'member')?.id || ''); form.append('voice_duration', String(recordingTime)); form.append('model', aiModel);
      const res = await fetch('/api/tasks', { method: 'POST', body: form }); const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      if (data.ai_error) setError(`Task saved, but transcription failed.`);
      setAudioBlob(null); await fetchTasks(); if (data.task?.id) await loadTaskDetail(data.task.id);
    } catch (e) { setError((e as Error).message); } finally { setProcessing(false); }
  };

  /* ── Task actions ── */

  const loadTaskDetail = async (id: string) => { const r = await fetch(`/api/tasks/${id}`); const d = await r.json(); setSelectedTask(d.task); setReplies(d.replies || []); setMobileDetail(true); };
  const updateStatus = async (id: string, status: string) => { await fetch(`/api/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); fetchTasks(); if (selectedTask?.id === id) setSelectedTask(prev => prev ? { ...prev, status } : null); };
  const deleteTask = async (id: string) => { await fetch(`/api/tasks/${id}`, { method: 'DELETE' }); if (selectedTask?.id === id) setSelectedTask(null); setConfirmDelete(null); fetchTasks(); };
  const retranscribe = async (id: string) => { setRetrying(true); setError(null);
    try { const r = await fetch(`/api/tasks/${id}/retranscribe`, { method: 'POST' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Retranscription failed'); setSelectedTask(d.task); await fetchTasks(); } catch (e) { setError((e as Error).message); } finally { setRetrying(false); }
  };

  /* ── Replies ── */

  const startReplyRecording = async () => { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); const chunks: BlobPart[] = []; recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => { setReplyBlob(new Blob(chunks, { type: 'audio/webm' })); stream.getTracks().forEach(t => t.stop()); }; replyRecorderRef.current = recorder; recorder.start(); setReplyRecording(true); };
  const stopReplyRecording = () => { replyRecorderRef.current?.stop(); setReplyRecording(false); };
  const sendReply = async () => { if (!replyBlob || !selectedTask || processing) return; setProcessing(true); setError(null);
    try { const form = new FormData(); form.append('voice', replyBlob, 'reply.webm'); const r = await fetch(`/api/tasks/${selectedTask.id}/reply`, { method: 'POST', body: form }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Failed'); if (d.ai_error) setError('Reply sent, transcription failed.'); setReplyBlob(null); await loadTaskDetail(selectedTask.id); } catch (e) { setError((e as Error).message); } finally { setProcessing(false); fetchTasks(); }
  };

  /* ── Per-question answer ── */

  const startAnswerRecording = async (idx: number) => { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); const chunks: BlobPart[] = []; recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => { setAnswering(prev => ({ ...prev, blob: new Blob(chunks, { type: 'audio/webm' }), recording: false })); stream.getTracks().forEach(t => t.stop()); }; questionRecorderRef.current = recorder; recorder.start(); setAnswering({ idx, blob: null, recording: true }); };
  const sendAnswer = async () => { if (!answering.blob || !selectedTask || processing) return; setProcessing(true); setError(null);
    try { const form = new FormData(); form.append('voice', answering.blob, 'answer.webm'); form.append('question_index', String(answering.idx)); const r = await fetch(`/api/tasks/${selectedTask.id}/reply`, { method: 'POST', body: form }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Failed'); if (d.ai_error) setError('Answer sent, transcription failed.'); setAnswering({ idx: -1, blob: null, recording: false }); await loadTaskDetail(selectedTask.id); } catch (e) { setError((e as Error).message); } finally { setProcessing(false); fetchTasks(); }
  };

  /* ── Helpers ── */

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : null;
  const dlStatus = (d: string | null): string | null => { if (!d) return null; const now = Date.now(), dl = new Date(d).getTime(), today = new Date().setHours(0,0,0,0); if (dl < today) return 'overdue'; if (dl < today + 86400000) return 'today'; if (dl < today + 2*86400000) return 'tomorrow'; return null; };
  const dlClass = (d: string | null) => ({ overdue: 'text-red-400', today: 'text-amber-300', tomorrow: 'text-amber-400/70' } as Record<string,string>)[dlStatus(d) || ''] || 'text-zinc-500';

  const pendingCount = tasks.filter(t => (t.questions?.length || 0) > (t.answered_questions?.length || 0)).length;
  const waitingCount = tasks.filter(t => t.status === 'waiting').length;

  if (loading) return <div className="bg-[var(--bg)] min-h-screen flex items-center justify-center"><p className="text-sm text-zinc-600 animate-pulse">Loading…</p></div>;
  if (!user) return null;
  const isBoss = user.role === 'boss';

  const renderKanbanCard = (task: Task) => {
    const ds = dlStatus(task.deadline);
    const hasPendingQ = (task.questions?.length || 0) > (task.answered_questions?.length || 0);
    return (
      <div key={task.id} onClick={() => loadTaskDetail(task.id)}
        className={`group card p-3 cursor-pointer transition-all hover:border-zinc-600 hover:bg-[var(--surface-raised)] active:scale-[0.98] ${selectedTask?.id === task.id ? 'ring-1 ring-violet-500/50 border-violet-500/40' : ''}`}>
        <div className="flex items-start gap-2">
          <PriorityDot level={task.priority} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] leading-snug text-zinc-200 line-clamp-2 font-medium">{task.title_id || task.title}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {task.assignee_name && (
                <span className="text-[10px] text-zinc-400 bg-zinc-800/70 border border-zinc-700/50 px-1.5 py-0.5 rounded-md font-medium">@{task.assignee_name}</span>
              )}
              {task.deadline && (
                <span className={`text-[10px] font-medium ${dlClass(task.deadline)}`}>
                  {ds === 'overdue' ? 'Overdue' : ds === 'today' ? 'Today' : ds === 'tomorrow' ? 'Tomorrow' : fmtDate(task.deadline)}
                </span>
              )}
              {task.reply_count > 0 && <span className="text-[10px] text-zinc-600">{task.reply_count} 💬</span>}
              {hasPendingQ && <span className="text-[10px] text-amber-500 font-medium">{task.questions.length - (task.answered_questions?.length || 0)} ⚡</span>}
              {task.ai_error && <AlertIcon />}
            </div>
          </div>
          <button onClick={e => { e.stopPropagation(); setConfirmDelete(task); }}
            className="sm:opacity-0 sm:group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-0.5 transition-all flex-shrink-0" title="Delete"><TrashIcon/></button>
        </div>
      </div>
    );
  };

  const renderDetailContent = (t: Task, pendingQ: string[]) => (
    <>
      {/* ── Title row ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-100 leading-snug">{t.title_id || t.title}</h2>
          {t.title && t.title !== t.title_id && <p className="text-[13px] text-zinc-500 mt-0.5">{t.title}</p>}
          <div className="flex items-center gap-2.5 mt-2 text-[12px] text-zinc-500 flex-wrap">
            <span>{t.boss_name} → {t.assignee_name}</span>
            {t.deadline && <span className={`font-medium ${dlClass(t.deadline)}`}>· Due {fmtDate(t.deadline)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)} className="input-field px-2 py-1 text-[11px] cursor-pointer">
            <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="waiting">Stuck</option><option value="done">Done</option>
          </select>
          <button onClick={() => setConfirmDelete(t)} className="p-1.5 text-zinc-700 hover:text-red-400 hover:bg-red-950/30 rounded-md transition-colors" title="Delete"><TrashIcon/></button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase tracking-wider ${t.priority === 'high' ? 'bg-red-950/60 text-red-400' : t.priority === 'medium' ? 'bg-amber-950/50 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>{t.priority}</span>
        <StatusBadge status={t.status} />
      </div>

      {/* ── AI Error ── */}
      {t.ai_error && (
        <div className="card-raised p-3 mb-5 border-red-900/30 bg-red-950/20">
          <p className="text-[11px] font-medium text-red-400 mb-2">Transcription Failed</p>
          <p className="text-[12px] text-zinc-500 mb-3">{t.ai_error}</p>
          <button onClick={() => retranscribe(t.id)} disabled={retrying} className="bg-red-900/40 hover:bg-red-900/60 disabled:opacity-40 text-red-300 text-[11px] px-3 py-1 rounded-md transition-colors">{retrying ? 'Processing…' : 'Retry Transcription'}</button>
        </div>
      )}

      {/* ── Voice + Transcript ── */}
      <section className="card p-4 mb-4">
        <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-3">Voice Note</h3>
        <audio controls className="w-full h-[36px] mb-4 audio-styled" src={t.voice_path} preload="metadata"/>
        {t.transcript ? (
          <>
            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">English</p>
            <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{t.transcript}</p>
            {t.transcript_id && t.transcript_id !== t.transcript && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">Indonesian</p>
                <p className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap">{t.transcript_id}</p>
              </div>
            )}
          </>
        ) : <p className="text-[13px] text-zinc-700 italic">No transcript</p>}
      </section>

      {/* ── Summary ── */}
      {(t.summary || t.summary_id) && (
        <section className="card p-4 mb-4 bg-violet-950/20 border-violet-800/30">
          <h3 className="text-[10px] font-semibold text-violet-400 uppercase tracking-[0.12em] mb-2">What the Boss Means</h3>
          {t.summary && <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{t.summary}</p>}
          {t.summary_id && t.summary_id !== t.summary && <p className="text-[12px] text-zinc-500 leading-relaxed mt-2 pt-2 border-t border-violet-800/20">{t.summary_id}</p>}
        </section>
      )}

      {/* ── Steps ── */}
      {t.steps?.length > 0 && (
        <section className="card p-4 mb-4">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-3">Action Items</h3>
          <ol className="space-y-3">
            {t.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[13px]">
                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-[10px] font-semibold flex items-center justify-center mt-px">{i + 1}</span>
                <div className="min-w-0"><p className="text-zinc-300 leading-relaxed">{s}</p>{t.steps_id?.[i] && t.steps_id[i] !== s && <p className="text-[11px] text-zinc-600 mt-0.5">{t.steps_id[i]}</p>}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Deliverables ── */}
      {t.deliverables?.length > 0 && (
        <section className="card p-4 mb-4">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-3">Deliverables</h3>
          <ul className="space-y-2">
            {t.deliverables.map((d, i) => (
              <li key={i} className="flex gap-2 text-[13px]"><CheckIcon /><span className="text-zinc-300">{d}</span>{t.deliverables_id?.[i] && t.deliverables_id[i] !== d && <span className="text-[11px] text-zinc-600">{t.deliverables_id[i]}</span>}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Pending Questions ── */}
      {pendingQ.length > 0 && (
        <section className="card p-4 mb-4 border-amber-800/30 bg-amber-950/15">
          <h3 className="text-[10px] font-semibold text-amber-400 uppercase tracking-[0.12em] mb-3">Needs Confirmation</h3>
          <ul className="space-y-3">
            {pendingQ.map((q) => {
              const idx = (t.questions || []).indexOf(q);
              const isAnsweringThis = answering.idx === idx;
              return (
                <li key={idx} className="flex items-start gap-2.5 text-[13px]">
                  <span className="text-amber-500/70 mt-px">?</span>
                  <span className="flex-1 min-w-0 leading-relaxed text-zinc-300">{q}</span>
                  {isBoss && (
                    <span className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                      {isAnsweringThis && answering.recording ? (
                        <button onClick={() => { questionRecorderRef.current?.stop(); setAnswering(prev => ({ ...prev, recording: false })); }} className="bg-red-600 hover:bg-red-500 text-white text-[11px] px-2.5 py-1 rounded-md animate-pulse">Stop</button>
                      ) : isAnsweringThis && answering.blob ? (
                        <div className="flex items-center gap-1">
                          <button onClick={sendAnswer} className="bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] px-2.5 py-1 rounded-md font-medium">Send</button>
                          <button onClick={() => setAnswering({ idx: -1, blob: null, recording: false })} className="text-[11px] text-zinc-500 hover:text-zinc-300">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startAnswerRecording(idx)} className="inline-flex items-center gap-1 bg-amber-950/60 hover:bg-amber-900/50 border border-amber-800/40 text-amber-400 text-[11px] px-2 py-1 rounded-md font-medium transition-colors"><MicIcon/> Answer</button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Replies ── */}
      {replies.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] mb-3">Replies</h3>
          {replies.map(r => (
            <div key={r.id} className="card p-3 mb-3 ml-4">
              <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">{r.user_name} · {new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
              <audio controls className="w-full h-[32px] mb-2 audio-styled" src={r.voice_path} preload="metadata"/>
              {r.transcript && r.transcript !== 'Voice reply' && <p className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap">{r.transcript}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Reply bar ── */}
      <div className="mt-5 pt-4 border-t border-[var(--border)] flex items-center gap-2 flex-wrap">
        {!replyRecording && !replyBlob && (
          <button onClick={startReplyRecording} className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors"><MicIcon/> Reply</button>
        )}
        {replyRecording && <button onClick={stopReplyRecording} className="bg-red-600 hover:bg-red-500 text-white text-[12px] font-medium px-3 py-1.5 rounded-md animate-pulse">Stop</button>}
        {replyBlob && (
          <div className="flex items-center gap-2">
            <button onClick={sendReply} className="bg-emerald-700 hover:bg-emerald-600 text-white text-[12px] font-medium px-3 py-1.5 rounded-md">Send Reply</button>
            <button onClick={() => setReplyBlob(null)} className="text-[12px] text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        )}
      </div>
    </>
  );

  /* ═══════════════════════════════════════ RENDER ═══════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col text-[15px]">

      {/* ═══════ HEADER ═══════ */}
      <header className="h-14 flex items-center justify-between px-5 bg-[var(--surface)] border-b border-[var(--border)] flex-shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center shadow-[0_2px_8px_rgb(99_102_241/0.3)]">
            <img src="/logo.png" alt="BossNote" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-[13px] font-semibold tracking-tight text-zinc-100">BossNote</h1>
            <p className="text-[10px] text-zinc-600 leading-none mt-0.5">{user.name} <span className="text-zinc-700">·</span> {isBoss ? 'Boss' : 'Team'}</p>
          </div>

          {/* Counter pills in header */}
          {(pendingCount > 0 || waitingCount > 0) && (
            <div className="flex items-center gap-1.5 ml-4">
              {pendingCount > 0 && <span className="px-2 py-0.5 bg-[var(--warning-soft)] text-amber-400 text-[10px] font-medium rounded-full">{pendingCount} question{pendingCount > 1 ? 's' : ''}</span>}
              {waitingCount > 0 && <span className="px-2 py-0.5 bg-red-950/50 text-red-400 text-[10px] font-medium rounded-full">{waitingCount} stuck</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isBoss && (
            <button onClick={() => window.location.href = '/dashboard/users'} className="text-[12px] text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition-colors" title="Manage Users">Users</button>
          )}
          <button onClick={() => window.location.href = '/dashboard/account'} className="text-[12px] text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition-colors" title="Account">Account</button>
          {/* Desktop: inline New Task button */}
          <div className="hidden sm:flex items-center gap-2">
            <select value={aiModel} onChange={e => { setAiModel(e.target.value); fetch('/api/settings/model', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: e.target.value }) }); }}
              className="input-field px-2.5 py-1 text-[11px] w-auto cursor-pointer">
              <option value="ag/gemini-3-flash">Gemini 3 Flash</option>
              <option value="ag/gemini-3.6-flash-medium">Gemini 3.6 Flash</option>
              <option value="ag/gemini-3.5-flash-high">Gemini 3.5 Flash</option>
              <option value="ag/gemini-3-flash-agent">Gemini 3 Flash Agent</option>
            </select>
            {isBoss && (
              <button onClick={() => { setShowNewTask(true); setAudioBlob(null); setAudioUrl(null); }} className="h-8 px-3.5 inline-flex items-center gap-1.5 bg-gradient-to-b from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[12px] font-medium rounded-md transition-all shadow-[0_1px_3px_rgb(99_102_241/0.25)] active:scale-[0.98]">
                <PlusIcon /> New Task
              </button>
            )}
          </div>
          {/* Mobile: model selector only (New Task moves to FAB) */}
          <select value={aiModel} onChange={e => { setAiModel(e.target.value); fetch('/api/settings/model', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: e.target.value }) }); }}
            className="sm:hidden input-field px-2.5 py-1 text-[11px] w-auto cursor-pointer">
            <option value="ag/gemini-3-flash">Gemini 3 Flash</option>
            <option value="ag/gemini-3.6-flash-medium">Gemini 3.6 Flash</option>
            <option value="ag/gemini-3.5-flash-high">Gemini 3.5 Flash</option>
            <option value="ag/gemini-3-flash-agent">Gemini 3 Flash Agent</option>
          </select>
        </div>
      </header>

      {/* ═══════ MOBILE FAB ═══════ */}
      {isBoss && (
        <button onClick={() => { setShowNewTask(true); setAudioBlob(null); setAudioUrl(null); }}
          className="sm:hidden fixed bottom-6 right-5 z-30 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-[0_4px_20px_rgb(99_102_241/0.45)] active:scale-95 transition-transform">
          <PlusIcon />
        </button>
      )}

      {/* ═══════ BANNERS ═══════ */}
      {processing && <div className="h-8 bg-violet-950/40 border-b border-violet-800/40 text-violet-300 text-[12px] flex items-center justify-center gap-2 flex-shrink-0"><span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"/>Processing voice note…</div>}
      {error && <div className="bg-[var(--danger-soft)] border-b border-red-900/30 text-red-400 text-[12px] flex items-center px-4 py-2 flex-shrink-0"><AlertIcon /><span className="flex-1 ml-2">{error}</span><button onClick={() => setError(null)} className="text-red-500/70 hover:text-red-400 ml-3">Dismiss</button></div>}

      {/* ═══════ TOOLBAR ═══════ */}
      <div className="h-11 flex items-center gap-2 px-4 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
        {isBoss && (
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="input-field px-2.5 py-1 text-[12px] w-auto cursor-pointer">
            <option value="">Everyone</option>
            {users.filter(u => u.role === 'member').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field px-2.5 py-1 text-[12px] w-auto cursor-pointer">
          <option value="">All status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting">Stuck</option>
          <option value="done">Done</option>
        </select>
        <div className="relative ml-auto">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…" className="input-field pl-3 pr-7 py-1 text-[12px] w-36"/>
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-[10px]">✕</button>}
        </div>
      </div>

      {/* ═══════ BODY ═══════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Desktop Kanban board ── */}
        <div className="hidden sm:flex flex-col border-r border-[var(--border)] bg-[var(--bg)] overflow-hidden" style={{ width: selectedTask ? '55%' : '100%' }}>
          <div className="flex-1 flex gap-3 p-4 overflow-x-auto overflow-y-hidden">
            {(['todo', 'in_progress', 'waiting', 'done'] as const).map(status => {
              const colTasks = tasks.filter(t => t.status === status);
              const colLabel = { todo: 'To Do', in_progress: 'In Progress', waiting: 'Stuck', done: 'Done' }[status];
              const colHeaderBg = status === 'todo' ? 'bg-zinc-950/20' : status === 'in_progress' ? 'bg-blue-950/20' : status === 'waiting' ? 'bg-red-950/20' : 'bg-emerald-950/20';
              const colDot = status === 'todo' ? 'bg-zinc-500' : status === 'in_progress' ? 'bg-blue-500' : status === 'waiting' ? 'bg-red-500' : 'bg-emerald-500';
              return (
                <div key={status} className="flex-1 min-w-[220px] max-w-[360px] flex flex-col bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <div className={`flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)] ${colHeaderBg} flex-shrink-0`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${colDot}`} />
                      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{colLabel}</h3>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-600 tabular-nums">{colTasks.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {colTasks.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-[11px] text-zinc-700 italic">No tasks</div>
                    ) : (colTasks.map(task => renderKanbanCard(task)))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="h-9 flex items-center gap-4 px-4 border-t border-[var(--border)] bg-[var(--surface)] flex-shrink-0 text-[10px] text-zinc-600">
            <span>{tasks.length} total</span>
            {pendingCount > 0 && <span className="text-amber-500">{pendingCount} need confirmation</span>}
            {waitingCount > 0 && <span className="text-red-400">{waitingCount} stuck</span>}
          </div>
        </div>

        {/* ── Mobile: tabbed Kanban ── */}
        <div className="sm:hidden flex flex-col flex-1 overflow-hidden">
          {/* Status tabs */}
          <div className="flex gap-1 p-2 bg-[var(--surface)] border-b border-[var(--border)] flex-shrink-0">
            {(['todo', 'in_progress', 'waiting', 'done'] as const).map(s => {
              const count = tasks.filter(t => t.status === s).length;
              const label = { todo: 'To Do', in_progress: 'Progress', waiting: 'Stuck', done: 'Done' }[s];
              return (
                <button key={s} onClick={() => setKanbanTab(s)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all text-center ${kanbanTab === s ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500'}`}>
                  {label} {count > 0 && <span className="text-zinc-600 ml-0.5">{count}</span>}
                </button>
              );
            })}
          </div>
          {/* Active tab cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(tasks.filter(t => t.status === kanbanTab).length === 0) ? (
              <div className="flex items-center justify-center py-16 text-[12px] text-zinc-600 italic">No tasks here</div>
            ) : tasks.filter(t => t.status === kanbanTab).map(task => renderKanbanCard(task))}
          </div>
          {/* Bottom stat bar */}
          <div className="h-8 flex items-center gap-3 px-3 border-t border-[var(--border)] bg-[var(--surface)] flex-shrink-0 text-[10px] text-zinc-600">
            <span>{tasks.length} total</span>
            {pendingCount > 0 && <span className="text-amber-500">{pendingCount} ⚡</span>}
          </div>
        </div>

        {/* ── Detail panel (desktop: side panel, mobile: fullscreen overlay) ── */}
        {selectedTask && (() => {
          const t = selectedTask;
          const pendingQ = (t.questions || []).filter((_, i) => !(t.answered_questions || [] as number[]).includes(i));
          return (
            <>
              {/* Desktop side panel */}
              <div className="hidden sm:block flex-1 overflow-y-auto bg-[var(--bg)]">
                <div className="max-w-[640px] mx-auto p-5 sm:p-8">
                  {renderDetailContent(t, pendingQ)}
                </div>
              </div>
              {/* Mobile fullscreen overlay */}
              {mobileDetail && (
                <div className="sm:hidden fixed inset-0 z-40 bg-[var(--bg)] overflow-y-auto animate-[slideUp_0.2s_ease-out]">
                  <div className="p-4 pt-14">
                    <button onClick={() => { setSelectedTask(null); setMobileDetail(false); }}
                      className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center gap-2 px-4 bg-[var(--surface)] border-b border-[var(--border)] text-[13px] font-medium text-zinc-300">
                      ← Back to Board
                    </button>
                    {renderDetailContent(t, pendingQ)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

      </div>

      {/* ═══════ RECORDING MODAL ═══════ */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => { setShowNewTask(false); stopRecording(); }}>
          <div className="card-raised p-6 max-w-sm w-full bg-[var(--surface)]" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-300 ${recording ? 'bg-red-600 shadow-[0_0_24px_rgb(239_68_68/0.4)] scale-110' : 'bg-gradient-to-br from-violet-600 to-indigo-600 shadow-[0_4px_16px_rgb(99_102_241/0.3)]'}`}>
                <MicIcon />
              </div>
              <h3 className="text-base font-semibold text-zinc-100">{!audioBlob ? (recording ? 'Recording…' : 'New Voice Task') : 'Review'}</h3>
              <p className="text-[12px] text-zinc-500 mt-1">{!audioBlob ? (recording ? fmtTime(recordingTime) : 'Tap to speak') : `${fmtTime(recordingTime)} recorded`}</p>
            </div>
            {!audioBlob ? (
              <button onClick={recording ? stopRecording : startRecording} className={`w-full py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${recording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-[0_2px_8px_rgb(99_102_241/0.3)]'}`}>
                {recording ? 'Stop Recording' : 'Start Recording'}
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Assign to</label>
                  <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="input-field px-2.5 py-2 text-[13px] w-full cursor-pointer">
                    {users.filter(u => u.role === 'member').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <audio controls className="w-full h-9 audio-styled" src={audioBlob ? URL.createObjectURL(audioBlob) : ''}/>
                <div className="flex gap-2">
                  <button onClick={createTask} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-2.5 rounded-lg text-[13px] font-medium transition-all shadow-[0_2px_8px_rgb(99_102_241/0.3)]">Create Task</button>
                  <button onClick={() => { setAudioBlob(null); setRecordingTime(0); }} className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg text-[13px] transition-colors">Re-record</button>
                </div>
              </div>
            )}
            <button onClick={() => { setShowNewTask(false); stopRecording(); }} className="w-full mt-3 text-[12px] text-zinc-600 hover:text-zinc-400 py-1.5 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* ═══════ DELETE CONFIRMATION MODAL ═══════ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-5 animate-[fadeIn_0.15s_ease-out]" onClick={() => setConfirmDelete(null)}>
          <div className="card-raised p-6 max-w-sm w-full animate-[scaleIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-xl bg-red-950/60 border border-red-800/40 flex items-center justify-center mb-4 mx-auto">
              <TrashIcon />
            </div>
            <h3 className="text-base font-semibold text-center text-zinc-100">Delete this task?</h3>
            <p className="text-[13px] text-zinc-500 text-center mt-1.5 leading-relaxed">
              <span className="text-zinc-300 font-medium truncate block">{confirmDelete.title_id || confirmDelete.title}</span>
              This action cannot be undone.
            </p>
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-medium py-2 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => deleteTask(confirmDelete.id)} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-[13px] font-medium py-2 rounded-lg transition-colors shadow-[0_2px_8px_rgb(239_68_68/0.2)]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
