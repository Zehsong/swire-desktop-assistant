import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import type { CapturePreview, Reference, State } from './model';
import './style.css';
const time = (date: string) =>
  new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
type Page = 'Workspace' | 'Timeline' | 'Activity' | 'Settings';
function App() {
  const [data, setData] = useState<State>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>('Workspace');
  const [project, setProject] = useState('');
  const [newProject, setNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [refs, setRefs] = useState<Reference[]>([]);
  const [refLabel, setRefLabel] = useState('');
  const [refValue, setRefValue] = useState('');
  const [message, setMessage] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureExpiry, setCaptureExpiry] = useState(0);
  const [previews, setPreviews] = useState<CapturePreview[]>([]);
  const [capture, setCapture] = useState<CapturePreview>();
  const [viewImage, setViewImage] = useState<string>();
  const [notice, setNotice] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const captureRequest = useRef(0);
  useEffect(() => {
    api
      .load()
      .then((state) => {
        setData(state);
        setProject(state.projects[0]?.id ?? '');
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!captureExpiry) return;
    const timer = setTimeout(
      () => {
        captureRequest.current++;
        setCapture(undefined);
        setPreviews([]);
        setCaptureOpen(false);
        setCaptureExpiry(0);
        setError('Capture preview expired. Preview again to attach an image.');
        void api.cancelCapture().catch(() => {});
      },
      Math.max(0, captureExpiry - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [captureExpiry]);
  const modal = composer || newProject || captureOpen || !!viewImage;
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function discardCapture() {
    captureRequest.current++;
    setCapture(undefined);
    setPreviews([]);
    setCaptureOpen(false);
    setCaptureExpiry(0);
    await api.cancelCapture();
  }
  function closeDialog() {
    if (busy) return;
    void run(async () => {
      await discardCapture();
      setComposer(false);
      setNewProject(false);
      setViewImage(undefined);
    });
  }
  function openComposer() {
    setTitle('');
    setNotes('');
    setRefs([]);
    setRefLabel('');
    setRefValue('');
    setCapture(undefined);
    setComposer(true);
  }
  const checkpoints =
    data?.checkpoints.filter((c) => c.projectId === project) ?? [];
  const projectTitle =
    data?.projects.find((p) => p.id === project)?.name ?? 'Your first project';
  if (!data)
    return (
      <main className="loading">
        <span className="eyebrow">SWIRE / LOCAL WORKSPACE</span>
        <h1>
          {error ? 'Your data needs attention' : 'Opening your workspace…'}
        </h1>
        <p role="alert">{error}</p>
        {error && <button onClick={() => location.reload()}>Retry</button>}
      </main>
    );
  return (
    <div className={`app ${data.settings.compact ? 'compact' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S/</span>
          <div>
            SWIRE<small>DESKTOP COMPANION</small>
          </div>
        </div>
        <div className="sidebar-section">OPERATIONS / 01</div>
        <nav>
          {(['Workspace', 'Timeline', 'Activity', 'Settings'] as Page[]).map(
            (item, i) => (
              <button
                key={item}
                className={page === item ? 'nav active' : 'nav'}
                onClick={() => setPage(item)}
              >
                <span>0{i + 1}</span>
                {item}
                <b>↗</b>
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-section project-heading">
          PROJECTS
          <button
            aria-label="Create project"
            onClick={() => setNewProject(true)}
          >
            +
          </button>
        </div>
        <div className="project-list">
          {data.projects.map((p) => (
            <button
              key={p.id}
              className={project === p.id ? 'project selected' : 'project'}
              onClick={() => {
                setProject(p.id);
                setPage('Workspace');
              }}
            >
              <span>◇</span>
              {p.name}
            </button>
          ))}
          {!data.projects.length && (
            <p className="muted sidebar-empty">
              A clear place for your next piece of work.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" /> LOCAL STORAGE
          <small>
            {api.desktop
              ? 'Desktop · on this device'
              : 'Browser preview · separate data'}
          </small>
          <span className="version">SWIRE SYSTEM / v0.1</span>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <span>
            PERSONAL OPERATIONS <i>/</i> {page.toUpperCase()}
          </span>
          <span className="local-badge">● OFFLINE BY DESIGN</span>
        </header>
        {!api.desktop && (
          <div className="preview-banner">
            Browser preview — data stays in this browser. Native file selection,
            capture and always-on-top require Electron.
          </div>
        )}
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'Workspace'
                  ? 'YOUR WORK, HELD TOGETHER'
                  : 'SWIRE / PERSONAL OPERATIONS'}
              </span>
              <h1>{page === 'Workspace' ? 'Command desk' : page}</h1>
              <p className="muted">
                {page === 'Workspace'
                  ? 'Keep the context. Pick up where you left off.'
                  : page === 'Timeline'
                    ? 'A deliberate record of progress, one checkpoint at a time.'
                    : page === 'Activity'
                      ? 'A local record of actions you chose to take.'
                      : 'Make this workspace feel like yours.'}
              </p>
            </div>
            {(page === 'Workspace' || page === 'Timeline') && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  data.projects.length ? openComposer() : setNewProject(true)
                }
              >
                ＋ {data.projects.length ? 'New checkpoint' : 'Create project'}
              </button>
            )}
          </div>
          {error && !modal && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </div>
          )}
          {page === 'Workspace' && (
            <div className="workspace-grid">
              <section className="panel companion">
                <div className="panel-label">
                  <span>COMPANION / STANDBY</span>
                  <span className="yellow">01</span>
                </div>
                <div className="companion-visual">
                  <div className="radar" />
                  <div className="monogram">
                    S<span>///</span>
                  </div>
                  <span className="visual-coordinate">
                    SW—01
                    <br />
                    LOCAL UNIT
                  </span>
                  <span className="visual-note">施怀雅</span>
                </div>
                <div className="companion-info">
                  <span className="eyebrow">YOUR DESKTOP COMPANION</span>
                  <h2>
                    {data.settings.name} <span className="muted">/ 施怀雅</span>
                  </h2>
                  <p>
                    Room to think.
                    <br />A place to return to.
                  </p>
                  <div className="connection">
                    <span className="status-dot" />
                    AI provider not connected
                  </div>
                  <p className="fine">
                    Original placeholder emblem. No game artwork.
                  </p>
                </div>
              </section>
              <section className="panel chat">
                <div className="panel-label">
                  <span>COMPANION CHANNEL</span>
                  <span className="tag">LOCAL NOTES</span>
                </div>
                <div className="chat-body">
                  <div className="system-note">
                    <span className="eyebrow">CHANNEL STATUS</span>
                    <p>
                      No AI provider is configured. You can leave yourself a
                      note here; it stays on this device and receives no AI
                      reply.
                    </p>
                  </div>
                  {!data.messages.length && (
                    <div className="chat-empty">
                      <span>↳</span>
                      <h3>Leave a thought for later.</h3>
                      <p>What matters next? What should you remember?</p>
                    </div>
                  )}
                  {data.messages.map((m) => (
                    <article className="message" key={m.id}>
                      <div>
                        YOU <time>{time(m.createdAt)}</time>
                      </div>
                      <p>{m.text}</p>
                    </article>
                  ))}
                </div>
                <form
                  className="chat-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      setData(await api.message(message));
                      setMessage('');
                    });
                  }}
                >
                  <label className="sr-only" htmlFor="message">
                    Personal note
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    maxLength={4000}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Leave a local note…"
                    rows={2}
                  />
                  <div>
                    <span>LOCAL ONLY · NO AI RESPONSE</span>
                    <button
                      className="primary"
                      disabled={busy || !message.trim()}
                    >
                      Save note ↗
                    </button>
                  </div>
                </form>
              </section>
              <section className="panel recent">
                <div className="panel-label">
                  <span>ACTIVE PROJECT</span>
                  <button
                    className="text-button"
                    onClick={() => setPage('Timeline')}
                  >
                    Full timeline ↗
                  </button>
                </div>
                <div className="project-summary">
                  <div>
                    <h2>{projectTitle}</h2>
                    <p className="muted">
                      {checkpoints.length} saved checkpoints
                    </p>
                  </div>
                  <span className="big-number">
                    {String(checkpoints.length).padStart(2, '0')}
                  </span>
                </div>
                {checkpoints.length ? (
                  checkpoints.slice(0, 2).map((c) => (
                    <div className="recent-item" key={c.id}>
                      <span className="timeline-dot" />
                      <div>
                        <h3>{c.title}</h3>
                        <p className="muted">
                          {time(c.createdAt)} · {c.references.length} references
                          {c.capture ? ' · capture attached' : ''}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-inline">
                    <p>Make progress worth returning to.</p>
                    <span className="muted">
                      Save a note, resource references and an optional screen
                      capture.
                    </span>
                  </div>
                )}
              </section>
            </div>
          )}
          {page === 'Timeline' && (
            <section className="panel timeline-panel">
              <div className="panel-label">
                <span>PROJECT RECORD</span>
                <select
                  aria-label="Timeline project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {!checkpoints.length && (
                <div className="empty">
                  <span>◇</span>
                  <h2>No checkpoints yet</h2>
                  <p className="muted">
                    Save your current context from the command desk.
                  </p>
                </div>
              )}
              <div className="timeline">
                {checkpoints.map((c) => (
                  <article className="checkpoint" key={c.id}>
                    <time>{time(c.createdAt)}</time>
                    <div className="checkpoint-card">
                      <span className="eyebrow">
                        CHECKPOINT / {c.id.slice(0, 6)}
                      </span>
                      <h2>{c.title}</h2>
                      <p className="note-text">
                        {c.notes || 'No additional notes.'}
                      </p>
                      {c.references.length > 0 && (
                        <div className="references">
                          <span className="eyebrow">
                            SELECTED REFERENCES · CONTENTS NOT READ
                          </span>
                          {c.references.map((ref, i) => (
                            <div key={i}>
                              <b>↗ {ref.label}</b>
                              <code>{ref.value}</code>
                            </div>
                          ))}
                        </div>
                      )}
                      {c.capture && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () =>
                              setViewImage(
                                await api.readCapture(c.capture!.filename),
                              ),
                            )
                          }
                        >
                          View saved capture · {c.capture.source}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {page === 'Activity' && (
            <section className="panel">
              <div className="panel-label">
                <span>ACTIVITY LOG</span>
                <span>LAST 500 ACTIONS</span>
              </div>
              {!data.activity.length && (
                <div className="empty">
                  <h2>A fresh start</h2>
                  <p className="muted">Your saved actions will appear here.</p>
                </div>
              )}
              {data.activity.map((a) => (
                <div className="activity-row" key={a.id}>
                  <span className="yellow">↗</span>
                  <p>{a.text}</p>
                  <time>{time(a.createdAt)}</time>
                </div>
              ))}
            </section>
          )}
          {page === 'Settings' && (
            <section className="panel settings">
              <div className="panel-label">COMPANION PREFERENCES</div>
              <form
                key={JSON.stringify(data.settings)}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void run(async () => {
                    setData(
                      await api.settings({
                        name: String(form.get('name')),
                        compact: form.has('compact'),
                        alwaysOnTop: form.has('alwaysOnTop'),
                      }),
                    );
                    setNotice('Settings saved on this device.');
                  });
                }}
              >
                <label>
                  Companion name
                  <input
                    name="name"
                    defaultValue={data.settings.name}
                    maxLength={40}
                    required
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="compact"
                    defaultChecked={data.settings.compact}
                  />
                  Compact spacing
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="alwaysOnTop"
                    defaultChecked={data.settings.alwaysOnTop}
                    disabled={!api.desktop}
                  />
                  Keep Swire above other windows{' '}
                  {!api.desktop && '(desktop only)'}
                </label>
                <button className="primary" disabled={busy}>
                  Save settings
                </button>
              </form>
              <div className="settings-info">
                <h3>Private by default</h3>
                <p>
                  Checkpoints, notes and screenshots stay locally. Referenced
                  files are not read or uploaded. Screen capture happens only
                  after you request it and is saved only with a checkpoint.
                </p>
                <h3>AI connection / unavailable in v0.1</h3>
                <p>
                  No provider, API key or network chat is configured. The
                  companion channel is a personal notebook. Provider setup and
                  explicit sending consent are future work.
                </p>
                <h3>Storage</h3>
                <p>
                  {api.desktop
                    ? 'Desktop data is stored under the Swire user-data folder. See README for backup and recovery.'
                    : 'This browser preview uses localStorage. It does not share data with the installed desktop app.'}
                </p>
                <p>
                  Local files are not encrypted. Keep sensitive content off
                  shared devices.
                </p>
              </div>
            </section>
          )}
          <footer>
            <span>SWIRE / PERSONAL WORKSPACE</span>
            <span>MANUAL CHECKPOINTS. CLEAR INTENT.</span>
          </footer>
        </main>
      </div>
      <dialog
        aria-label={
          viewImage
            ? 'Saved capture'
            : captureOpen
              ? 'Screen capture preview'
              : newProject
                ? 'Create project'
                : 'New checkpoint'
        }
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          closeDialog();
        }}
      >
        {modal && (
          <>
            <div className="dialog-header">
              <span className="eyebrow">
                {viewImage
                  ? 'SAVED CAPTURE'
                  : captureOpen
                    ? 'EXPLICIT SCREEN CAPTURE'
                    : newProject
                      ? 'NEW PROJECT'
                      : 'SAVE YOUR CONTEXT'}
              </span>
              <button
                type="button"
                aria-label="Close dialog"
                disabled={busy}
                onClick={closeDialog}
              >
                ×
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {viewImage ? (
              <img
                className="capture-image"
                alt="Saved checkpoint screen capture"
                src={viewImage}
              />
            ) : captureOpen ? (
              <div>
                <h2>Choose a screen preview</h2>
                <p className="muted">
                  These still images are held in memory. Nothing is saved until
                  you save the checkpoint. Previews expire after 10 minutes.
                </p>
                {!previews.length && (
                  <p>No screen preview is available. Cancel and try again.</p>
                )}
                <div className="capture-options">
                  {previews.map((p) => (
                    <button
                      key={p.token}
                      onClick={() => {
                        setCapture(p);
                        setPreviews([]);
                        setCaptureOpen(false);
                      }}
                    >
                      <img src={p.image} alt={`Preview of ${p.name}`} />
                      <span>Use {p.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => void run(discardCapture)}>
                  Cancel capture
                </button>
              </div>
            ) : newProject ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const state = await api.project(projectName);
                    setData(state);
                    setProject(state.projects.at(-1)!.id);
                    setProjectName('');
                    setNewProject(false);
                    setNotice(
                      'Project created. Ready for your first checkpoint.',
                    );
                  });
                }}
              >
                <h2>A place for your work</h2>
                <label>
                  Project name
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Desktop companion"
                  />
                </label>
                <div className="dialog-actions">
                  <button type="button" disabled={busy} onClick={closeDialog}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !projectName.trim()}
                  >
                    Create project
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    setData(
                      await api.checkpoint(
                        { projectId: project, title, notes, references: refs },
                        capture?.token,
                      ),
                    );
                    setComposer(false);
                    setCapture(undefined);
                    setCaptureExpiry(0);
                    setNotice(
                      'Checkpoint saved. Your context is ready when you return.',
                    );
                  });
                }}
              >
                <h2>New checkpoint</h2>
                <label>
                  Project
                  <select
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    {data.projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Checkpoint title
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    placeholder="What did you reach?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    rows={4}
                    maxLength={12000}
                    placeholder="Progress, decisions and the next step…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <div className="reference-heading">
                  <span className="eyebrow">
                    RESOURCE REFERENCES ({refs.length}/30)
                  </span>
                  <button
                    type="button"
                    disabled={!api.desktop || busy || refs.length >= 30}
                    onClick={() =>
                      void run(async () => {
                        const selected = await api.pickFiles();
                        setRefs((current) =>
                          [...current, ...selected].slice(0, 30),
                        );
                      })
                    }
                  >
                    Select files…
                  </button>
                </div>
                <p className="fine">
                  Save a path or URL as a reference. File contents are never
                  read.
                </p>
                <div className="reference-input">
                  <input
                    aria-label="Reference label"
                    maxLength={200}
                    placeholder="Label"
                    value={refLabel}
                    onChange={(e) => setRefLabel(e.target.value)}
                  />
                  <input
                    aria-label="Reference path or URL"
                    maxLength={2000}
                    placeholder="Path or URL"
                    value={refValue}
                    onChange={(e) => setRefValue(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={
                      !refLabel.trim() || !refValue.trim() || refs.length >= 30
                    }
                    onClick={() => {
                      setRefs([
                        ...refs,
                        { label: refLabel.trim(), value: refValue.trim() },
                      ]);
                      setRefLabel('');
                      setRefValue('');
                    }}
                  >
                    Add
                  </button>
                </div>
                {refs.map((r, i) => (
                  <div className="reference-chip" key={i}>
                    <span>
                      {r.label}
                      <small>{r.value}</small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${r.label}`}
                      onClick={() =>
                        setRefs(refs.filter((_, index) => index !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="capture-section">
                  {capture ? (
                    <>
                      <img
                        alt="Selected screen capture preview"
                        src={capture.image}
                      />
                      <div>
                        <span>{capture.name} · ready to save</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(discardCapture)}
                        >
                          Remove capture
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        Optional screen capture
                        <br />
                        <span className="fine">
                          Clicking previews your current screens once. Review or
                          cancel before saving.
                        </span>
                      </p>
                      <button
                        type="button"
                        disabled={!api.desktop || busy}
                        onClick={() =>
                          void run(async () => {
                            const request = ++captureRequest.current;
                            const images = await api.previewCapture();
                            if (request === captureRequest.current) {
                              setCaptureExpiry(Date.now() + 10 * 60 * 1000);
                              setPreviews(images);
                              setCaptureOpen(true);
                            }
                          })
                        }
                      >
                        {api.desktop ? 'Capture & preview…' : 'Desktop only'}
                      </button>
                    </>
                  )}
                </div>
                <div className="dialog-actions">
                  <button type="button" disabled={busy} onClick={closeDialog}>
                    Cancel
                  </button>
                  <button className="primary" disabled={busy || !title.trim()}>
                    {busy ? 'Saving…' : 'Save checkpoint'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
