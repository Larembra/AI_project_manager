import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import KanbanBoard from '../components/KanbanBoard.jsx';
import AnalyticsCharts from '../components/AnalyticsCharts.jsx';
import CalendarView from '../components/CalendarView.jsx';

const TABS = [
  { id: 'projects', label: 'Проекты' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'calendar', label: 'Календарь' },
  { id: 'members', label: 'Сотрудники и роли' },
  { id: 'departments', label: 'Отделы' },
  { id: 'chat', label: 'Чат' },
  { id: 'tasks', label: 'Kanban' },
  { id: 'finance', label: 'Финансы' },
  { id: 'absences', label: 'Отсутствия' },
  { id: 'logs', label: 'Логи' },
  { id: 'settings', label: 'Настройки' },
];

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

const PROJECT_CATEGORIES = [
  { value: 'development', label: 'Разработка' },
  { value: 'business_analysis', label: 'Бизнес-аналитика' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'hr', label: 'HR' },
  { value: 'logistics', label: 'Логистика' },
  { value: 'finance', label: 'Финансы' },
  { value: 'other', label: 'Другое' }
];

const LOG_ACTION_LABELS = {
  CREATE_ROLE: 'Создание роли',
  UPDATE_ROLE: 'Изменение роли',
  DELETE_ROLE: 'Удаление роли',
  CREATE_PROJECT: 'Создание проекта',
  COMPLETE_TASK: 'Завершение задачи',
  APPROVE_TASK: 'Подтверждение задачи',
  REJECT_TASK: 'Возврат задачи',
};

const LOG_ENTITY_LABELS = {
  ROLE: 'Роль',
  PROJECT: 'Проект',
  TASK: 'Задача',
};

function formatLogDetails(details) {
  if (!details) return '—';
  return details
    .replace('категория: development', 'категория: Разработка')
    .replace('категория: business_analysis', 'категория: Бизнес-аналитика')
    .replace('категория: marketing', 'категория: Маркетинг')
    .replace('категория: hr', 'категория: HR')
    .replace('категория: logistics', 'категория: Логистика')
    .replace('категория: finance', 'категория: Финансы')
    .replace('категория: other', 'категория: Другое');
}

export default function OrganizationPage() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');
  const [error, setError] = useState('');

  // Projects states
  const [projects, setProjects] = useState([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjCat, setNewProjCat] = useState('development');
  const [newProjBudget, setNewProjBudget] = useState(0);

  // Analytics & Calendar states
  const [orgAnalytics, setOrgAnalytics] = useState(null);
  const [analyticsForbidden, setAnalyticsForbidden] = useState(false);
  const [orgCalendar, setOrgCalendar] = useState([]);

  // Roles states (чекбоксы прав)
  const [roles, setRoles] = useState([]);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleCanManageRoles, setNewRoleCanManageRoles] = useState(false);
  const [newRoleCanCreateProjects, setNewRoleCanCreateProjects] = useState(false);
  const [newRoleCanEditTasks, setNewRoleCanEditTasks] = useState(true);
  const [newRoleCanApproveTasks, setNewRoleCanApproveTasks] = useState(false);
  const [newRoleCanViewOrgAnalytics, setNewRoleCanViewOrgAnalytics] = useState(false);
  const [newRoleCanManageMembers, setNewRoleCanManageMembers] = useState(false);
  const [selectedCustomRole, setSelectedCustomRole] = useState('');

  // Edit Role modal state
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [editRoleCanManageRoles, setEditRoleCanManageRoles] = useState(false);
  const [editRoleCanCreateProjects, setEditRoleCanCreateProjects] = useState(false);
  const [editRoleCanEditTasks, setEditRoleCanEditTasks] = useState(true);
  const [editRoleCanApproveTasks, setEditRoleCanApproveTasks] = useState(false);
  const [editRoleCanViewOrgAnalytics, setEditRoleCanViewOrgAnalytics] = useState(false);
  const [editRoleCanManageMembers, setEditRoleCanManageMembers] = useState(false);

  // Members & Invite states
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState([]);
  const [showMemberModal, setShowMemberModal] = useState(null); // stores member object
  const [selectedRoleValue, setSelectedRoleValue] = useState('employee');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  // Departments states
  const [depts, setDepts] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [viewingDept, setViewingDept] = useState(null);
  const [deptMembers, setDeptMembers] = useState([]);

  // Edit Dept modal state
  const [editingDept, setEditingDept] = useState(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptDesc, setEditDeptDesc] = useState('');

  // Logs state
  const [orgLogs, setOrgLogs] = useState([]);
  const [logsSearch, setLogsSearch] = useState('');

  // Chat states
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const messagesEndRef = useRef(null);

  // Finance states
  const [finance, setFinance] = useState([]);
  const [newFinTitle, setNewFinTitle] = useState('');
  const [newFinDesc, setNewFinDesc] = useState('');
  const [newFinAmount, setNewFinAmount] = useState('');
  const [newFinCat, setNewFinCat] = useState('expense');

  // Absence states
  const [absences, setAbsences] = useState([]);
  const [newAbsType, setNewAbsType] = useState('vacation');
  const [newAbsStart, setNewAbsStart] = useState('');
  const [newAbsEnd, setNewAbsEnd] = useState('');
  const [newAbsReason, setNewAbsReason] = useState('');

  // Settings states
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('other');
  const [editWebsite, setEditWebsite] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editSize, setEditSize] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.getOrganization(orgId),
      api.getMembers(orgId),
      api.getDepartments(orgId),
    ])
      .then(([orgData, membersData, deptsData]) => {
        setOrg(orgData);
        setEditName(orgData.name);
        setEditDesc(orgData.description || '');
        setEditCategory(orgData.category || 'other');
        setEditWebsite(orgData.data?.website || '');
        setEditPhone(orgData.data?.phone || '');
        setEditAddress(orgData.data?.address || '');
        setEditSize(orgData.data?.size || '');
        setMembers(membersData);
        setDepts(deptsData);

        const found = membersData.find(m => m.user_id === user.id);
        setCurrentMember(found || null);
      })
      .catch(err => {
        setError('Не удалось загрузить данные организации: ' + err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orgId, user.id]);

  // Load contextual tab data
  useEffect(() => {
    if (!org) return;
    if (activeTab === 'projects') {
      api.getProjects(orgId).then(setProjects).catch(() => {});
    } else if (activeTab === 'analytics') {
      setAnalyticsForbidden(false);
      api.getOrgAnalytics(orgId)
        .then(setOrgAnalytics)
        .catch(err => {
          if (err.status === 403 || err.message?.includes('403') || err.message?.includes('ограничен')) {
            setAnalyticsForbidden(true);
          }
        });
    } else if (activeTab === 'calendar') {
      api.getOrgCalendar(orgId).then(setOrgCalendar).catch(() => {});
    } else if (activeTab === 'members') {
      api.getRoles(orgId).then(setRoles).catch(() => {});
      if (currentMember?.role === 'moderator' || org.owner_id === user.id || currentMember?.permissions?.can_manage_members) {
        api.getInvitations(orgId).then(setInvites).catch(() => {});
      }
    } else if (activeTab === 'chat') {
      api.getChannels(orgId)
        .then(chanData => {
          setChannels(chanData);
          if (chanData.length > 0 && !activeChannel) {
            setActiveChannel(chanData[0]);
          }
        })
        .catch(() => {});
    } else if (activeTab === 'finance') {
      api.getFinanceRecords(orgId).then(setFinance).catch(() => {});
    } else if (activeTab === 'absences') {
      api.getAbsences(orgId).then(setAbsences).catch(() => {});
    } else if (activeTab === 'logs') {
      api.getOrganizationLogs(orgId, logsSearch).then(setOrgLogs).catch(() => {});
    }
  }, [activeTab, orgId, org, currentMember, logsSearch]);

  // Load chat messages when active channel changes
  useEffect(() => {
    if (activeTab === 'chat' && activeChannel) {
      api.getMessages(orgId, activeChannel.id)
        .then(setMessages)
        .catch(() => {});
    }
  }, [activeChannel, activeTab, orgId]);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="page-body"><div className="alert alert-error">{error}</div></div>;
  if (!org) return <div className="page-body"><div className="alert alert-error">Организация не найдена</div></div>;

  const isModerator = currentMember?.role === 'moderator' || org.owner_id === user.id || currentMember?.permissions?.is_owner;
  const canCreateProjects = isModerator || currentMember?.permissions?.can_create_projects;
  const canManageRoles = isModerator || currentMember?.permissions?.can_manage_roles;
  const canEditTasks = isModerator || currentMember?.permissions?.can_edit_tasks;
  const canApproveTasks = isModerator || currentMember?.permissions?.can_approve_tasks;
  const canViewOrgAnalytics = isModerator || currentMember?.permissions?.can_view_org_analytics;
  const canManageMembers = isModerator || currentMember?.permissions?.can_manage_members;

  // Handlers: Projects
  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      const p = await api.createProject(orgId, {
        name: newProjName,
        description: newProjDesc || null,
        category: newProjCat,
        budget: parseFloat(newProjBudget) || 0,
      });
      setProjects(prev => [p, ...prev]);
      setShowCreateProject(false);
      setNewProjName('');
      setNewProjDesc('');
      setNewProjBudget(0);
      navigate(`/organizations/${orgId}/projects/${p.id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProjectFromOrg = async (e, projectId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Удалить проект? Все его задачи и аналитика будут удалены.')) return;
    try {
      await api.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Roles (Чекбоксы прав)
  const handleCreateRole = async (e) => {
    e.preventDefault();
    try {
      const r = await api.createRole(orgId, {
        name: newRoleName,
        description: newRoleDesc || null,
        can_manage_roles: newRoleCanManageRoles,
        can_create_projects: newRoleCanCreateProjects,
        can_edit_tasks: newRoleCanEditTasks,
        can_approve_tasks: newRoleCanApproveTasks,
        can_view_org_analytics: newRoleCanViewOrgAnalytics,
        can_manage_members: newRoleCanManageMembers,
      });
      setRoles(prev => [...prev, r]);
      setShowCreateRole(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRoleCanManageRoles(false);
      setNewRoleCanCreateProjects(false);
      setNewRoleCanEditTasks(true);
      setNewRoleCanApproveTasks(false);
      setNewRoleCanViewOrgAnalytics(false);
      setNewRoleCanManageMembers(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenEditRole = (r) => {
    setEditingRole(r);
    setEditRoleName(r.name || '');
    setEditRoleDesc(r.description || '');
    setEditRoleCanManageRoles(!!r.can_manage_roles);
    setEditRoleCanCreateProjects(!!r.can_create_projects);
    setEditRoleCanEditTasks(!!r.can_edit_tasks);
    setEditRoleCanApproveTasks(!!r.can_approve_tasks);
    setEditRoleCanViewOrgAnalytics(!!r.can_view_org_analytics);
    setEditRoleCanManageMembers(!!r.can_manage_members);
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    if (!editingRole) return;
    try {
      const updated = await api.updateRole(orgId, editingRole.id, {
        name: editRoleName,
        description: editRoleDesc || null,
        can_manage_roles: editRoleCanManageRoles,
        can_create_projects: editRoleCanCreateProjects,
        can_edit_tasks: editRoleCanEditTasks,
        can_approve_tasks: editRoleCanApproveTasks,
        can_view_org_analytics: editRoleCanViewOrgAnalytics,
        can_manage_members: editRoleCanManageMembers,
      });
      setRoles(prev => prev.map(r => r.id === updated.id ? updated : r));
      setEditingRole(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!confirm('Удалить эту роль? Назначенные сотрудники потеряют привилегии этой роли.')) return;
    try {
      await api.deleteRole(orgId, roleId);
      setRoles(prev => prev.filter(r => r.id !== roleId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenEditDept = (d) => {
    setEditingDept(d);
    setEditDeptName(d.name || '');
    setEditDeptDesc(d.description || '');
  };

  const handleUpdateDept = async (e) => {
    e.preventDefault();
    if (!editingDept) return;
    try {
      const updated = await api.updateDepartment(orgId, editingDept.id, {
        name: editDeptName,
        description: editDeptDesc || null,
      });
      setDepts(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
      setEditingDept(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Members
  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const invite = await api.createInvitation(orgId, { email: inviteEmail });
      setInvites(prev => [invite, ...prev]);
      setInviteEmail('');
    } catch (err) {
      alert('Ошибка приглашения: ' + err.message);
    }
  };

  const handleCancelInvite = async (inviteId) => {
    try {
      await api.cancelInvitation(orgId, inviteId);
      setInvites(prev => prev.map(i => i.id === inviteId ? { ...i, status: 'expired' } : i));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenMemberModal = (m) => {
    setShowMemberModal(m);
    if (m.custom_role_id) {
      setSelectedRoleValue(`custom:${m.custom_role_id}`);
    } else if (m.role === 'moderator') {
      setSelectedRoleValue('moderator');
    } else {
      setSelectedRoleValue('employee');
    }
    setSelectedPosition(m.position || '');
    setSelectedDept(m.department_id || '');
  };

  const handleUpdateMember = async (e) => {
    e.preventDefault();
    try {
      let roleToSave = 'employee';
      let customRoleToSave = null;
      if (selectedRoleValue === 'moderator') {
        roleToSave = 'moderator';
        customRoleToSave = null;
      } else if (selectedRoleValue.startsWith('custom:')) {
        roleToSave = 'employee';
        customRoleToSave = selectedRoleValue.replace('custom:', '');
      } else {
        roleToSave = 'employee';
        customRoleToSave = null;
      }

      const updated = await api.updateMember(orgId, showMemberModal.id, {
        role: roleToSave,
        custom_role_id: customRoleToSave,
        position: selectedPosition,
        department_id: selectedDept || null,
      });
      setMembers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      setShowMemberModal(null);
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Вы уверены, что хотите удалить этого участника?')) return;
    try {
      await api.removeMember(orgId, memberId);
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setShowMemberModal(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Departments
  const handleCreateDept = async (e) => {
    e.preventDefault();
    try {
      const dept = await api.createDepartment(orgId, { name: newDeptName, description: newDeptDesc });
      setDepts(prev => [...prev, dept]);
      setNewDeptName('');
      setNewDeptDesc('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDept = async (deptId) => {
    if (!confirm('Удалить отдел? Участники этого отдела будут переведены в общий список.')) return;
    try {
      await api.deleteDepartment(orgId, deptId);
      setDepts(prev => prev.filter(d => d.id !== deptId));
      // Refresh members since department associations updated
      api.getMembers(orgId).then(setMembers).catch(() => {});
    } catch (err) {
      alert(err.message);
    }
  };

  const handleViewDept = async (dept) => {
    try {
      const members = await api.getDepartmentMembers(orgId, dept.id);
      setDeptMembers(members);
      setViewingDept(dept);
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Chat
  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      const chan = await api.createChannel(orgId, { name: newChannelName, description: newChannelDesc });
      setChannels(prev => [...prev, chan]);
      setActiveChannel(chan);
      setShowNewChannelModal(false);
      setNewChannelName('');
      setNewChannelDesc('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteChannel = async (chanId) => {
    if (!confirm('Вы уверены, что хотите удалить этот канал со всей историей сообщений?')) return;
    try {
      await api.deleteChannel(orgId, chanId);
      const remaining = channels.filter(c => c.id !== chanId);
      setChannels(remaining);
      setActiveChannel(remaining.length > 0 ? remaining[0] : null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChannel) return;
    try {
      const msg = await api.sendMessage(orgId, activeChannel.id, { content: newMessage });
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    try {
      await api.deleteMessage(orgId, msgId);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: '[удалено]' } : m));
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Finance
  const handleCreateFinance = async (e) => {
    e.preventDefault();
    try {
      const rec = await api.createFinanceRecord(orgId, {
        title: newFinTitle,
        description: newFinDesc || null,
        amount: parseFloat(newFinAmount),
        category: newFinCat
      });
      setFinance(prev => [rec, ...prev]);
      setNewFinTitle('');
      setNewFinDesc('');
      setNewFinAmount('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApproveFinance = async (recId, approveStatus) => {
    try {
      const updated = await api.approveFinanceRecord(orgId, recId, { status: approveStatus });
      setFinance(prev => prev.map(f => f.id === recId ? { ...f, ...updated } : f));
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Absences
  const handleCreateAbsence = async (e) => {
    e.preventDefault();
    try {
      const abs = await api.createAbsence(orgId, {
        absence_type: newAbsType,
        start_date: newAbsStart,
        end_date: newAbsEnd,
        reason: newAbsReason || null
      });
      setAbsences(prev => [abs, ...prev]);
      setNewAbsStart('');
      setNewAbsEnd('');
      setNewAbsReason('');
    } catch (err) {
      alert('Ошибка при подаче заявки: ' + err.message);
    }
  };

  const handleApproveAbsence = async (absId, approveStatus) => {
    try {
      const updated = await api.approveAbsence(orgId, absId, { status: approveStatus });
      setAbsences(prev => prev.map(a => a.id === absId ? { ...a, ...updated } : a));
    } catch (err) {
      alert(err.message);
    }
  };

  // Handlers: Settings
  const handleUpdateOrg = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateOrganization(orgId, {
        name: editName,
        description: editDesc,
        category: editCategory,
        data: {
          website: editWebsite || null,
          phone: editPhone || null,
          address: editAddress || null,
          size: editSize || null,
        }
      });
      setOrg(updated);
      alert('Изменения сохранены');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteOrg = async () => {
    if (!confirm('ВНИМАНИЕ! Вы действительно хотите безвозвратно удалить эту организацию? Все её данные будут потеряны.')) return;
    try {
      await api.deleteOrganization(orgId);
      navigate('/');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="org-header">
          <div className="org-icon">{org.name[0].toUpperCase()}</div>
          <div>
            <h1>{org.name}</h1>
            <p>{org.description || 'Нет описания организации'}</p>
          </div>
        </div>

        <div className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', margin: 0 }}>Проекты организации</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Направления деятельности, задачи, диаграммы Ганта, документация и база знаний
                </p>
              </div>
              {canCreateProjects && (
                <button className="btn btn-primary" onClick={() => setShowCreateProject(true)}>
                  + Новый проект
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="card empty-state" style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>В организации пока нет проектов</p>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Создайте первый проект (разработка, бизнес-аналитика, маркетинг, HR, логистика и т.д.)
                </p>
                {canCreateProjects && (
                  <button className="btn btn-primary" onClick={() => setShowCreateProject(true)}>
                    + Создать проект
                  </button>
                )}
              </div>
            ) : (
              <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {projects.map(p => (
                  <Link
                    key={p.id}
                    to={`/organizations/${orgId}/projects/${p.id}`}
                    className="card"
                    style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'transform 0.15s, border-color 0.15s' }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                        <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                          {PROJECT_CATEGORIES.find(c => c.value === p.category)?.label || p.category}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span className={`badge ${p.status === 'completed' ? 'badge-success' : p.status === 'archived' ? 'badge-neutral' : 'badge-danger'}`}>
                            {p.status === 'active' ? 'Активен' : p.status === 'completed' ? 'Завершён' : 'В архиве'}
                          </span>
                          {(canCreateProjects || isModerator) && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              style={{ padding: '2px 8px', fontSize: '11px', lineHeight: 1 }}
                              onClick={(e) => handleDeleteProjectFromOrg(e, p.id)}
                              title="Удалить проект"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      <h3 style={{ fontSize: '17px', margin: '0 0 8px 0', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{p.name}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 16px 0', minHeight: '36px', wordBreak: 'break-word' }}>
                        {p.description || 'Без описания'}
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Бюджет: <strong style={{ color: 'var(--text-primary)' }}>{Number(p.budget || 0).toLocaleString('ru-RU')} ₽</strong></span>
                      <span style={{ color: 'var(--primary)' }}>Открыть проект →</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Сводная бизнес-аналитика</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Динамические показатели выручки, расходов, привлечённых клиентов и выполнения задач
              </p>
            </div>

            {analyticsForbidden ? (
              <div className="card" style={{ borderColor: 'var(--danger)', padding: '24px', textAlign: 'center' }}>
                <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Доступ ограничен</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Общая аналитика организации доступна только Организаторам (руководству) и сотрудникам с правом «Просмотр аналитики организации».
                </p>
              </div>
            ) : (
              <AnalyticsCharts data={orgAnalytics} />
            )}
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === 'calendar' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Общий календарь организации</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Сроки проектных задач, дедлайны и график отсутствий сотрудников
              </p>
            </div>
            <CalendarView events={orgCalendar} orgId={orgId} />
          </div>
        )}

        {/* MEMBERS TAB */}
        {activeTab === 'members' && (
          <div className={(isModerator || canManageMembers) ? "responsive-split-grid" : ""} style={{ minWidth: 0 }}>
            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Список сотрудников</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Email</th>
                      <th>Отдел</th>
                      <th>Должность</th>
                      <th>Роль</th>
                      {(isModerator || canManageMembers) && <th style={{ width: '40px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => {
                      const isMemberOwner = Boolean(org && org.owner_id === m.user_id);
                      return (
                        <tr key={m.id}>
                          <td style={{ fontWeight: '500' }}>
                            {m.full_name}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                          <td>{depts.find(d => d.id === m.department_id)?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td>{m.position || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td>
                            {isMemberOwner ? (
                              <span className="badge badge-danger" style={{ background: '#b71c1c', color: '#fff', fontWeight: 600 }}>
                                Создатель
                              </span>
                            ) : m.custom_role_name ? (
                              <span className="badge badge-info">{m.custom_role_name}</span>
                            ) : (
                              <span className={`badge ${m.role === 'moderator' ? 'badge-danger' : 'badge-neutral'}`}>
                                {m.role === 'moderator' ? 'Организатор' : 'Сотрудник'}
                              </span>
                            )}
                          </td>
                          {(isModerator || canManageMembers) && (
                            <td>
                              {!isMemberOwner ? (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenMemberModal(m)}>Изменить</button>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Создатель</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ROLES SECTION */}
              <div style={{ marginTop: '36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <h2 style={{ fontSize: '16px', margin: 0 }}>Роли и матрица прав доступа</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Гранулярные привилегии с чекбоксами для каждого типа сотрудника
                    </p>
                  </div>
                  {canManageRoles && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateRole(true)}>
                      + Создать роль
                    </button>
                  )}
                </div>

                <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                  {roles.map(r => (
                    <div key={r.id} className="card" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '15px' }}>{r.name}</h4>
                        {r.is_default && <span className="badge badge-neutral" style={{ fontSize: '10px' }}>По умолчанию</span>}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        {r.description || 'Без описания'}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {r.can_create_projects && <span className="badge badge-success" style={{ fontSize: '10px' }}>✓ Проекты</span>}
                        {r.can_manage_roles && <span className="badge badge-success" style={{ fontSize: '10px' }}>✓ Роли</span>}
                        {r.can_edit_tasks && <span className="badge badge-success" style={{ fontSize: '10px' }}>✓ Задачи</span>}
                        {r.can_approve_tasks && <span className="badge badge-warning" style={{ fontSize: '10px' }}>✓ Приёмка</span>}
                        {r.can_view_org_analytics && <span className="badge badge-info" style={{ fontSize: '10px' }}>✓ Аналитика</span>}
                        {r.can_manage_members && <span className="badge badge-danger" style={{ fontSize: '10px' }}>✓ Люди</span>}
                      </div>
                      {canManageRoles && !r.is_default && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleOpenEditRole(r)}>Редактировать</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteRole(r.id)}>Удалить</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(isModerator || canManageMembers) && (
              <div>
                <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Контроль приглашений</h2>
                <form onSubmit={handleInvite} className="card" style={{ marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>Отправить приглашение по почте</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="employee@domain.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Пригласить</button>
                </form>

                <h3 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Активные инвайты</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {invites.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Нет ожидающих инвайтов</p>
                  ) : (
                    invites.map(inv => (
                      <div key={inv.id} className="card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</p>
                          <span className={`badge ${inv.status === 'pending' ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '9px', padding: '2px 6px', marginTop: '4px' }}>
                            {inv.status === 'pending' ? 'Ожидает' : inv.status}
                          </span>
                        </div>
                        {inv.status === 'pending' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleCancelInvite(inv.id)}>Отменить</button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DEPARTMENTS TAB */}
        {activeTab === 'departments' && (
          <div className={(isModerator || canManageMembers) ? "responsive-split-grid" : ""} style={{ minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Отделы и структуры</h2>
              {depts.length === 0 ? (
                <div className="empty-state">Отделы не созданы</div>
              ) : (
                <div className="card-grid">
                  {depts.map(d => (
                    <div
                      key={d.id}
                      className="card"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minWidth: 0,
                        padding: '18px 20px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '16px', wordBreak: 'break-word', flex: '1 1 120px' }}>{d.name}</h3>
                          <span className="badge badge-neutral" style={{ fontSize: '11px', flexShrink: 0 }}>
                            Сотрудников: {d.member_count}
                          </span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0', wordBreak: 'break-word', minHeight: '32px' }}>
                          {d.description || 'Без описания'}
                        </p>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleViewDept(d)}>Сотрудники</button>
                        {(isModerator || canManageMembers) && (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDept(d)}>Изменить</button>
                        )}
                        {(isModerator || canManageMembers) && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDept(d.id)}>Удалить</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(isModerator || canManageMembers) && (
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Добавить отдел</h2>
                <form onSubmit={handleCreateDept} className="card">
                  <div className="form-group">
                    <label>Название отдела</label>
                    <input className="form-input" placeholder="например, Отдел маркетинга" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Описание</label>
                    <textarea className="form-textarea" placeholder="Краткое описание функций" value={newDeptDesc} onChange={e => setNewDeptDesc(e.target.value)} />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Создать отдел</button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="chat-container">
            <div className="chat-channels">
              {channels.map(c => (
                <button
                  key={c.id}
                  className={`chat-channel-btn${activeChannel?.id === c.id ? ' active' : ''}`}
                  onClick={() => setActiveChannel(c)}
                >
                  #{c.name}
                </button>
              ))}
              {isModerator && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewChannelModal(true)}>+ Создать канал</button>
              )}
            </div>

            {activeChannel ? (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', margin: 0 }}>#{activeChannel.name}</h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{activeChannel.description || 'Нет описания темы'}</p>
                  </div>
                  {isModerator && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteChannel(activeChannel.id)}>Удалить канал</button>
                  )}
                </div>

                <div className="chat-messages">
                  {messages.map(m => (
                    <div key={m.id} className={`chat-message${m.author_id === user.id ? ' own' : ''}${m.is_deleted ? ' deleted' : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                        <span className="author">{m.author_name}</span>
                        {isModerator && !m.is_deleted && (
                          <button
                            className="btn btn-link btn-sm"
                            style={{ padding: 0, border: 'none', background: 'none', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer' }}
                            onClick={() => handleDeleteMessage(m.id)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                      <div style={{ marginTop: '2px', wordBreak: 'break-word' }}>{m.content}</div>
                      <div className="time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="chat-input-area">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Напишите сообщение..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn btn-primary">Отправить</button>
                </form>
              </>
            ) : (
              <div className="empty-state">Нет активных каналов чата</div>
            )}
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab === 'tasks' && (
          <KanbanBoard orgId={orgId} members={members} isModerator={isModerator} canEditTasks={canEditTasks} />
        )}

        {/* FINANCE TAB */}
        {activeTab === 'finance' && (
          <div className="responsive-split-grid" style={{ minWidth: 0 }}>
            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Журнал финансовых операций</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Тип</th>
                      <th>Сумма</th>
                      <th>Запросил</th>
                      <th>Статус</th>
                      {isModerator && <th>Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {finance.map(f => (
                      <tr key={f.id}>
                        <td>
                          <p style={{ fontWeight: '600' }}>{f.title}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.description}</p>
                        </td>
                        <td>
                          <span className={`badge ${f.category === 'income' ? 'badge-success' : 'badge-neutral'}`}>
                            {f.category === 'income' ? 'Доход' : 'Расход'}
                          </span>
                        </td>
                        <td style={{ fontWeight: '700', color: f.category === 'income' ? 'var(--success)' : 'var(--text-primary)' }}>
                          {f.category === 'income' ? '+' : '-'}{parseFloat(f.amount).toLocaleString('ru-RU')} ₽
                        </td>
                        <td>{f.creator_name}</td>
                        <td>
                          <span className={`badge ${
                            f.status === 'approved' ? 'badge-success' :
                            f.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                          }`}>
                            {f.status === 'approved' ? 'Утверждено' :
                             f.status === 'rejected' ? 'Отклонено' : 'Ожидает'}
                          </span>
                        </td>
                        {isModerator && (
                          <td>
                            {f.status === 'pending' && (
                              <div className="actions-cell">
                                <button className="btn btn-success btn-sm" onClick={() => handleApproveFinance(f.id, 'approved')}>Да</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleApproveFinance(f.id, 'rejected')}>Нет</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Создать заявку</h2>
              <form onSubmit={handleCreateFinance} className="card">
                <div className="form-group">
                  <label>Название операции</label>
                  <input className="form-input" placeholder="например, Закупка канцелярии" value={newFinTitle} onChange={e => setNewFinTitle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Описание / Обоснование</label>
                  <textarea className="form-textarea" placeholder="Детали..." value={newFinDesc} onChange={e => setNewFinDesc(e.target.value)} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Сумма (₽)</label>
                    <input type="number" step="0.01" className="form-input" placeholder="0.00" value={newFinAmount} onChange={e => setNewFinAmount(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Тип</label>
                    <select className="form-select" value={newFinCat} onChange={e => setNewFinCat(e.target.value)}>
                      <option value="expense">Расход</option>
                      <option value="income">Доход</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                  Отправить на утверждение
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ABSENCES TAB */}
        {activeTab === 'absences' && (
          <div className="responsive-split-grid" style={{ minWidth: 0 }}>
            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Календарь и список отсутствий</h2>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Тип</th>
                      <th>Период</th>
                      <th>Причина</th>
                      <th>Статус</th>
                      {isModerator && <th>Модерация</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {absences.map(abs => (
                      <tr key={abs.id}>
                        <td style={{ fontWeight: '500' }}>{abs.user_name}</td>
                        <td>
                          <span className="badge badge-neutral">
                            {abs.absence_type === 'vacation' ? 'Отпуск' :
                             abs.absence_type === 'sick_leave' ? 'Больничный' :
                             abs.absence_type === 'business_trip' ? 'Командировка' :
                             abs.absence_type === 'remote' ? 'Удаленная работа' : 'Другое'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          с {new Date(abs.start_date).toLocaleDateString('ru-RU')}
                          <br />по {new Date(abs.end_date).toLocaleDateString('ru-RU')}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{abs.reason || '—'}</td>
                        <td>
                          <span className={`badge ${
                            abs.status === 'approved' ? 'badge-success' :
                            abs.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                          }`}>
                            {abs.status === 'approved' ? 'Одобрено' :
                             abs.status === 'rejected' ? 'Отклонено' : 'Ожидает'}
                          </span>
                        </td>
                        {isModerator && (
                          <td>
                            {abs.status === 'pending' && (
                              <div className="actions-cell">
                                <button className="btn btn-success btn-sm" onClick={() => handleApproveAbsence(abs.id, 'approved')}>Одобрить</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleApproveAbsence(abs.id, 'rejected')}>Отклонить</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Заявить об отсутствии</h2>
              <form onSubmit={handleCreateAbsence} className="card">
                <div className="form-group">
                  <label>Причина отсутствия</label>
                  <select className="form-select" value={newAbsType} onChange={e => setNewAbsType(e.target.value)}>
                    <option value="vacation">Отпуск</option>
                    <option value="sick_leave">Больничный</option>
                    <option value="business_trip">Командировка</option>
                    <option value="remote">Удаленная работа</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Начало</label>
                    <input type="date" className="form-input" value={newAbsStart} onChange={e => setNewAbsStart(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Конец</label>
                    <input type="date" className="form-input" value={newAbsEnd} onChange={e => setNewAbsEnd(e.target.value)} required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Пояснение (необязательно)</label>
                  <textarea className="form-textarea" placeholder="Причина или дополнительная информация..." value={newAbsReason} onChange={e => setNewAbsReason(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Отправить заявку</button>
              </form>
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div>
            <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Журнал действий в организации</h2>
            
            <div style={{ marginBottom: '16px', maxWidth: '400px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Поиск по имени, действию или сущности..."
                value={logsSearch}
                onChange={e => setLogsSearch(e.target.value)}
              />
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Сотрудник</th>
                    <th>Действие</th>
                    <th>Тип сущности</th>
                    <th>Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {orgLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('ru-RU')}
                      </td>
                      <td style={{ fontWeight: '500' }}>{log.user_name}</td>
                      <td>
                        <span className="badge badge-info">{LOG_ACTION_LABELS[log.action] || log.action}</span>
                      </td>
                      <td>{LOG_ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{formatLogDetails(log.details)}</td>
                    </tr>
                  ))}
                  {orgLogs.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        Записей не найдено
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '700px' }}>
            <h2 style={{ fontSize: '16px', marginBottom: '14px' }}>Параметры организации</h2>
            {isModerator ? (
              <form onSubmit={handleUpdateOrg} className="card" style={{ marginBottom: '24px' }}>
                <div className="form-group">
                  <label>Название организации</label>
                  <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Описание</label>
                  <textarea className="form-textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Категория</label>
                  <select className="form-select" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                    {ORG_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Сайт</label>
                    <input className="form-input" value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://" />
                  </div>
                  <div className="form-group">
                    <label>Телефон</label>
                    <input className="form-input" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+7" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Адрес</label>
                    <input className="form-input" value={editAddress} onChange={e => setEditAddress(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Размер</label>
                    <input className="form-input" value={editSize} onChange={e => setEditSize(e.target.value)} placeholder="например, 10-50" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary">Сохранить изменения</button>
              </form>
            ) : (
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="form-group">
                  <label>Название организации</label>
                  <input className="form-input" value={org.name} readOnly />
                </div>
                <div className="form-group">
                  <label>Описание</label>
                  <textarea className="form-textarea" value={org.description || ''} readOnly />
                </div>
                <div className="form-group">
                  <label>Категория</label>
                  <input
                    className="form-input"
                    value={ORG_CATEGORIES.find(c => c.value === org.category)?.label || 'Другое'}
                    readOnly
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Сайт</label>
                    <input className="form-input" value={org.data?.website || ''} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Телефон</label>
                    <input className="form-input" value={org.data?.phone || ''} readOnly />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Адрес</label>
                    <input className="form-input" value={org.data?.address || ''} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Размер</label>
                    <input className="form-input" value={org.data?.size || ''} readOnly />
                  </div>
                </div>
              </div>
            )}

            {isModerator && (
              <div className="card" style={{ borderColor: 'var(--danger)' }}>
                <h3 style={{ color: 'var(--danger)' }}>Критическая зона</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  После удаления организации все данные о сотрудниках, отделах, финансах и чатах будут удалены безвозвратно.
                </p>
                <button className="btn btn-danger" onClick={handleDeleteOrg}>Удалить организацию</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MEMBER EDIT MODAL */}
      {showMemberModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowMemberModal(null)}>
          <div className="modal">
            <h2>Редактировать сотрудника: {showMemberModal.full_name}</h2>
            <form onSubmit={handleUpdateMember}>
              <div className="form-group">
                <label>Роль в организации</label>
                <select
                  className="form-select"
                  value={selectedRoleValue}
                  onChange={e => setSelectedRoleValue(e.target.value)}
                >
                  <optgroup label="Базовые роли">
                    <option value="employee">Сотрудник (по умолчанию — исполнитель)</option>
                    <option value="moderator">Организатор (полные права)</option>
                  </optgroup>
                  {roles.length > 0 && (
                    <optgroup label="Настраиваемые роли (чекбоксы прав)">
                      {roles.map(r => (
                        <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {selectedRoleValue === 'moderator'
                    ? 'Организатор имеет неограниченный доступ ко всем проектам, задачам, финансам и участникам.'
                    : selectedRoleValue.startsWith('custom:')
                    ? 'Привилегии определяются чекбоксами выбранной роли.'
                    : 'Сотрудник — базовая роль по умолчанию (выполнение назначенных задач и участие в проектах).'}
                </p>
              </div>
              <div className="form-group">
                <label>Должность</label>
                <input className="form-input" value={selectedPosition} onChange={e => setSelectedPosition(e.target.value)} placeholder="например, Главный аналитик" />
              </div>
              <div className="form-group">
                <label>Отдел</label>
                <select className="form-select" value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
                  <option value="">Без отдела</option>
                  {depts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <button type="button" className="btn btn-danger" onClick={() => handleRemoveMember(showMemberModal.id)}>Исключить</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMemberModal(null)}>Отмена</button>
                  <button type="submit" className="btn btn-primary">Сохранить</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEPARTMENT MEMBERS MODAL */}
      {viewingDept && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewingDept(null)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Сотрудники: {viewingDept.name}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setViewingDept(null)}>✕</button>
            </div>
            
            {deptMembers.length === 0 ? (
              <div className="empty-state">Нет сотрудников в этом отделе</div>
            ) : (
              <div className="table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Email</th>
                      <th>Должность</th>
                      <th>Роль</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptMembers.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: '500' }}>{m.full_name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                        <td>{m.position || '—'}</td>
                        <td>
                          <span className={`badge ${m.role === 'moderator' ? 'badge-danger' : 'badge-neutral'}`}>
                            {m.role === 'moderator' ? 'Организатор' : 'Сотрудник'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE CHANNEL MODAL */}
      {showNewChannelModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowNewChannelModal(false)}>
          <div className="modal">
            <h2>Создать чат-канал</h2>
            <form onSubmit={handleCreateChannel}>
              <div className="form-group">
                <label>Название канала</label>
                <input className="form-input" placeholder="например, маркетинг" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Описание</label>
                <textarea className="form-textarea" placeholder="О чем этот канал?" value={newChannelDesc} onChange={e => setNewChannelDesc(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewChannelModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateProject && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateProject(false)}>
          <div className="modal" style={{ maxWidth: '520px' }}>
            <h2>Создать новый проект</h2>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label>Название проекта</label>
                <input
                  className="form-input"
                  placeholder="например, Внедрение CRM или Запуск рекламной кампании"
                  value={newProjName}
                  onChange={e => setNewProjName(e.target.value)}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Направление / Категория</label>
                  <select className="form-select" value={newProjCat} onChange={e => setNewProjCat(e.target.value)}>
                    {PROJECT_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Бюджет (₽)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0"
                    value={newProjBudget}
                    onChange={e => setNewProjBudget(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Описание проекта и цели</label>
                <textarea
                  className="form-textarea"
                  placeholder="Цели, стейкхолдеры, критерии успеха..."
                  value={newProjDesc}
                  onChange={e => setNewProjDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateProject(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать проект</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ROLE WITH CHECKBOXES MODAL */}
      {showCreateRole && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateRole(false)}>
          <div className="modal" style={{ maxWidth: '560px' }}>
            <h2>Создать настраиваемую роль</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Отметьте чекбоксы прав, которыми наделяется данная роль в организации
            </p>
            <form onSubmit={handleCreateRole}>
              <div className="form-group">
                <label>Название роли</label>
                <input
                  className="form-input"
                  placeholder="например, Тимлид разработки, Аудитор, HR-менеджер"
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Описание обязанностей</label>
                <input
                  className="form-input"
                  placeholder="Краткое назначение роли"
                  value={newRoleDesc}
                  onChange={e => setNewRoleDesc(e.target.value)}
                />
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', margin: '16px 0' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Матрица привилегий (чекбоксы прав):</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newRoleCanCreateProjects}
                      onChange={e => setNewRoleCanCreateProjects(e.target.checked)}
                    />
                    <span><strong>Создание проектов</strong> (может создавать новые проекты любой категории)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newRoleCanEditTasks}
                      onChange={e => setNewRoleCanEditTasks(e.target.checked)}
                    />
                    <span><strong>Редактирование задач</strong> (может создавать и редактировать задачи в проектах)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newRoleCanApproveTasks}
                      onChange={e => setNewRoleCanApproveTasks(e.target.checked)}
                    />
                    <span><strong>Приёмка и проверка задач</strong> (утверждать или возвращать на доработку выполненные задачи)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newRoleCanViewOrgAnalytics}
                      onChange={e => setNewRoleCanViewOrgAnalytics(e.target.checked)}
                    />
                    <span><strong>Просмотр аналитики организации</strong> (доступ к сводным финансовым KPI и графикам)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newRoleCanManageRoles}
                      onChange={e => setNewRoleCanManageRoles(e.target.checked)}
                    />
                    <span><strong>Управление ролями</strong> (создавать и конфигурировать роли)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newRoleCanManageMembers}
                      onChange={e => setNewRoleCanManageMembers(e.target.checked)}
                    />
                    <span><strong>Управление участниками</strong> (назначать роли и должности сотрудникам)</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateRole(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать роль</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* EDIT ROLE MODAL */}
      {editingRole && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingRole(null)}>
          <div className="modal" style={{ maxWidth: '560px' }}>
            <h2>Редактировать роль: {editingRole.name}</h2>
            <form onSubmit={handleUpdateRole}>
              <div className="form-group">
                <label>Название роли</label>
                <input
                  className="form-input"
                  value={editRoleName}
                  onChange={e => setEditRoleName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Описание обязанностей</label>
                <input
                  className="form-input"
                  value={editRoleDesc}
                  onChange={e => setEditRoleDesc(e.target.value)}
                />
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', margin: '16px 0' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Матрица привилегий (чекбоксы прав):</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={editRoleCanCreateProjects}
                      onChange={e => setEditRoleCanCreateProjects(e.target.checked)}
                    />
                    <span><strong>Создание проектов</strong> (может создавать новые проекты любой категории)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={editRoleCanEditTasks}
                      onChange={e => setEditRoleCanEditTasks(e.target.checked)}
                    />
                    <span><strong>Редактирование задач</strong> (может создавать и редактировать задачи в проектах)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={editRoleCanApproveTasks}
                      onChange={e => setEditRoleCanApproveTasks(e.target.checked)}
                    />
                    <span><strong>Приёмка и проверка задач</strong> (утверждать или возвращать на доработку задачи)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={editRoleCanViewOrgAnalytics}
                      onChange={e => setEditRoleCanViewOrgAnalytics(e.target.checked)}
                    />
                    <span><strong>Просмотр аналитики организации</strong> (доступ к сводным финансовым KPI и графикам)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={editRoleCanManageRoles}
                      onChange={e => setEditRoleCanManageRoles(e.target.checked)}
                    />
                    <span><strong>Управление ролями</strong> (создавать и конфигурировать роли)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={editRoleCanManageMembers}
                      onChange={e => setEditRoleCanManageMembers(e.target.checked)}
                    />
                    <span><strong>Управление участниками</strong> (назначать роли и должности сотрудникам)</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingRole(null)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEPARTMENT MODAL */}
      {editingDept && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingDept(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <h2>Редактировать отдел</h2>
            <form onSubmit={handleUpdateDept}>
              <div className="form-group">
                <label>Название отдела</label>
                <input
                  className="form-input"
                  value={editDeptName}
                  onChange={e => setEditDeptName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Описание функций отдела</label>
                <textarea
                  className="form-textarea"
                  value={editDeptDesc}
                  onChange={e => setEditDeptDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingDept(null)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
