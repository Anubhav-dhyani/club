import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, Download, FileSpreadsheet, LayoutDashboard, Lock, LogOut, Plus, QrCode, Settings, Upload, Users, X } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

function api(path, options = {}) {
  const token = localStorage.getItem(options.student ? 'studentToken' : 'adminToken');
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(`${API}${path}`, { ...options, headers }).then(async (res) => {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Request failed');
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? res.json() : res.blob();
  });
}

function downloadFile(path, name = 'download') {
  const token = localStorage.getItem('adminToken');
  window.open(`${API}${path}${path.includes('?') ? '&' : '?'}token=${token}`, name);
}

function App() {
  const path = window.location.pathname;
  if (path.startsWith('/club/admin')) return <AdminApp />;
  if (path.startsWith('/club/pass/')) return <PublicPass />;
  return <StudentApp />;
}

function StudentApp() {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(localStorage.getItem('studentToken') ? 'passes' : 'mobile');
  const [passes, setPasses] = useState([]);
  const [message, setMessage] = useState('');

  async function loadPasses() {
    try {
      const data = await api('/student/passes', { student: true });
      setPasses(data);
      setStep('passes');
    } catch (error) {
      setMessage(error.message);
      localStorage.removeItem('studentToken');
      setStep('mobile');
    }
  }

  useEffect(() => {
    if (step === 'passes') loadPasses();
  }, []);

  async function requestOtp(e) {
    e.preventDefault();
    setMessage('');
    await api('/auth/student/request-otp', { method: 'POST', body: JSON.stringify({ mobile }), student: true });
    setStep('otp');
    setMessage('OTP sent to your mobile number.');
  }

  async function verifyOtp(e) {
    e.preventDefault();
    const data = await api('/auth/student/verify-otp', { method: 'POST', body: JSON.stringify({ mobile, otp }), student: true });
    localStorage.setItem('studentToken', data.token);
    await loadPasses();
  }

  async function downloadPass(pass) {
    await api(`/student/passes/${pass._id}/downloaded`, { method: 'POST', body: '{}', student: true });
    window.open(pass.qrImageUrl || `/club/pass/${pass.event.slug}/${pass.token}`, '_blank');
  }

  return (
    <main className="student-shell">
      <section className="student-hero">
        <div>
          <p className="eyebrow">Event QR Pass</p>
          <h1>Download your active club passes</h1>
          <p>Login with your registered mobile number. Used passes disappear automatically after scan.</p>
        </div>
      </section>
      <section className="auth-panel">
        {message && <div className="notice">{message}</div>}
        {step === 'mobile' && (
          <form onSubmit={requestOtp}>
            <label>Mobile number</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Registered mobile" required />
            <button><Lock size={18} /> Send OTP</button>
          </form>
        )}
        {step === 'otp' && (
          <form onSubmit={verifyOtp}>
            <label>OTP</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6 digit OTP" required />
            <button><Lock size={18} /> Verify and continue</button>
          </form>
        )}
        {step === 'passes' && (
          <div className="pass-grid">
            {passes.map((pass) => (
              <article className="pass-card" key={pass._id}>
                <img src={pass.qrImageUrl || '/img/default-template.svg'} alt={pass.event.name} />
                <div>
                  <strong>{pass.event.name}</strong>
                  <span>{pass.status}</span>
                </div>
                <button onClick={() => downloadPass(pass)}><Download size={18} /> Download</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function AdminApp() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('adminUser') || 'null'));
  const [view, setView] = useState(() => {
    const savedUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
    return savedUser?.role === 'coordinator' ? 'scan' : 'dashboard';
  });
  if (!user) return <AdminLogin onLogin={(nextUser) => {
    setUser(nextUser);
    setView(nextUser.role === 'coordinator' ? 'scan' : 'dashboard');
  }} />;
  return <AdminShell user={user} view={view} setView={setView} onLogout={() => { localStorage.removeItem('adminToken'); localStorage.removeItem('adminUser'); setUser(null); }} />;
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const data = await api('/auth/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <main className="admin-login">
      <form onSubmit={submit} className="login-box">
        <QrCode size={34} />
        <h1>Club Access</h1>
        {error && <div className="notice danger">{error}</div>}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
        <button>Sign in</button>
      </form>
    </main>
  );
}

function AdminShell({ user, view, setView, onLogout }) {
  const nav = [
    ['dashboard', LayoutDashboard, 'Dashboard'],
    ['students', Users, 'Students'],
    ['qrdata', FileSpreadsheet, 'Student QR Data'],
    ['events', QrCode, 'Events'],
    ['scan', Camera, 'Scan'],
    ['team', Users, 'Team'],
    ['settings', Settings, 'Settings']
  ].filter(([key]) => {
    if (key === 'dashboard') return user.role !== 'coordinator';
    if (key === 'students') return user.role !== 'coordinator';
    if (key === 'qrdata') return user.role !== 'coordinator';
    if (key === 'events') return user.role === 'super_admin';
    if (key === 'scan') return user.role === 'coordinator';
    if (key === 'team') return user.role === 'super_admin';
    return true;
  });
  return (
    <main className="admin-shell">
      <aside>
        <div className="brand"><QrCode /> <span>Club QR</span></div>
        {nav.map(([key, Icon, label]) => <button className={view === key ? 'active' : ''} onClick={() => setView(key)} key={key}><Icon size={18} /> {label}</button>)}
        <button onClick={onLogout}><LogOut size={18} /> Logout</button>
      </aside>
      <section className="workspace">
        <header><div><p>{user.role.replace('_', ' ')}</p><h1>{view}</h1></div></header>
        {view === 'dashboard' && <Dashboard />}
        {view === 'students' && <Students />}
        {view === 'qrdata' && <QrData />}
        {view === 'events' && <Events />}
        {view === 'scan' && <Scanner />}
        {view === 'team' && <Team />}
        {view === 'settings' && <SettingsView />}
      </section>
    </main>
  );
}

function useEvents() {
  const [events, setEvents] = useState([]);
  const load = () => api('/admin/events').then(setEvents).catch(console.error);
  useEffect(() => {
    load();
  }, []);
  return { events, load };
}

function Dashboard() {
  const { events } = useEvents();
  const [event, setEvent] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => { api(`/admin/dashboard${event ? `?event=${event}` : ''}`).then(setData); }, [event]);
  if (!data) return <div className="loading">Loading dashboard...</div>;
  const cards = [['Total', data.total], ['Generated', data.generated], ['Downloaded', data.downloaded], ['Used', data.used], ['Pending', data.pending]];
  return (
    <div className="stack">
      <Filter events={events} value={event} setValue={setEvent} />
      <div className="metric-grid">{cards.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="split">
        <Table title="Event wise" rows={data.byEvent} cols={['event', 'total', 'used', 'pending']} />
        <Table title="Recent scans" rows={data.scans.map((s) => ({ name: s.name, event: s.event?.name, coordinator: s.usedBy?.name, usedAt: new Date(s.usedAt).toLocaleString() }))} cols={['name', 'event', 'coordinator', 'usedAt']} />
      </div>
      <Table title="Excel batches" rows={data.batches.map((b) => ({ file: b.fileName, event: b.event?.name, rows: b.importedRows, type: b.type }))} cols={['file', 'event', 'rows', 'type']} />
    </div>
  );
}

function Students() {
  const { events } = useEvents();
  const [event, setEvent] = useState('');
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', mobile: '', course: '', semester: '' });
  const load = () => api(`/admin/students${event ? `?event=${event}` : ''}`).then(setRows);
  useEffect(() => { load(); }, [event]);
  async function addStudent(e) {
    e.preventDefault();
    await api('/admin/students', { method: 'POST', body: JSON.stringify({ ...form, event }) });
    setForm({ name: '', email: '', mobile: '', course: '', semester: '' });
    setShowAdd(false);
    load();
  }
  async function generate() {
    await api(`/admin/students/generate/${event}`, { method: 'POST', body: '{}' });
    load();
  }
  async function saveEdit(e) {
    e.preventDefault();
    await api(`/admin/students/${editing._id}`, { method: 'PATCH', body: JSON.stringify(editing) });
    setEditing(null);
    load();
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <Filter events={events} value={event} setValue={setEvent} />
        <button onClick={() => setShowAdd(true)}><Plus size={16} /> Add Student</button>
        <button onClick={() => setShowBulk(true)}><Upload size={16} /> Bulk Upload</button>
        <button onClick={generate} disabled={!event}><QrCode size={16} /> Generate QR</button>
        <button onClick={() => downloadFile(`/admin/students/export${event ? `?event=${event}` : ''}`, 'export')}><Download size={16} /> Export Excel</button>
        <button onClick={() => downloadFile(`/admin/students/zip/${event}`, 'zip')} disabled={!event}><Download size={16} /> Bulk QR ZIP</button>
      </div>
      <Modal open={showAdd} title="Add Student" onClose={() => setShowAdd(false)}>
        <form className="modal-form" onSubmit={addStudent}>
          <select value={event} onChange={(e) => setEvent(e.target.value)} required>
            <option value="">Select event</option>
            {events.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
          {['name', 'email', 'mobile', 'course', 'semester'].map((field) => (
            <input key={field} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder={field} required={['name', 'mobile'].includes(field)} />
          ))}
          <button><Plus size={16} /> Add Student</button>
        </form>
      </Modal>
      <BulkUploadModal
        open={showBulk}
        title="Bulk Upload Students"
        events={events}
        event={event}
        setEvent={setEvent}
        previewPath="/admin/students/preview"
        uploadPath="/admin/students/import"
        templatePath="/admin/students/import-template"
        onClose={() => setShowBulk(false)}
        onDone={load}
      />
      {editing && (
        <form className="inline-form edit-form" onSubmit={saveEdit}>
          {['name', 'email', 'mobile', 'course', 'semester'].map((field) => (
            <input key={field} value={editing[field] || ''} onChange={(e) => setEditing({ ...editing, [field]: e.target.value })} placeholder={field} />
          ))}
          <button>Save</button>
          <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
        </form>
      )}
      <section className="table-wrap">
        <h2>Students</h2>
        <table>
          <thead><tr>{['name', 'mobile', 'event', 'course', 'sem', 'generated qr', 'uploaded qr', 'edit'].map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s._id}>
                <td>{s.name}</td>
                <td>{s.mobile}</td>
                <td>{s.event?.name}</td>
                <td>{s.course || '-'}</td>
                <td>{s.semester || '-'}</td>
                <td>{s.localQrImageUrl ? 'generated' : 'not generated'}</td>
                <td>{s.qrImageUrl ? 'uploaded' : 'not uploaded'}</td>
                <td><button className="icon-btn" onClick={() => setEditing(s)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function QrData() {
  const { events } = useEvents();
  const [event, setEvent] = useState('');
  const [rows, setRows] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const load = () => api(`/admin/students${event ? `?event=${event}` : ''}`).then((data) => setRows(data.filter((row) => row.localQrImageUrl || row.qrImageUrl || row.qrUrl)));
  useEffect(() => { load(); }, [event]);
  return (
    <div className="stack">
      <div className="toolbar">
        <Filter events={events} value={event} setValue={setEvent} />
        <button onClick={() => setShowImport(true)}><Upload size={16} /> Upload QR Data</button>
        <button onClick={() => downloadFile('/admin/students/qr-data-template', 'qr-template')}><Download size={16} /> Download Template</button>
        <button onClick={() => downloadFile(`/admin/students/export${event ? `?event=${event}` : ''}`, 'qr-export')}><FileSpreadsheet size={16} /> Export QR Data</button>
      </div>
      <BulkUploadModal
        open={showImport}
        title="Upload Student QR Data"
        events={events}
        event={event}
        setEvent={setEvent}
        previewPath="/admin/students/qr-data-preview"
        uploadPath="/admin/students/import-qr-data"
        templatePath="/admin/students/qr-data-template"
        onClose={() => setShowImport(false)}
        onDone={load}
      />
      <Table
        title="Student QR Data"
        rows={rows.map((s) => ({
          name: s.name,
          mobile: s.mobile,
          event: s.event?.name,
          token: s.token,
          page: s.qrUrl ? 'ready' : '-',
          generated: s.localQrImageUrl ? 'ready' : '-',
          uploaded: s.qrImageUrl ? 'ready' : '-',
          status: s.status
        }))}
        cols={['name', 'mobile', 'event', 'token', 'page', 'generated', 'uploaded', 'status']}
      />
    </div>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function BulkUploadModal({ open, title, events, event, setEvent, previewPath, uploadPath, templatePath, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setMessage('');
    }
  }, [open]);
  async function chooseFile(nextFile) {
    setFile(nextFile);
    setMessage('');
    if (!nextFile) return;
    const body = new FormData();
    body.append('file', nextFile);
    const data = await api(previewPath, { method: 'POST', body });
    setPreview(data);
  }
  async function uploadSelected() {
    if (!file || !event) return;
    const body = new FormData();
    body.append('event', event);
    body.append('file', file);
    const result = await api(uploadPath, { method: 'POST', body });
    setMessage(`Uploaded ${result.imported || 0} rows.`);
    onDone?.();
  }
  const cols = Object.keys(preview?.rows?.[0] || {});
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="modal-form">
        <select value={event} onChange={(e) => setEvent(e.target.value)} required>
          <option value="">Select event</option>
          {events.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
        </select>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={() => downloadFile(templatePath, 'template')}><Download size={16} /> Template</button>
          <label className="file-picker"><Upload size={16} /> Choose Excel <input type="file" accept=".xlsx,.xls" onChange={(e) => chooseFile(e.target.files[0])} /></label>
          <button type="button" disabled={!event || !file} onClick={uploadSelected}><Upload size={16} /> Upload</button>
        </div>
        {file && <div className="notice">Selected {file.name}</div>}
        {message && <div className="notice">{message}</div>}
        {preview && <Table title={`Preview ${preview.totalRows} rows`} rows={preview.rows} cols={cols} />}
      </div>
    </Modal>
  );
}

function Events() {
  const { events, load } = useEvents();
  const [templates, setTemplates] = useState([]);
  const [templateError, setTemplateError] = useState('');
  const [form, setForm] = useState({ name: '', templateFile: 'default-template.svg' });
  useEffect(() => {
    api('/admin/templates').then((files) => {
      setTemplates(files);
      setTemplateError('');
      if (files.length && !files.includes(form.templateFile)) {
        setForm((current) => ({ ...current, templateFile: files[0] }));
      }
    }).catch((error) => setTemplateError(error.message));
  }, []);
  async function submit(e) {
    e.preventDefault();
    await api('/admin/events', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', templateFile: templates[0] || 'default-template.svg' });
    load();
  }
  return (
    <div className="stack">
      <form className="event-create" onSubmit={submit}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Event name" required />
        <button disabled={!form.templateFile}><Plus size={16} /> Create Event</button>
      </form>
      <section className="template-picker">
        <h2>Choose Template</h2>
        {templateError && <div className="notice danger">{templateError}</div>}
        {!templateError && !templates.length && <div className="notice">No template images found in frontend/public/img.</div>}
        <div className="template-grid">
          {templates.map((template) => (
            <button
              type="button"
              className={form.templateFile === template ? 'template-card selected' : 'template-card'}
              key={template}
              onClick={() => setForm({ ...form, templateFile: template })}
            >
              <img src={`/img/${template}`} alt={template} />
              <span>{template}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="event-grid">{events.map((event) => <article key={event._id}><img src={`/img/${event.templateFile}`} /><strong>{event.name}</strong><span>{event.templateFile}</span></article>)}</div>
    </div>
  );
}

function Scanner() {
  const { events } = useEvents();
  const [event, setEvent] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!event) return;
    const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: 260 }, false);
    scanner.render(async (decodedText) => {
      const token = decodedText.split('/').pop();
      try {
        const data = await api('/scan/verify', { method: 'POST', body: JSON.stringify({ token, eventId: event }) });
        setResult(data.pass);
        setMessage(data.message);
      } catch (error) {
        setMessage(error.message);
      }
    });
    return () => scanner.clear().catch(() => {});
  }, [event]);
  return (
    <div className="stack">
      <Filter events={events} value={event} setValue={setEvent} />
      <div id="reader" className="reader" />
      {message && <div className="notice">{message}</div>}
      {result && <Table title="Student details" rows={[{ name: result.name, mobile: result.mobile, course: result.course, semester: result.semester, status: result.status }]} cols={['name', 'mobile', 'course', 'semester', 'status']} />}
    </div>
  );
}

function Team() {
  const { events } = useEvents();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'coordinator', assignedEvents: [] });
  const load = () => api('/admin/users').then(setUsers);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (events.length && !form.assignedEvents.length) {
      setForm((current) => ({ ...current, assignedEvents: events.map((event) => event._id) }));
    }
  }, [events.length]);
  async function submit(e) {
    e.preventDefault();
    const permissions = { dashboard: true, scan: form.role === 'coordinator', students: form.role === 'admin' };
    const data = await api('/admin/users', { method: 'POST', body: JSON.stringify({ ...form, permissions }) });
    alert(`Temporary password: ${data.temporaryPassword}`);
    setShowAdd(false);
    setForm({ name: '', email: '', role: 'coordinator', assignedEvents: events.map((item) => item._id) });
    load();
  }
  async function savePermissions(e) {
    e.preventDefault();
    await api(`/admin/users/${editingUser._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ assignedEvents: editingUser.assignedEvents.map((event) => typeof event === 'string' ? event : event._id) })
    });
    setEditingUser(null);
    load();
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <button onClick={() => setShowAdd(true)}><Plus size={16} /> Add User</button>
        <button onClick={() => setShowBulk(true)}><Upload size={16} /> Bulk Upload</button>
        <button onClick={() => downloadFile('/admin/users/import-template', 'team-template')}><Download size={16} /> Download Template</button>
      </div>
      <Modal open={showAdd} title="Add Admin or Coordinator" onClose={() => setShowAdd(false)}>
        <form className="modal-form" onSubmit={submit}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" required />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="coordinator">Coordinator</option><option value="admin">Sub Admin</option></select>
          <EventMultiSelect events={events} value={form.assignedEvents} onChange={(assignedEvents) => setForm({ ...form, assignedEvents })} />
          <button><Plus size={16} /> Add User</button>
        </form>
      </Modal>
      <TeamBulkModal open={showBulk} events={events} onClose={() => setShowBulk(false)} onDone={load} />
      <Modal open={!!editingUser} title="Event Permissions" onClose={() => setEditingUser(null)}>
        {editingUser && (
          <form className="modal-form" onSubmit={savePermissions}>
            <strong>{editingUser.name}</strong>
            <span className="muted">{editingUser.email}</span>
            <EventMultiSelect
              events={events}
              value={editingUser.assignedEvents.map((event) => typeof event === 'string' ? event : event._id)}
              onChange={(assignedEvents) => setEditingUser({ ...editingUser, assignedEvents })}
            />
            <button>Save Permissions</button>
          </form>
        )}
      </Modal>
      <section className="table-wrap">
        <h2>Team</h2>
        <table>
          <thead><tr>{['name', 'email', 'role', 'events', 'active', 'actions'].map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.assignedEvents?.map((item) => item.name).join(', ') || '-'}</td>
                <td>{u.isActive ? 'yes' : 'no'}</td>
                <td><button className="icon-btn" onClick={() => setEditingUser(u)}>Permissions</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function EventMultiSelect({ events, value, onChange }) {
  return (
    <div className="check-grid">
      {events.map((event) => (
        <label key={event._id}>
          <input
            type="checkbox"
            checked={value.includes(event._id)}
            onChange={(e) => {
              if (e.target.checked) onChange([...value, event._id]);
              else onChange(value.filter((id) => id !== event._id));
            }}
          />
          {event.name}
        </label>
      ))}
    </div>
  );
}

function TeamBulkModal({ open, events, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [assignedEvents, setAssignedEvents] = useState([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (open) setAssignedEvents(events.map((event) => event._id));
    if (!open) {
      setFile(null);
      setPreview(null);
      setMessage('');
    }
  }, [open, events.length]);
  async function chooseFile(nextFile) {
    setFile(nextFile);
    if (!nextFile) return;
    const body = new FormData();
    body.append('file', nextFile);
    const data = await api('/admin/users/preview', { method: 'POST', body });
    setPreview(data);
  }
  async function uploadSelected() {
    const body = new FormData();
    body.append('file', file);
    body.append('assignedEvents', JSON.stringify(assignedEvents));
    const result = await api('/admin/users/import', { method: 'POST', body });
    setMessage(`Uploaded ${result.imported || 0} users.`);
    onDone?.();
  }
  const cols = Object.keys(preview?.rows?.[0] || {});
  return (
    <Modal open={open} title="Bulk Upload Team Users" onClose={onClose}>
      <div className="modal-form">
        <EventMultiSelect events={events} value={assignedEvents} onChange={setAssignedEvents} />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={() => downloadFile('/admin/users/import-template', 'team-template')}><Download size={16} /> Template</button>
          <label className="file-picker"><Upload size={16} /> Choose Excel <input type="file" accept=".xlsx,.xls" onChange={(e) => chooseFile(e.target.files[0])} /></label>
          <button type="button" disabled={!file} onClick={uploadSelected}><Upload size={16} /> Upload</button>
        </div>
        {file && <div className="notice">Selected {file.name}</div>}
        {message && <div className="notice">{message}</div>}
        {preview && <Table title={`Preview ${preview.totalRows} rows`} rows={preview.rows} cols={cols} />}
      </div>
    </Modal>
  );
}

function SettingsView() {
  const [form, setForm] = useState({ oldPassword: '', newPassword: '' });
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    await api('/auth/admin/change-password', { method: 'POST', body: JSON.stringify(form) });
    setMessage('Password changed.');
    setForm({ oldPassword: '', newPassword: '' });
  }
  return (
    <form className="settings-form" onSubmit={submit}>
      {message && <div className="notice">{message}</div>}
      <input type="password" value={form.oldPassword} onChange={(e) => setForm({ ...form, oldPassword: e.target.value })} placeholder="Current password" />
      <input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} placeholder="New password" />
      <button><Lock size={16} /> Change password</button>
    </form>
  );
}

function PublicPass() {
  const [, , , eventSlug, token] = window.location.pathname.split('/');
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/public/pass/${eventSlug}/${token}`).then(setPass).catch((err) => setError(err.message)); }, []);
  if (error) return <main className="public-pass"><div className="notice danger">{error}</div></main>;
  if (!pass) return <main className="public-pass">Loading pass...</main>;
  return <main className="public-pass"><img src={pass.qrImageUrl} /><a className="download-link" href={pass.qrImageUrl} download><Download size={18} /> Download pass</a></main>;
}

function Filter({ events, value, setValue }) {
  return <select className="event-filter" value={value} onChange={(e) => setValue(e.target.value)}><option value="">All events</option>{events.map((event) => <option key={event._id} value={event._id}>{event.name}</option>)}</select>;
}

function Table({ title, rows, cols }) {
  return <section className="table-wrap"><h2>{title}</h2><table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{cols.map((c) => <td key={c}>{row[c] || '-'}</td>)}</tr>)}</tbody></table></section>;
}

createRoot(document.getElementById('root')).render(<App />);
