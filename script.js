/* ================================================================
   KANBAN PRO — script.js
   Redesigned: Sidebar layout, Phosphor Dark aesthetic
   React 18 · All features preserved
   ================================================================ */

const { useState, useEffect, useRef, useCallback } = React;

/* ================================================================
   1. CONSTANTS & CONFIG
   ================================================================ */

const DEFAULT_COLUMNS = [
  { id: "todo",       label: "Todo",        color: "#7c7cff" },
  { id: "inprogress", label: "In Progress", color: "#ff9f3f" },
  { id: "done",       label: "Done",        color: "#3ddfa8" },
];

const DEFAULT_TASKS = [
  { id: "t1", title: "Design system setup",    description: "Define tokens, typography, and color palette", priority: "high",   tags: ["design","ui"],  dueDate: "", status: "todo",       createdAt: Date.now() - 200000 },
  { id: "t2", title: "API integration",        description: "Connect REST endpoints for user data",          priority: "medium", tags: ["backend"],       dueDate: "", status: "inprogress", createdAt: Date.now() - 100000 },
  { id: "t3", title: "Write unit tests",       description: "",                                              priority: "low",    tags: ["testing"],       dueDate: "", status: "done",       createdAt: Date.now() - 50000  },
  { id: "t4", title: "Accessibility audit",    description: "Run axe scan across all pages",                 priority: "medium", tags: ["a11y"],          dueDate: "", status: "todo",       createdAt: Date.now() - 30000  },
];

const LEVEL_CONFIG = [
  { min: 0,   label: "Task Starter",        title: "Level 1" },
  { min: 10,  label: "Getting Things Done", title: "Level 2" },
  { min: 25,  label: "Productivity Pro",    title: "Level 3" },
  { min: 50,  label: "Task Master",         title: "Level 4" },
  { min: 100, label: "Kanban Legend",       title: "Level 5" },
];

const EXTRA_COL_COLORS = [
  "#8b5cf6","#ec4899","#14b8a6",
  "#f97316","#3b82f6","#e11d48","#84cc16",
];

const ACHIEVEMENTS_DEF = [
  { id: "first",  icon: "🎯", title: "First Steps",      desc: "Created your first task",       condition: (xp, tasks) => tasks.length >= 1 },
  { id: "ten",    icon: "🔥", title: "On a Roll",         desc: "Completed 10 tasks",             condition: (xp, tasks, done) => done >= 10 },
  { id: "clear",  icon: "✨", title: "Board Cleared",     desc: "Completed all tasks",            condition: (xp, tasks, done) => tasks.length > 0 && done === tasks.length },
  { id: "lvl3",   icon: "⚡", title: "Level 3 Reached",  desc: "Hit Productivity Pro status",    condition: (xp) => xp >= 25 },
];

/* ================================================================
   2. UTILITIES
   ================================================================ */

const genId   = () => Math.random().toString(36).substr(2, 9);
const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const today   = () => new Date().toISOString().split("T")[0];

function getDueClass(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const now = new Date();        now.setHours(0,0,0,0);
  if (due < now)                          return "overdue";
  if (due.getTime() === now.getTime())    return "today";
  return "future";
}

function fmtDue(dueDate) {
  if (!dueDate) return null;
  const cls = getDueClass(dueDate);
  if (cls === "overdue") return `Overdue – ${new Date(dueDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
  if (cls === "today")   return "Due Today";
  return new Date(dueDate).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function getLevel(xp) {
  let lvl = LEVEL_CONFIG[0];
  for (const l of LEVEL_CONFIG) { if (xp >= l.min) lvl = l; }
  return lvl;
}

function getXpProgress(xp) {
  const levels = LEVEL_CONFIG.map(l => l.min);
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i]) {
      const start = levels[i];
      const end   = levels[i + 1] ?? start + 50;
      return { pct: Math.min(((xp - start) / (end - start)) * 100, 100), levelIdx: i + 1 };
    }
  }
  return { pct: 0, levelIdx: 1 };
}

function readLS(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}

/* ================================================================
   3. ATOMS / TINY COMPONENTS
   ================================================================ */

function PriorityBadge({ priority }) {
  const map = { high: "▲ High", medium: "● Med", low: "▼ Low" };
  if (!map[priority]) return null;
  return <span className={`priority-badge ${priority}`}>{map[priority]}</span>;
}

function DueLabel({ dueDate }) {
  const cls = getDueClass(dueDate);
  if (!cls) return null;
  return (
    <div className={`card-due ${cls}`}>
      <span className="due-dot" />
      {fmtDue(dueDate)}
    </div>
  );
}

function TagChip({ tag }) {
  return <span className="tag-chip">{tag}</span>;
}

function TagsInput({ value, onChange }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().replace(/,/g,"");
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };
  const remove = (t) => onChange(value.filter(x => x !== t));
  return (
    <div>
      <div className="tags-input-row">
        <input
          type="text"
          placeholder="Add tag, press Enter…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-ghost" style={{padding:"6px 10px",fontSize:12}} onClick={add}>+</button>
      </div>
      {value.length > 0 && (
        <div className="tags-preview" style={{marginTop:5}}>
          {value.map(t => (
            <span key={t} className="tag-chip" style={{cursor:"pointer"}} onClick={() => remove(t)}>
              {t} ✕
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   4. TASK CARD
   ================================================================ */

function TaskCard({ task, isDragging, isDropBefore, onEdit, onDelete, onDragStart, onDragEnd, onDragOver }) {
  return (
    <div
      className={[
        "task-card",
        `pri-${task.priority}`,
        isDragging   ? "is-dragging" : "",
        isDropBefore ? "drop-before" : "",
      ].join(" ").trim()}
      draggable
      onDragStart={e => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onDragOver={e => { e.preventDefault(); onDragOver(task.id); }}
    >
      {/* Top row: priority + controls */}
      <div className="card-top">
        <PriorityBadge priority={task.priority} />
        <div className="card-controls card-controls--always">
          <button className="card-btn"        title="Edit"   onClick={() => onEdit(task)}>✎</button>
          <button className="card-btn danger" title="Delete" onClick={() => onDelete(task.id)}>✕</button>
        </div>
      </div>

      <div className="card-title">{task.title}</div>
      {task.description && <div className="card-desc">{task.description}</div>}

      {task.tags && task.tags.length > 0 && (
        <div className="card-tags">
          {task.tags.map(t => <TagChip key={t} tag={t} />)}
        </div>
      )}

      <DueLabel dueDate={task.dueDate} />

      <div className="card-footer">
        <span className="card-meta">{fmtDate(task.createdAt)}</span>
      </div>
    </div>
  );
}

/* ================================================================
   5. INLINE ADD FORM
   ================================================================ */

function InlineAddForm({ colId, onAdd, onCancel }) {
  const [title,    setTitle]    = useState("");
  const [priority, setPriority] = useState("medium");
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);
  const submit = () => {
    if (!title.trim()) return;
    onAdd(colId, { title: title.trim(), priority });
  };
  return (
    <div className="task-form">
      <input
        ref={ref} type="text"
        placeholder="Task title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
      />
      <select value={priority} onChange={e => setPriority(e.target.value)}>
        <option value="low">▼ Low</option>
        <option value="medium">● Medium</option>
        <option value="high">▲ High</option>
      </select>
      <div className="form-row">
        <button className="btn btn-primary" style={{flex:1}} onClick={submit}>Add Task</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ================================================================
   6. TASK MODAL
   ================================================================ */

function TaskModal({ task, onSave, onClose }) {
  const isNew = !task.id;
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    tags: [], dueDate: "", ...task,
  });
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);

  const upd = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const save = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      title:     form.title.trim(),
      id:        form.id        || genId(),
      status:    form.status    || "todo",
      createdAt: form.createdAt || Date.now(),
    });
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target.className === "modal-overlay") onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">{isNew ? "New Task" : "Edit Task"}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <div className="field-label">Title *</div>
            <input ref={ref} type="text" placeholder="What needs to be done?"
              value={form.title} onChange={upd("title")}
              onKeyDown={e => e.key === "Enter" && save()} />
          </div>
          <div>
            <div className="field-label">Description</div>
            <textarea rows={3} placeholder="Add details…"
              value={form.description} onChange={upd("description")} />
          </div>
          <div className="form-row-2">
            <div>
              <div className="field-label">Priority</div>
              <select value={form.priority} onChange={upd("priority")}>
                <option value="low">▼ Low</option>
                <option value="medium">● Medium</option>
                <option value="high">▲ High</option>
              </select>
            </div>
            <div>
              <div className="field-label">Due Date</div>
              <input type="date" value={form.dueDate} onChange={upd("dueDate")} />
            </div>
          </div>
          <div>
            <div className="field-label">Tags</div>
            <TagsInput value={form.tags || []} onChange={tags => setForm(p => ({...p, tags}))} />
          </div>
          <div className="form-row" style={{marginTop:4}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={save}>
              {isNew ? "Create Task" : "Save Changes"}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   7. KANBAN COLUMN
   ================================================================ */

function KanbanColumn({
  col, tasks, isDragOver, addingTask, draggedId, dropBeforeId, isDefault,
  onStartAdd, onCancelAdd, onAddTask,
  onEdit, onDelete, onDeleteColumn, onClearDone,
  onColDragOver, onDrop,
  onDragStart, onDragEnd, onCardDragOver,
}) {
  const isDoneCol = col.id === "done";
  return (
    <div
      className={`column${isDragOver ? " drag-over" : ""}`}
      style={{"--col-color": col.color}}
      onDragOver={e => { e.preventDefault(); onColDragOver(col.id); }}
      onDrop={e => onDrop(e, col.id)}
    >
      <div className="col-header">
        <div className="col-top-bar" style={{background: col.color}} />
        <div className="col-title-row">
          <div className="col-title-group">
            <span className="col-title" style={{color: col.color}}>{col.label}</span>
            <span className="col-count">{tasks.length}</span>
          </div>
          <div className="col-actions">
            {isDoneCol && tasks.length > 0 && (
              <button className="col-btn" title="Clear all done tasks"
                style={{fontSize:11, width:"auto", padding:"0 7px", borderRadius:4}}
                onClick={onClearDone}>🧹</button>
            )}
            <button className="col-btn" title="Add task" onClick={() => onStartAdd(col.id)}>+</button>
            {!isDefault && (
              <button className="col-btn danger" title="Delete column"
                onClick={() => onDeleteColumn && onDeleteColumn(col.id)}>✕</button>
            )}
          </div>
        </div>
      </div>

      <div className="col-body">
        {addingTask === col.id && (
          <InlineAddForm colId={col.id} onAdd={onAddTask} onCancel={onCancelAdd} />
        )}
        {tasks.length === 0 && addingTask !== col.id && (
          <div className="col-empty">
            <span className="col-empty-glyph">◻</span>
            <span>No tasks here</span>
          </div>
        )}
        {tasks.map(t => (
          <TaskCard
            key={t.id}
            task={t}
            isDragging={draggedId === t.id}
            isDropBefore={dropBeforeId === t.id}
            onEdit={onEdit}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onCardDragOver}
          />
        ))}
        <button className="add-task-btn" onClick={() => onStartAdd(col.id)}>
          <span className="plus">+</span> Add task
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   8. ADD COLUMN PANEL
   ================================================================ */

function AddColumnPanel({ onAdd }) {
  const [open,  setOpen]  = useState(false);
  const [name,  setName]  = useState("");
  const [error, setError] = useState("");
  const ref = useRef();
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);

  const submit = () => {
    if (!name.trim()) return;
    const result = onAdd(name.trim());
    if (result && result.error) { setError(result.error); return; }
    setName(""); setOpen(false); setError("");
  };

  return (
    <div className="add-col-card">
      {open ? (
        <div className="add-col-form">
          <div className="field-label">Column Name</div>
          <input ref={ref} type="text" placeholder="e.g. Review, Blocked…"
            value={name}
            onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => {
              if (e.key === "Enter")  submit();
              if (e.key === "Escape") { setOpen(false); setName(""); setError(""); }
            }} />
          {error && <div style={{fontSize:11,color:"#ff4f5e",marginTop:-2}}>{error}</div>}
          <div className="form-row">
            <button className="btn btn-primary" style={{flex:1}} onClick={submit}>Add</button>
            <button className="btn btn-ghost" onClick={() => { setOpen(false); setName(""); setError(""); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="add-col-btn" onClick={() => setOpen(true)}>
          <span style={{fontSize:16}}>+</span> New Column
        </button>
      )}
    </div>
  );
}

/* ================================================================
   9. UNDO TOAST
   ================================================================ */

function UndoToast({ task, onUndo, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="toast">
      <span>Task "<strong>{task.title}</strong>" deleted</span>
      <button className="toast-undo" onClick={onUndo}>Undo</button>
    </div>
  );
}

/* ================================================================
   10. ACHIEVEMENT POP
   ================================================================ */

function AchievementPop({ achievement, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="achievement-pop">
      <span className="ach-icon">{achievement.icon}</span>
      <div>
        <div className="ach-title">Achievement Unlocked!</div>
        <div style={{fontWeight:700,fontSize:13,marginTop:1}}>{achievement.title}</div>
        <div className="ach-desc">{achievement.desc}</div>
      </div>
    </div>
  );
}

/* ================================================================
   11. LEVEL UP FLASH
   ================================================================ */

function LevelUpFlash({ level, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="levelup-flash">
      <div className="levelup-card">
        <h2>Level Up! 🎉</h2>
        <p>{level.title} — {level.label}</p>
      </div>
    </div>
  );
}

/* ================================================================
   12. SIDEBAR
   ================================================================ */

function Sidebar({ xp, tasks, columns, theme, setTheme, focusMode, setFocusMode, onNewTask, menuOpen, onClose }) {
  const lvl = getLevel(xp);
  const { pct, levelIdx } = getXpProgress(xp);

  // Count per column
  const counts = {};
  columns.forEach(c => { counts[c.id] = 0; });
  tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

  const doneCount = counts["done"] || 0;
  const pctDone   = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  // XP ring uses CSS conic-gradient driven by CSS var
  const ringStyle = { "--pct": `${pct}%` };

  return (
    <aside className={`sidebar${menuOpen ? " open" : ""}`}>

      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-mark">K</div>
        <div>
          <div className="logo-name">Kanban</div>
          <div className="logo-sub">PRO</div>
        </div>
        <button className="sidebar-close-btn" onClick={onClose}>✕</button>
      </div>

      {/* XP / Level */}
      <div className="sidebar-xp">
        <div className="xp-ring-row">
          <div className="xp-ring" style={ringStyle}>
            <span className="xp-ring-label">{levelIdx}</span>
          </div>
          <div className="xp-info">
            <div className="xp-level-title">{lvl.title}</div>
            <div className="xp-level-label">{lvl.label}</div>
            <div className="xp-pts">{xp} XP</div>
          </div>
        </div>
        <div className="xp-bar-track">
          <div className="xp-bar-fill" style={{width: `${pct}%`}} />
        </div>
      </div>

      {/* Stats */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Board Stats</div>
        <div className="stat-list">
          {columns.map(col => (
            <div className="stat-row" key={col.id}>
              <span className="stat-dot" style={{background: col.color}} />
              <span className="stat-name">{col.label}</span>
              <span className="stat-num">{counts[col.id] || 0}</span>
            </div>
          ))}
          <div className="stat-divider" />
          <div className="stat-row">
            <span className="stat-dot" style={{background:"var(--text-3)"}} />
            <span className="stat-name" style={{fontWeight:600,color:"var(--text-2)"}}>Total</span>
            <span className="stat-num">{tasks.length}</span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="sidebar-progress">
        <div className="progress-label-row">
          <span className="progress-label">Progress</span>
          <span className="progress-pct-val">{pctDone}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{width: `${pctDone}%`}} />
        </div>
      </div>

      <div className="sidebar-spacer" />

      {/* New task CTA */}
      <button className="sidebar-new-btn" onClick={onNewTask}>
        <span className="sidebar-new-btn-icon">＋</span>
        New Task
      </button>

      {/* Footer actions */}
      <div className="sidebar-footer">
        <button
          className={`sidebar-foot-btn${focusMode ? " active" : ""}`}
          onClick={() => setFocusMode(p => !p)}
        >
          <span className="sidebar-foot-btn-icon">🎯</span>
          Focus Mode
        </button>
        <button
          className="sidebar-foot-btn"
          onClick={() => setTheme(p => p === "dark" ? "light" : "dark")}
        >
          <span className="sidebar-foot-btn-icon">{theme === "dark" ? "☀" : "☾"}</span>
          {theme === "dark" ? "Light Theme" : "Dark Theme"}
        </button>

        <div className="sidebar-shortcuts">
          {[["N","New task"],["F","Search"],["Esc","Close"]].map(([k,d]) => (
            <div className="sidebar-shortcut" key={k}>
              <kbd>{k}</kbd>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ================================================================
   13. TOPBAR
   ================================================================ */

function TopBar({ search, setSearch, filterPri, setFilterPri, searchRef, focusMode, menuOpen, setMenuOpen }) {
  return (
    <div className="topbar-wrapper">
    <div className="topbar">
      {/* Hamburger — mobile only */}
      <button className="topbar-hamburger" onClick={() => setMenuOpen(p => !p)} aria-label="Menu">
        <span /><span /><span />
      </button>

      <span className="topbar-title">Board</span>
      <div className="topbar-divider" />

      {/* Search */}
      <div className="search-wrap">
        <button
          className="search-toggle-btn"
          title="Search [F]"
          onClick={() => searchRef.current?.focus()}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
          </svg>
        </button>
        <input
          ref={searchRef}
          className="search-input"
          type="text"
          placeholder="Search tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape") { setSearch(""); searchRef.current?.blur(); }
          }}
        />
      </div>

      <div className="topbar-spacer" />

      {focusMode && (
        <span style={{
          fontSize: 11,
          color: "var(--accent)",
          fontFamily: "var(--font-mono)",
          letterSpacing: ".06em",
          whiteSpace: "nowrap",
        }}>
          FOCUS ON
        </span>
      )}
    </div>

    {/* Priority filter — lives outside topbar so it can reflow on mobile */}
    <div className="filter-row">
      {["all","high","medium","low"].map(p => (
        <button key={p}
          className={`chip ${p} ${filterPri === p ? "active" : ""}`}
          onClick={() => setFilterPri(p)}>
          {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
        </button>
      ))}
    </div>
    </div>
  );
}

/* ================================================================
   14. ROOT APP
   ================================================================ */

function KanbanApp() {

  /* ----- Persisted state ----- */
  const [tasks,    setTasks]    = useState(() => readLS("kbp-tasks",   []));
  const [columns,  setColumns]  = useState(() => readLS("kbp-cols",    DEFAULT_COLUMNS));
  const [theme,    setTheme]    = useState(() => readLS("kbp-theme",   "dark"));
  const [xp,       setXp]       = useState(() => readLS("kbp-xp",      0));
  const [achieved, setAchieved] = useState(() => readLS("kbp-ach",     []));

  /* ----- UI state ----- */
  const [search,     setSearch]     = useState("");
  const searchRef                   = useRef();
  const [filterPri,  setFilterPri]  = useState("all");
  const [focusMode,  setFocusMode]  = useState(false);
  const [addTaskCol, setAddTaskCol] = useState(null);
  const [modal,      setModal]      = useState(null);
  const [undoItem,   setUndoItem]   = useState(null);
  const [showAch,    setShowAch]    = useState(null);
  const [levelUp,    setLevelUp]    = useState(null);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const prevXpRef = useRef(xp);

  /* ----- Drag state ----- */
  const [draggedTask,  setDraggedTask]  = useState(null);
  const [dragOverCol,  setDragOverCol]  = useState(null);
  const [dropBeforeId, setDropBeforeId] = useState(null);

  /* ----- Persistence ----- */
  useEffect(() => localStorage.setItem("kbp-tasks",  JSON.stringify(tasks)),   [tasks]);
  useEffect(() => localStorage.setItem("kbp-cols",   JSON.stringify(columns)), [columns]);
  useEffect(() => localStorage.setItem("kbp-xp",     JSON.stringify(xp)),      [xp]);
  useEffect(() => localStorage.setItem("kbp-ach",    JSON.stringify(achieved)), [achieved]);
  useEffect(() => {
    localStorage.setItem("kbp-theme", JSON.stringify(theme));
    document.documentElement.className = theme === "light" ? "light" : "";
  }, [theme]);

  /* ----- XP award ----- */
  const awardXp = useCallback((pts) => {
    setXp(prev => {
      const next   = prev + pts;
      const before = getLevel(prev);
      const after  = getLevel(next);
      if (after.min > before.min) setLevelUp(after);
      return next;
    });
  }, []);

  /* ----- Achievement check ----- */
  const checkAchievements = useCallback((currentTasks, currentXp) => {
    const doneCount = currentTasks.filter(t => t.status === "done").length;
    ACHIEVEMENTS_DEF.forEach(def => {
      if (!achieved.includes(def.id) && def.condition(currentXp, currentTasks, doneCount)) {
        setAchieved(p => [...p, def.id]);
        setShowAch(def);
      }
    });
  }, [achieved]);

  /* ----- Task operations ----- */
  const addTask = (colId, partial) => {
    const t = {
      id:          genId(),
      title:       partial.title,
      description: partial.description || "",
      priority:    partial.priority || "medium",
      tags:        partial.tags || [],
      dueDate:     partial.dueDate || "",
      status:      colId,
      createdAt:   Date.now(),
    };
    const next = [...tasks, t];
    setTasks(next);
    setAddTaskCol(null);
    awardXp(2);
    checkAchievements(next, xp + 2);
  };

  const saveTask = (updated) => {
    const prev  = tasks.find(t => t.id === updated.id);
    const isNew = !prev;
    const next  = isNew
      ? [...tasks, {...updated, status: modal?.colId || "todo"}]
      : tasks.map(t => t.id === updated.id ? {...t,...updated} : t);
    setTasks(next);
    setModal(null);
    if (isNew) { awardXp(2); checkAchievements(next, xp + 2); }
  };

  const deleteTask = (id) => {
    const t = tasks.find(x => x.id === id);
    setTasks(p => p.filter(x => x.id !== id));
    setUndoItem(t);
  };

  const undoDelete = () => {
    if (!undoItem) return;
    setTasks(prev => [...prev, undoItem]);
    setUndoItem(null);
  };

  /* ----- Column operations ----- */
  const DEFAULT_COL_IDS = ["todo", "inprogress", "done"];

  const addColumn = (name) => {
    const duplicate = columns.some(c => c.label.toLowerCase() === name.toLowerCase());
    if (duplicate) return { error: "A column with that name already exists." };
    setColumns(p => [...p, {
      id: genId(), label: name,
      color: EXTRA_COL_COLORS[p.length % EXTRA_COL_COLORS.length],
    }]);
    return null;
  };

  const deleteColumn = (colId) => {
    if (columns.length <= 1) return;
    setColumns(p => p.filter(c => c.id !== colId));
    setTasks(p => p.filter(t => t.status !== colId));
  };

  /* ----- Drag & Drop ----- */
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverCol(null);
    setDropBeforeId(null);
  };
  const handleColDragOver  = (colId)  => setDragOverCol(colId);
  const handleCardDragOver = (taskId) => setDropBeforeId(taskId);

  const handleDrop = (e, colId) => {
    e.preventDefault();
    if (!draggedTask) return;

    const nowInDone   = colId === "done";
    const shouldReward = nowInDone && !draggedTask.xpRewarded;

    setTasks(prev => {
      const rest  = prev.filter(t => t.id !== draggedTask.id);
      const moved = { ...draggedTask, status: colId, xpRewarded: draggedTask.xpRewarded || nowInDone };
      if (dropBeforeId && dropBeforeId !== draggedTask.id) {
        const idx = rest.findIndex(t => t.id === dropBeforeId);
        if (idx !== -1) { rest.splice(idx, 0, moved); return [...rest]; }
      }
      return [...rest, moved];
    });

    if (shouldReward) {
      if (typeof confetti !== "undefined") {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.65 }, colors: ["#7c7cff","#3ddfa8","#ff9f3f"] });
      }
      awardXp(5);
      const next = tasks.map(t => t.id === draggedTask.id ? {...t, status: "done", xpRewarded: true} : t);
      checkAchievements(next, xp + 5);
    }

    setDraggedTask(null);
    setDragOverCol(null);
    setDropBeforeId(null);
  };

  /* ----- Clear Done column ----- */
  const clearDone = () => setTasks(p => p.filter(t => t.status !== "done"));

  /* ----- Keyboard shortcuts ----- */
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setModal({ task: {}, colId: "todo" }); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setModal(null); setAddTaskCol(null); setSearch(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ----- Derived / filtered ----- */
  const visibleColumns = focusMode
    ? columns.filter(c => c.id === "inprogress")
    : columns;

  const tasksForCol = (colId) => {
    return tasks.filter(t => {
      if (t.status !== colId) return false;
      const q = search.toLowerCase();
      if (q && !t.title.toLowerCase().includes(q) && !(t.tags||[]).some(tag => tag.toLowerCase().includes(q))) return false;
      if (filterPri !== "all" && t.priority !== filterPri) return false;
      return true;
    });
  };

  /* ----- Render ----- */
  return (
    <div className="app-layout">

      {/* SIDEBAR */}
      <Sidebar
        xp={xp}
        tasks={tasks}
        columns={columns}
        theme={theme}
        setTheme={setTheme}
        focusMode={focusMode}
        setFocusMode={setFocusMode}
        onNewTask={() => { setModal({ task: {}, colId: "todo" }); setMenuOpen(false); }}
        menuOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {/* SIDEBAR OVERLAY (mobile) */}
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}

      {/* MAIN AREA */}
      <div className="main-area">

        {/* TOPBAR */}
        <TopBar
          search={search}
          setSearch={setSearch}
          filterPri={filterPri}
          setFilterPri={setFilterPri}
          searchRef={searchRef}
          focusMode={focusMode}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />

        {/* FOCUS BANNER */}
        {focusMode && (
          <div className="focus-banner">
            <span>🎯 Focus Mode — showing In Progress only</span>
            <button className="btn btn-ghost" style={{padding:"2px 10px",fontSize:11}} onClick={() => setFocusMode(false)}>
              Exit
            </button>
          </div>
        )}

        {/* BOARD */}
        <div className="board-wrap">
          <div className="board">
            {visibleColumns.map((col, ci) => (
              <KanbanColumn
                key={col.id}
                col={col}
                tasks={tasksForCol(col.id)}
                isDragOver={dragOverCol === col.id && draggedTask?.status !== col.id}
                addingTask={addTaskCol}
                draggedId={draggedTask?.id}
                dropBeforeId={dropBeforeId}
                isDefault={DEFAULT_COL_IDS.includes(col.id)}
                onStartAdd={colId => setAddTaskCol(addTaskCol === colId ? null : colId)}
                onCancelAdd={() => setAddTaskCol(null)}
                onAddTask={addTask}
                onEdit={t => setModal({ task: t })}
                onDelete={deleteTask}
                onDeleteColumn={deleteColumn}
                onClearDone={clearDone}
                onColDragOver={handleColDragOver}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onCardDragOver={handleCardDragOver}
              />
            ))}
            {!focusMode && <AddColumnPanel onAdd={addColumn} />}
          </div>
        </div>
      </div>

      {/* MOBILE FAB */}
      <button className="fab-new-task" onClick={() => setModal({ task: {}, colId: "todo" })}>
        ＋
      </button>

      {/* TASK MODAL */}
      {modal && (
        <TaskModal
          task={modal.task || {}}
          onSave={saveTask}
          onClose={() => setModal(null)}
        />
      )}

      {/* UNDO TOAST */}
      {undoItem && (
        <UndoToast
          task={undoItem}
          onUndo={undoDelete}
          onDismiss={() => setUndoItem(null)}
        />
      )}

      {/* ACHIEVEMENT POP */}
      {showAch && (
        <AchievementPop
          achievement={showAch}
          onDone={() => setShowAch(null)}
        />
      )}

      {/* LEVEL UP FLASH */}
      {levelUp && (
        <LevelUpFlash
          level={levelUp}
          onDone={() => setLevelUp(null)}
        />
      )}
    </div>
  );
}

/* ================================================================
   MOUNT
   ================================================================ */
ReactDOM.createRoot(document.getElementById("root")).render(<KanbanApp />);
