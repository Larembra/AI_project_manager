import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useState, useEffect } from 'react';
import { api } from '../api.js';

const Icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  org: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  advisor: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
      <path d="M6 21v-2a6 6 0 0 1 12 0v2"/>
      <circle cx="12" cy="11" r="1"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
    </svg>
  ),
  blackjack: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="18" rx="2"/>
      <path d="M7 7h.01M13 17h.01M10 12l2-3 2 3-2 3-2-3z"/>
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M12 2l2.4 7.2L21.6 12l-7.2 2.4L12 21.6l-2.4-7.2L2.4 12l7.2-2.4z"/>
    </svg>
  ),
};

const ORG_CATEGORIES = [
  { value: 'it', label: 'IT' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'hr', label: 'HR' },
  { value: 'finance', label: 'Финансы' },
  { value: 'sales', label: 'Продажи' },
  { value: 'education', label: 'Образование' },
  { value: 'healthcare', label: 'Здравоохранение' },
  { value: 'nonprofit', label: 'НКО' },
  { value: 'other', label: 'Другое' }
];

function roleLabel(role) {
  if (role === 'admin') return 'Администратор платформы';
  if (role === 'user') return 'Пользователь';
  return 'Гость';
}

function getInitials(name) {
  return name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [newOrgCategory, setNewOrgCategory] = useState('other');
  const [newOrgWebsite, setNewOrgWebsite] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');
  const [newOrgAddress, setNewOrgAddress] = useState('');
  const [newOrgSize, setNewOrgSize] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  // Quick AI prompt state
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResult, setQuickResult] = useState('');
  const [quickError, setQuickError] = useState('');
  const [showQuickModal, setShowQuickModal] = useState(false);

  useEffect(() => {
    api.getOrganizations().then(setOrgs).catch(() => {});
  }, []);

  useEffect(() => {
    api.getNotifications(true)
      .then(data => setUnreadCount(data.length))
      .catch(() => {});
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setCreateError('');
    try {
      const org = await api.createOrganization({
        name: newOrgName,
        description: newOrgDesc,
        category: newOrgCategory,
        data: {
          website: newOrgWebsite || null,
          phone: newOrgPhone || null,
          address: newOrgAddress || null,
          size: newOrgSize || null,
        }
      });
      setOrgs(prev => [...prev, org]);
      setShowCreateOrg(false);
      setNewOrgName('');
      setNewOrgDesc('');
      setNewOrgCategory('other');
      setNewOrgWebsite('');
      setNewOrgPhone('');
      setNewOrgAddress('');
      setNewOrgSize('');
      navigate(`/organizations/${org.id}`);
    } catch (err) {
      setCreateError(err.message);
    }
  };

  const openNotifications = async () => {
    try {
      const data = await api.getNotifications(false);
      setNotifications(data);
      setShowNotifications(true);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch {
      setShowNotifications(true);
    }
  };

  const markNotificationRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleQuickAsk = async (e) => {
    e.preventDefault();
    if (!quickPrompt.trim() || quickLoading) return;
    setQuickLoading(true);
    setQuickError('');
    setShowQuickModal(true);
    setQuickResult('');
    try {
      const apiKey = localStorage.getItem('soprano_gemini_api_key') || undefined;
      const res = await api.askAI({ prompt: quickPrompt, api_key: apiKey });
      setQuickResult(res.answer);
      setQuickPrompt('');
    } catch (err) {
      setQuickError(err.message || 'Ошибка советника');
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Soprano</h2>
          <p>Система управления организацией</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            {Icons.home} Главная
          </NavLink>

          <button className="sidebar-link" onClick={openNotifications}>
            {Icons.bell}
            Уведомления
            {unreadCount > 0 && (
              <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>{unreadCount}</span>
            )}
          </button>

          <span className="sidebar-section">Советник</span>
          <NavLink to="/advisor" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            {Icons.advisor} Советник ИИ
          </NavLink>

          <span className="sidebar-section">Развлечения</span>
          <NavLink to="/blackjack" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            {Icons.blackjack} Блэкджек
          </NavLink>
          <NavLink to="/shooting" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            {Icons.target} Стрельба по птицам
          </NavLink>

          {orgs.length > 0 && <span className="sidebar-section">Организации</span>}
          {orgs.map(org => (
            <NavLink
              key={org.id}
              to={`/organizations/${org.id}`}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {Icons.org}
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{org.name}</span>
            </NavLink>
          ))}

          <button className="sidebar-link" onClick={() => setShowCreateOrg(true)}>
            {Icons.plus} Новая организация
          </button>

          <span className="sidebar-section" style={{ marginTop: 8 }}>Аккаунт</span>
          <NavLink to="/profile" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            {Icons.profile} Профиль
          </NavLink>
          {user?.platform_role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              {Icons.admin} Панель управления
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{getInitials(user?.full_name)}</div>
            <div className="info">
              <div className="name">{user?.full_name}</div>
              <div className="role">{roleLabel(user?.platform_role)}</div>
            </div>
          </div>
          <button className="sidebar-link" style={{ marginTop: 4 }} onClick={handleLogout}>
            {Icons.logout} Выйти
          </button>
        </div>
      </aside>

      <main className="main-content">
        {/* TOP QUICK AI INPUT BAR */}
        <div
          style={{
            padding: '10px 32px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>
            {Icons.sparkle} Советник Gemini:
          </div>
          <form onSubmit={handleQuickAsk} style={{ display: 'flex', flex: 1, gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Спросите советника Soprano в строгом официальном тоне..."
              value={quickPrompt}
              onChange={e => setQuickPrompt(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={quickLoading || !quickPrompt.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {quickLoading ? 'Анализ...' : 'Запросить совет'}
            </button>
          </form>
        </div>

        <Outlet context={{ orgs, setOrgs }} />
      </main>

      {showCreateOrg && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateOrg(false)}>
          <div className="modal">
            <h2>Создать организацию</h2>
            <form onSubmit={handleCreateOrg}>
              {createError && <div className="alert alert-error">{createError}</div>}
              <div className="form-group">
                <label>Название</label>
                <input className="form-input" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label>Описание</label>
                <textarea className="form-textarea" value={newOrgDesc} onChange={e => setNewOrgDesc(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Категория</label>
                <select className="form-select" value={newOrgCategory} onChange={e => setNewOrgCategory(e.target.value)}>
                  {ORG_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Сайт</label>
                  <input className="form-input" value={newOrgWebsite} onChange={e => setNewOrgWebsite(e.target.value)} placeholder="https://" />
                </div>
                <div className="form-group">
                  <label>Телефон</label>
                  <input className="form-input" value={newOrgPhone} onChange={e => setNewOrgPhone(e.target.value)} placeholder="+7" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Адрес</label>
                  <input className="form-input" value={newOrgAddress} onChange={e => setNewOrgAddress(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Размер</label>
                  <input className="form-input" value={newOrgSize} onChange={e => setNewOrgSize(e.target.value)} placeholder="например, 10-50" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateOrg(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNotifications && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowNotifications(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Уведомления</h2>
              <button className="btn btn-secondary btn-sm" onClick={markAllRead}>Прочитать все</button>
            </div>
            {notifications.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 12 }}>Нет уведомлений</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {notifications.map(n => (
                  <div key={n.id} className="card" style={{ padding: 12, borderColor: n.is_read ? 'var(--border-color)' : 'var(--accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{n.title}</div>
                        {n.message && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{n.message}</div>}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{new Date(n.created_at).toLocaleString('ru-RU')}</div>
                      </div>
                      {!n.is_read && (
                        <button className="btn btn-link btn-sm" style={{ color: 'var(--accent)', padding: 0 }} onClick={() => markNotificationRead(n.id)}>Прочитано</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showQuickModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowQuickModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--accent)' }}>Директива советника Soprano</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowQuickModal(false)}>✕</button>
            </div>
            {quickLoading ? (
              <div style={{ padding: '36px 0', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Советник анализирует ввод и формулирует директиву...</p>
              </div>
            ) : quickError ? (
              <div>
                <div className="alert alert-error">{quickError}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowQuickModal(false)}>Закрыть</button>
                  <button className="btn btn-primary btn-sm" onClick={() => { setShowQuickModal(false); navigate('/advisor'); }}>
                    Перейти в панель советника
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{
                  background: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius)',
                  fontSize: 14,
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '380px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  marginBottom: 16
                }}>
                  {quickResult}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowQuickModal(false); navigate('/advisor'); }}>
                    Открыть полный журнал советника
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowQuickModal(false)}>
                    Принято к исполнению
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}