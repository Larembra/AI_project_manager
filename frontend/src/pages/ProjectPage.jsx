import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import KanbanBoard from '../components/KanbanBoard.jsx';
import GanttChart from '../components/GanttChart.jsx';
import CalendarView from '../components/CalendarView.jsx';
import AnalyticsCharts from '../components/AnalyticsCharts.jsx';

const PROJECT_TABS = [
  { id: 'tasks', label: 'Список задач' },
  { id: 'kanban', label: 'Kanban доска' },
  { id: 'gantt', label: 'Диаграмма Ганта' },
  { id: 'calendar', label: 'Календарь' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'docs', label: 'Документация (RAG)' },
  { id: 'team', label: 'Команда' },
];

export default function ProjectPage() {
  const { orgId, projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Project tasks
  const [tasks, setTasks] = useState([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskStart, setNewTaskStart] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');

  // Complete task modal (Business Metrics)
  const [completingTask, setCompletingTask] = useState(null);
  const [compRevenue, setCompRevenue] = useState(0);
  const [compCost, setCompCost] = useState(0);
  const [compClients, setCompClients] = useState(0);
  const [compComment, setCompComment] = useState('');

  // Approve / Reject modal
  const [approvingTask, setApprovingTask] = useState(null);
  const [approvalDecision, setApprovalDecision] = useState(true); // true = approve, false = reject
  const [approvalComment, setApprovalComment] = useState('');

  // Project members & org context
  const [members, setMembers] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [org, setOrg] = useState(null);
  const [currentMember, setCurrentMember] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [memberProjectRole, setMemberProjectRole] = useState('Сотрудник');

  // Edit Task modal
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskPriority, setEditTaskPriority] = useState('medium');
  const [editTaskAssignee, setEditTaskAssignee] = useState('');
  const [editTaskStart, setEditTaskStart] = useState('');
  const [editTaskDue, setEditTaskDue] = useState('');
  const [editTaskStatus, setEditTaskStatus] = useState('todo');

  // Edit Project modal
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjName, setEditProjName] = useState('');
  const [editProjDesc, setEditProjDesc] = useState('');
  const [editProjCat, setEditProjCat] = useState('development');
  const [editProjStatus, setEditProjStatus] = useState('active');
  const [editProjBudget, setEditProjBudget] = useState(0);
  const [editProjStart, setEditProjStart] = useState('');
  const [editProjEnd, setEditProjEnd] = useState('');
  const [githubIntegration, setGithubIntegration] = useState(null);
  const [editRepoUrl, setEditRepoUrl] = useState('');
  const [editGithubToken, setEditGithubToken] = useState('');
  const [removeGithubToken, setRemoveGithubToken] = useState(false);

  // Project documents (RAG) & edit doc
  const [docs, setDocs] = useState([]);
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocCat, setNewDocCat] = useState('general');

  const [editingDoc, setEditingDoc] = useState(null);
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocContent, setEditDocContent] = useState('');
  const [editDocCat, setEditDocCat] = useState('general');

  // Analytics & Calendar
  const [analytics, setAnalytics] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);

  // Project AI Assistant
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      api.getProjectAnalytics(projectId).then(setAnalytics).catch(() => {});
    } else if (activeTab === 'calendar') {
      api.getProjectCalendar(projectId).then(setCalendarEvents).catch(() => {});
    } else if (activeTab === 'docs') {
      api.getProjectDocs(projectId).then(setDocs).catch(() => {});
    } else if (activeTab === 'team') {
      api.getProjectMembers(projectId).then(setMembers).catch(() => {});
      api.getMembers(orgId).then(setOrgMembers).catch(() => {});
    }
  }, [activeTab, projectId, orgId]);

  const loadProjectData = async () => {
    setLoading(true);
    try {
      const [pData, tData, mData, oData, orgMembersData] = await Promise.all([
        api.getProject(projectId),
        api.getProjectTasks(projectId),
        api.getProjectMembers(projectId),
        api.getOrganization(orgId),
        api.getMembers(orgId),
      ]);
      setProject(pData);
      setTasks(tData);
      setMembers(mData);
      setOrg(oData);
      setOrgMembers(orgMembersData);
      const cur = orgMembersData.find(m => m.user_id === user.id);
      setCurrentMember(cur || null);
    } catch (err) {
      setError('Не удалось загрузить данные проекта: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- TASK ACTIONS ---
  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      const t = await api.createProjectTask(projectId, {
        title: newTaskTitle,
        description: newTaskDesc || null,
        priority: newTaskPriority,
        assignee_id: newTaskAssignee || null,
        start_date: newTaskStart || null,
        due_date: newTaskDue || null,
      });
      setTasks(prev => [...prev, t]);
      setShowCreateTask(false);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskStart('');
      setNewTaskDue('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenCompleteTask = (t) => {
    setCompletingTask(t);
    setCompRevenue(0);
    setCompCost(0);
    setCompClients(0);
    setCompComment('');
  };

  const handleSubmitCompleteTask = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.completeTask(completingTask.id, {
        revenue_impact: parseFloat(compRevenue) || 0.0,
        cost_impact: parseFloat(compCost) || 0.0,
        clients_acquired: parseInt(compClients, 10) || 0,
        completion_comment: compComment || null,
      });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      setCompletingTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenApproveTask = (t, isApprove) => {
    setApprovingTask(t);
    setApprovalDecision(isApprove);
    setApprovalComment('');
  };

  const handleSubmitApproveTask = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.approveTask(approvingTask.id, {
        approved: approvalDecision,
        approval_comment: approvalComment || null,
      });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      setApprovingTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Удалить задачу?')) return;
    try {
      await api.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (editingTask?.id === taskId) setEditingTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenEditTask = (t) => {
    setEditingTask(t);
    setEditTaskTitle(t.title || '');
    setEditTaskDesc(t.description || '');
    setEditTaskPriority(t.priority || 'medium');
    setEditTaskAssignee(t.assignee_id || '');
    setEditTaskStart(t.start_date || '');
    setEditTaskDue(t.due_date || '');
    setEditTaskStatus(t.status || 'todo');
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    if (!editingTask) return;
    try {
      const updated = await api.updateTask(editingTask.id, {
        title: editTaskTitle,
        description: editTaskDesc || null,
        priority: editTaskPriority,
        assignee_id: editTaskAssignee || null,
        start_date: editTaskStart || null,
        due_date: editTaskDue || null,
        status: editTaskStatus,
      });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditingTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // --- PROJECT ACTIONS ---
  const handleOpenEditProject = () => {
    if (!project) return;
    setEditProjName(project.name || '');
    setEditProjDesc(project.description || '');
    setEditProjCat(project.category || 'development');
    setEditProjStatus(project.status || 'active');
    setEditProjBudget(project.budget || 0);
    setEditProjStart(project.start_date || '');
    setEditProjEnd(project.end_date || '');
    api.getGitHubIntegration(projectId).then((integration) => {
      setGithubIntegration(integration);
      setEditRepoUrl(integration.repo_url || '');
      setEditGithubToken('');
      setRemoveGithubToken(false);
    }).catch((err) => alert(err.message));
    setShowEditProject(true);
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateProject(projectId, {
        name: editProjName,
        description: editProjDesc || null,
        category: editProjCat,
        status: editProjStatus,
        budget: parseFloat(editProjBudget) || 0,
        start_date: editProjStart || null,
        end_date: editProjEnd || null,
      });
      const integration = await api.updateGitHubIntegration(projectId, {
        repo_url: editRepoUrl.trim() || null,
        token: editGithubToken.trim() || null,
        remove_token: removeGithubToken,
      });
      if (integration.warning) alert(integration.warning);
      setGithubIntegration(integration);
      setProject(updated);
      setShowEditProject(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm('Вы действительно хотите удалить этот проект и все его задачи? Действие необратимо.')) return;
    try {
      await api.deleteProject(projectId);
      navigate(`/organizations/${orgId}`);
    } catch (err) {
      alert(err.message);
    }
  };

  // --- DOCS ACTIONS ---
  const handleCreateDoc = async (e) => {
    e.preventDefault();
    try {
      const doc = await api.createProjectDoc(projectId, {
        title: newDocTitle,
        content: newDocContent,
        category: newDocCat,
      });
      setDocs(prev => [doc, ...prev]);
      setShowCreateDoc(false);
      setNewDocTitle('');
      setNewDocContent('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenEditDoc = (d) => {
    setEditingDoc(d);
    setEditDocTitle(d.title || '');
    setEditDocContent(d.content || '');
    setEditDocCat(d.category || 'general');
  };

  const handleUpdateDoc = async (e) => {
    e.preventDefault();
    if (!editingDoc) return;
    try {
      const updated = await api.updateProjectDoc(editingDoc.id, {
        title: editDocTitle,
        content: editDocContent,
        category: editDocCat,
      });
      setDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
      setEditingDoc(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!confirm('Удалить документ?')) return;
    try {
      await api.deleteProjectDoc(docId);
      setDocs(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      alert(err.message);
    }
  };

  // --- TEAM ACTIONS ---
  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      const m = await api.addProjectMember(projectId, {
        user_id: selectedUserToAdd,
        role_in_project: memberProjectRole,
      });
      setMembers(prev => [...prev, m]);
      setShowAddMember(false);
      setSelectedUserToAdd('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Исключить участника из проекта?')) return;
    try {
      await api.removeProjectMember(projectId, userId);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateMemberRole = async (userId, newRole) => {
    try {
      const updated = await api.updateProjectMember(projectId, userId, { role_in_project: newRole });
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role_in_project: updated.role_in_project } : m));
    } catch (err) {
      alert(err.message);
    }
  };

  // --- PROJECT AI ASSISTANT ---
  const handleAskProjectAI = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiReply('');
    try {
      const res = await api.askAI({
        prompt: aiPrompt,
        project_id: projectId,
        organization_id: orgId,
      });
      setAiReply(res.answer);
      setAiPrompt('');
    } catch (err) {
      alert(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const isProjectOrganizer = members.some(m => m.user_id === user?.id && (m.role_in_project === 'Организатор' || m.role_in_project === 'Руководитель проекта'));
  const isOwner = org?.owner_id === user?.id || currentMember?.role === 'moderator' || currentMember?.permissions?.is_owner;
  const isOrganizer = isOwner || isProjectOrganizer;
  const canEditTasks = isOrganizer || currentMember?.permissions?.can_edit_tasks;
  const canApproveTasks = isOrganizer || currentMember?.permissions?.can_approve_tasks;
  const canCreateProjects = isOrganizer || currentMember?.permissions?.can_create_projects;
  const canManageMembers = isOrganizer || currentMember?.permissions?.can_manage_members;

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="page-body"><div className="alert alert-error">{error}</div></div>;
  if (!project) return <div className="page-body"><div className="alert alert-error">Проект не найден</div></div>;

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Link to={`/organizations/${orgId}`} style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                ← Назад к организации
              </Link>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: 10 }}>
                {project.category}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.3px' }}>{project.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {project.description || 'Нет описания проекта'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="card" style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Бюджет</span>
              <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>{project.budget.toLocaleString('ru-RU')} ₽</strong>
            </div>
            <div className="card" style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Статус</span>
              <span className={`badge ${project.status === 'active' ? 'badge-success' : 'badge-neutral'}`} style={{ marginTop: 2 }}>
                {project.status === 'active' ? 'Активен' : project.status}
              </span>
            </div>
            {canCreateProjects && (
              <button className="btn btn-secondary btn-sm" onClick={handleOpenEditProject}>
                Редактировать проект
              </button>
            )}
          </div>
        </div>

        {/* PROJECT TABS */}
        <div className="tabs" style={{ marginTop: 20 }}>
          {PROJECT_TABS.map(tab => (
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
        {/* ===================== TAB 1: TASKS ===================== */}
        {activeTab === 'tasks' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Задачи проекта ({tasks.length})</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('kanban')}>
                  Kanban доска
                </button>
                {canEditTasks && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTask(true)}>
                    + Добавить задачу
                  </button>
                )}
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="empty-state">
                <p>В этом проекте пока нет задач</p>
                {canEditTasks && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateTask(true)}>
                    Создать первую задачу
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tasks.map(t => {
                  const isCompleted = t.status === 'completed';
                  const isOverdue = !isCompleted && t.due_date && new Date(t.due_date).getTime() < Date.now();

                  return (
                    <div
                      key={t.id}
                      className="card"
                      style={{
                        padding: 16,
                        borderLeft: `4px solid ${
                          isCompleted
                            ? 'var(--success)'
                            : isOverdue
                            ? '#d32f2f'
                            : 'var(--accent)'
                        }`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 16
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <h3
                            style={{
                              margin: 0,
                              fontSize: 15,
                              textDecoration: isCompleted ? 'line-through' : 'none',
                              color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                              cursor: canEditTasks ? 'pointer' : 'default',
                            }}
                            onClick={() => canEditTasks && handleOpenEditTask(t)}
                            title={canEditTasks ? 'Нажмите для редактирования задачи' : undefined}
                          >
                            {t.title}
                          </h3>
                          <span className={`badge ${
                            t.priority === 'urgent' ? 'badge-danger' :
                            t.priority === 'high' ? 'badge-warning' :
                            'badge-neutral'
                          }`}>
                            {t.priority}
                          </span>
                          <span className={`badge ${isCompleted ? 'badge-success' : 'badge-neutral'}`}>
                            {t.status === 'completed' ? 'Выполнена' :
                             t.status === 'in_progress' ? 'В работе' :
                             t.status === 'review' ? 'На проверке' : 'К выполнению'}
                          </span>
                          {t.approval_status === 'approved' && (
                            <span className="badge badge-success" title={`Подтверждено: ${t.approved_by_name || ''}`}>
                              ✓ Подтверждено
                            </span>
                          )}
                          {t.approval_status === 'rejected' && (
                            <span className="badge badge-danger" title={`Возвращено: ${t.approval_comment || ''}`}>
                              ✕ Возвращено на доработку
                            </span>
                          )}
                        </div>

                        {t.description && (
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            {t.description}
                          </p>
                        )}

                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>Исполнитель: <strong style={{ color: 'var(--text-primary)' }}>{t.assignee_name || 'Не назначен'}</strong></span>
                          {t.due_date && (
                            <span style={{ color: isOverdue ? '#ff5252' : 'inherit' }}>
                              Дедлайн: {new Date(t.due_date).toLocaleDateString('ru-RU')} {isOverdue && '(Просрочен!)'}
                            </span>
                          )}
                        </div>

                        {/* Финансовые и клиентские результаты выполнения */}
                        {isCompleted && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: '8px 12px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 12,
                              display: 'flex',
                              gap: 16,
                              flexWrap: 'wrap'
                            }}
                          >
                            <span style={{ color: 'var(--success)' }}>
                              Доход: <strong>+{t.revenue_impact.toLocaleString('ru-RU')} ₽</strong>
                            </span>
                            <span style={{ color: 'var(--danger)' }}>
                              Расход: <strong>-{t.cost_impact.toLocaleString('ru-RU')} ₽</strong>
                            </span>
                            <span style={{ color: 'var(--accent)' }}>
                              Клиенты: <strong>+{t.clients_acquired}</strong>
                            </span>
                            {t.completion_comment && (
                              <span style={{ color: 'var(--text-secondary)' }}>
                                Отчет: «{t.completion_comment}»
                              </span>
                            )}
                          </div>
                        )}
                        {t.approval_comment && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#ffb74d' }}>
                            Замечание проверяющего: «{t.approval_comment}»
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                        {canEditTasks && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenEditTask(t)}
                            title="Редактировать параметры задачи"
                          >
                            Редактировать
                          </button>
                        )}

                        {!isCompleted && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleOpenCompleteTask(t)}
                          >
                            ✓ Завершить
                          </button>
                        )}

                        {/* Подтверждение или возврат задачи проверяющим */}
                        {isCompleted && canApproveTasks && t.approval_status !== 'approved' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ borderColor: 'var(--success)', color: 'var(--success)' }}
                            onClick={() => handleOpenApproveTask(t, true)}
                          >
                            Подтвердить
                          </button>
                        )}

                        {isCompleted && canApproveTasks && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                            onClick={() => handleOpenApproveTask(t, false)}
                            title="Разотметить задачу и вернуть сотруднику с замечанием"
                          >
                            Разотметить
                          </button>
                        )}

                        {canEditTasks && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteTask(t.id)}
                            title="Удалить задачу"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 2: KANBAN BOARD ===================== */}
        {activeTab === 'kanban' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, margin: 0 }}>Kanban-доска проекта</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Интерактивная доска задач проекта «{project?.name}». Задачи синхронизированы со списком, календарем и диаграммой Ганта.
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => project?.board_id ? setKanbanRefreshKey((key) => key + 1) : loadProjectData()}>
                Обновить
              </button>
            </div>

            {project?.board_id ? (
              <KanbanBoard
                key={`${project.board_id}-${kanbanRefreshKey}`}
                orgId={orgId}
                initialBoardId={project.board_id}
                hideBoardSelector={true}
                isModerator={isProjectOrganizer}
                canEditTasks={canEditTasks}
              />
            ) : (
              <div className="card empty-state" style={{ padding: '30px', textAlign: 'center' }}>
                <p>Доска проекта инициализируется...</p>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 3: GANTT CHART ===================== */}
        {activeTab === 'gantt' && (
          <GanttChart
            tasks={tasks}
            onTaskClick={(t) => handleOpenEditTask(t)}
            onReorderTasks={(newTasks) => setTasks(newTasks)}
          />
        )}

        {/* ===================== TAB 3: CALENDAR ===================== */}
        {activeTab === 'calendar' && (
          <CalendarView
            events={calendarEvents}
            orgId={orgId}
            onEventClick={(ev) => {
              const found = tasks.find(t => t.id === ev.id);
              if (found) handleOpenEditTask(found);
            }}
          />
        )}

        {/* ===================== TAB 4: ANALYTICS ===================== */}
        {activeTab === 'analytics' && (
          <AnalyticsCharts data={analytics} title={`Аналитика проекта: ${project.name}`} />
        )}

        {/* ===================== TAB 5: DOCUMENTATION (RAG) ===================== */}
        {activeTab === 'docs' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, margin: 0 }}>Документация и база знаний проекта</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Статьи, ТЗ, регламенты и отчеты. Единый AI-ассистент автоматически использует эти документы для анализа и ответов (RAG).
                </p>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateDoc(true)}>
                + Добавить документ
              </button>
            </div>

            {docs.length === 0 ? (
              <div className="empty-state">
                <p>Документы проекта пока не загружены</p>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateDoc(true)}>
                  Создать документ
                </button>
              </div>
            ) : (
              <div className="card-grid">
                {docs.map(d => (
                  <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: 16, wordBreak: 'break-word', flex: '1 1 140px' }}>{d.title}</h3>
                        <span className="badge badge-neutral" style={{ fontSize: 10, flexShrink: 0 }}>{d.category}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', wordBreak: 'break-word' }}>
                        {d.content}
                      </p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>Автор: {d.author_name}</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEditDoc(d)}>
                          Редактировать
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDoc(d.id)}>
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 6: TEAM ===================== */}
        {activeTab === 'team' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Участники проекта ({members.length})</h2>
              {canManageMembers && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddMember(true)}>
                  + Назначить сотрудника
                </button>
              )}
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Email</th>
                    <th>Роль в проекте</th>
                    <th>Дата присоединения</th>
                    {canManageMembers && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.full_name}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                      <td>
                        {canManageMembers ? (
                          <select
                            className="form-select"
                            style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                            value={m.role_in_project === 'Руководитель проекта' ? 'Организатор' : m.role_in_project}
                            onChange={(e) => handleUpdateMemberRole(m.user_id, e.target.value)}
                          >
                            <option value="Сотрудник">Сотрудник</option>
                            <option value="Организатор">Организатор</option>
                          </select>
                        ) : (
                          <span className={`badge ${m.role_in_project === 'Организатор' || m.role_in_project === 'Руководитель проекта' ? 'badge-danger' : 'badge-neutral'}`}>
                            {m.role_in_project === 'Руководитель проекта' ? 'Организатор' : m.role_in_project}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(m.joined_at).toLocaleDateString('ru-RU')}
                      </td>
                      {canManageMembers && (
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => handleRemoveMember(m.user_id)}>
                            Исключить
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================== PROJECT AI ASSISTANT BOX ===================== */}
        <div className="card" style={{ marginTop: 32, border: '1px solid var(--accent)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span className="badge badge-danger" style={{ fontWeight: 700, padding: '4px 8px', fontSize: 11 }}>AI</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--accent)' }}>AI-ассистент проекта «{project.name}»</h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Анализирует задачи, сроки, метрики и документы проекта. Строгий директивный советник.
              </p>
            </div>
          </div>

          {aiReply && (
            <div
              style={{
                background: 'var(--bg-card)',
                padding: '14px 18px',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                border: '1px solid var(--border-color)',
                marginBottom: 12
              }}
            >
              {aiReply}
            </div>
          )}

          <form onSubmit={handleAskProjectAI} style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Спросите ассистента о статусе задач, рисках проекта или регламентах из документов..."
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              disabled={aiLoading}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={aiLoading || !aiPrompt.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {aiLoading ? 'Анализ...' : 'Спросить ассистента'}
            </button>
          </form>
        </div>
      </div>

      {/* MODAL: CREATE TASK */}
      {showCreateTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreateTask(false)}>
          <div className="modal">
            <h2>Добавить задачу в проект</h2>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label>Название задачи</label>
                <input
                  className="form-input"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="например, Провести презентацию клиенту"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Описание</label>
                <textarea
                  className="form-textarea"
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder="Подробности и требования..."
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Приоритет</label>
                  <select
                    className="form-select"
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value)}
                  >
                    <option value="low">Низкий (Low)</option>
                    <option value="medium">Средний (Medium)</option>
                    <option value="high">Высокий (High)</option>
                    <option value="urgent">Срочно (Urgent)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Исполнитель</label>
                  <select
                    className="form-select"
                    value={newTaskAssignee}
                    onChange={e => setNewTaskAssignee(e.target.value)}
                  >
                    <option value="">Не назначен</option>
                    {members.map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Дата начала (для Ганта)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newTaskStart}
                    onChange={e => setNewTaskStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Дедлайн (для календаря)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newTaskDue}
                    onChange={e => setNewTaskDue(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateTask(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать задачу</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPLETE TASK WITH BUSINESS METRICS */}
      {completingTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCompletingTask(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>Завершение задачи: {completingTask.title}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Укажите фактические бизнес-результаты задачи. Эти данные автоматически добавятся в аналитику проекта и всей организации!
            </p>
            <form onSubmit={handleSubmitCompleteTask}>
              <div className="form-row">
                <div className="form-group">
                  <label>Принесенный доход (₽)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={compRevenue}
                    onChange={e => setCompRevenue(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Фактический расход (₽)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={compCost}
                    onChange={e => setCompCost(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Привлечено новых клиентов (чел)</label>
                <input
                  type="number"
                  className="form-input"
                  value={compClients}
                  onChange={e => setCompClients(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Комментарий / краткий отчет</label>
                <textarea
                  className="form-textarea"
                  value={compComment}
                  onChange={e => setCompComment(e.target.value)}
                  placeholder="Что было сделано, итоги кампании или сдачи..."
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCompletingTask(null)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Зафиксировать результат</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: APPROVE OR REJECT TASK */}
      {approvingTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setApprovingTask(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2>{approvalDecision ? 'Подтверждение задачи' : 'Возврат задачи на доработку'}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {approvalDecision
                ? `Подтвердить надлежащее выполнение задачи «${approvingTask.title}»?`
                : `Разотметить задачу «${approvingTask.title}» и вернуть её исполнителю в работу?`}
            </p>
            <form onSubmit={handleSubmitApproveTask}>
              <div className="form-group">
                <label>Замечание или комментарий проверяющего</label>
                <textarea
                  className="form-textarea"
                  value={approvalComment}
                  onChange={e => setApprovalComment(e.target.value)}
                  placeholder={approvalDecision ? 'Все требования соблюдены (опционально)' : 'Укажите, что необходимо исправить...'}
                  required={!approvalDecision}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setApprovingTask(null)}>Отмена</button>
                <button
                  type="submit"
                  className={`btn ${approvalDecision ? 'btn-primary' : 'btn-danger'}`}
                >
                  {approvalDecision ? 'Подтвердить выполнение' : 'Вернуть в работу'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE DOCUMENT (RAG) */}
      {showCreateDoc && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreateDoc(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2>Добавить документ в базу знаний проекта</h2>
            <form onSubmit={handleCreateDoc}>
              <div className="form-group">
                <label>Название документа</label>
                <input
                  className="form-input"
                  value={newDocTitle}
                  onChange={e => setNewDocTitle(e.target.value)}
                  placeholder="например, Техническое задание v1.0"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Категория</label>
                <select
                  className="form-select"
                  value={newDocCat}
                  onChange={e => setNewDocCat(e.target.value)}
                >
                  <option value="specs">Техническое задание (ТЗ)</option>
                  <option value="guidelines">Регламент / Инструкция</option>
                  <option value="reports">Отчет / Анализ</option>
                  <option value="general">Общее</option>
                </select>
              </div>
              <div className="form-group">
                <label>Содержание документа</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 180 }}
                  value={newDocContent}
                  onChange={e => setNewDocContent(e.target.value)}
                  placeholder="Текст документации, регламента или ТЗ..."
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateDoc(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Сохранить документ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEMBER TO PROJECT */}
      {showAddMember && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddMember(false)}>
          <div className="modal" style={{ maxWidth: 450 }}>
            <h2>Назначить сотрудника в проект</h2>
            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label>Сотрудник организации</label>
                <select
                  className="form-select"
                  value={selectedUserToAdd}
                  onChange={e => setSelectedUserToAdd(e.target.value)}
                  required
                >
                  <option value="">Выберите сотрудника...</option>
                  {orgMembers
                    .filter(om => !members.some(pm => pm.user_id === om.user_id))
                    .map(om => (
                      <option key={om.user_id} value={om.user_id}>
                        {om.full_name} ({om.email})
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Роль в проекте</label>
                <select
                  className="form-select"
                  value={memberProjectRole}
                  onChange={e => setMemberProjectRole(e.target.value)}
                  required
                >
                  <option value="Сотрудник">Сотрудник</option>
                  <option value="Организатор">Организатор</option>
                </select>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Организатор проекта может управлять задачами, принимать выполнение и назначать команду.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Назначить</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: EDIT TASK */}
      {editingTask && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingTask(null)}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Редактировать задачу</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingTask(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateTask}>
              <div className="form-group">
                <label>Название задачи</label>
                <input
                  className="form-input"
                  value={editTaskTitle}
                  onChange={e => setEditTaskTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Приоритет</label>
                  <select
                    className="form-select"
                    value={editTaskPriority}
                    onChange={e => setEditTaskPriority(e.target.value)}
                  >
                    <option value="low">Низкий (Low)</option>
                    <option value="medium">Средний (Medium)</option>
                    <option value="high">Высокий (High)</option>
                    <option value="urgent">Срочно (Urgent)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Статус</label>
                  <select
                    className="form-select"
                    value={editTaskStatus}
                    onChange={e => setEditTaskStatus(e.target.value)}
                  >
                    <option value="todo">К выполнению (Todo)</option>
                    <option value="in_progress">В работе (In progress)</option>
                    <option value="review">На проверке (Review)</option>
                    <option value="completed">Выполнена (Completed)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Исполнитель</label>
                <select
                  className="form-select"
                  value={editTaskAssignee}
                  onChange={e => setEditTaskAssignee(e.target.value)}
                >
                  <option value="">Не назначен</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name} ({m.role_in_project})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Дата старта</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editTaskStart}
                    onChange={e => setEditTaskStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Дедлайн</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editTaskDue}
                    onChange={e => setEditTaskDue(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Описание задачи</label>
                <textarea
                  className="form-textarea"
                  value={editTaskDesc}
                  onChange={e => setEditTaskDesc(e.target.value)}
                  placeholder="Подробности и инструкции к задаче..."
                />
              </div>
              <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteTask(editingTask.id)}
                >
                  Удалить задачу
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingTask(null)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Сохранить изменения
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PROJECT */}
      {showEditProject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditProject(false)}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Настройки и параметры проекта</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEditProject(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdateProject}>
              <div className="form-group">
                <label>Название проекта</label>
                <input
                  className="form-input"
                  value={editProjName}
                  onChange={e => setEditProjName(e.target.value)}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Направление / Категория</label>
                  <select
                    className="form-select"
                    value={editProjCat}
                    onChange={e => setEditProjCat(e.target.value)}
                  >
                    <option value="development">Разработка</option>
                    <option value="business_analysis">Бизнес-аналитика</option>
                    <option value="marketing">Маркетинг</option>
                    <option value="hr">HR</option>
                    <option value="logistics">Логистика</option>
                    <option value="finance">Финансы</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Статус</label>
                  <select
                    className="form-select"
                    value={editProjStatus}
                    onChange={e => setEditProjStatus(e.target.value)}
                  >
                    <option value="active">Активен</option>
                    <option value="completed">Завершен</option>
                    <option value="archived">В архиве</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Бюджет проекта (₽)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={editProjBudget}
                  onChange={e => setEditProjBudget(e.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Дата начала</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editProjStart}
                    onChange={e => setEditProjStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Дата завершения</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editProjEnd}
                    onChange={e => setEditProjEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Описание и цели</label>
                <textarea
                  className="form-textarea"
                  value={editProjDesc}
                  onChange={e => setEditProjDesc(e.target.value)}
                  rows={3}
                />
              </div>
              {(isOwner || currentMember?.permissions?.can_create_projects) && <>
                <div className="form-group">
                  <label>Репозиторий GitHub (необязательно)</label>
                  <input className="form-input" type="url" placeholder="https://github.com/owner/repository" value={editRepoUrl} onChange={e => setEditRepoUrl(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Токен GitHub (PAT)</label>
                  <input className="form-input" type="password" autoComplete="new-password" placeholder={githubIntegration?.token_configured ? `Токен задан ••••${githubIntegration.token_last4}` : 'github_pat_…'} value={editGithubToken} onChange={e => setEditGithubToken(e.target.value)} />
                  <small style={{ color: 'var(--text-muted)' }}>Токен используется только для чтения выбранного репозитория.</small>
                  {githubIntegration?.token_configured && <label style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={removeGithubToken} onChange={e => setRemoveGithubToken(e.target.checked)} /> Удалить сохранённый токен
                  </label>}
                </div>
              </>}
              <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                {isOwner && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteProject}
                  >
                    Удалить проект
                  </button>
                )}
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEditProject(false)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Сохранить изменения
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT DOCUMENT (RAG) */}
      {editingDoc && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingDoc(null)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Редактировать документ</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingDoc(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateDoc}>
              <div className="form-group">
                <label>Название документа</label>
                <input
                  className="form-input"
                  value={editDocTitle}
                  onChange={e => setEditDocTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Категория</label>
                <select
                  className="form-select"
                  value={editDocCat}
                  onChange={e => setEditDocCat(e.target.value)}
                >
                  <option value="specs">Техническое задание (ТЗ)</option>
                  <option value="guidelines">Регламент / Инструкция</option>
                  <option value="reports">Отчет / Анализ</option>
                  <option value="general">Общее</option>
                </select>
              </div>
              <div className="form-group">
                <label>Содержание документа</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 180 }}
                  value={editDocContent}
                  onChange={e => setEditDocContent(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    handleDeleteDoc(editingDoc.id);
                    setEditingDoc(null);
                  }}
                >
                  Удалить документ
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingDoc(null)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Сохранить изменения
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
