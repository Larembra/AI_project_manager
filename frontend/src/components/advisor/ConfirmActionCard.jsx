import { useState } from 'react';

export default function ConfirmActionCard({ action, onResolve }) {
  const [busy, setBusy] = useState(false);
  const labels = {
    title: 'Название',
    description: 'Описание',
    priority: 'Приоритет',
    start_date: 'Начало',
    due_date: 'Срок',
    status: 'Статус',
    completion_comment: 'Отчёт о выполнении',
    approval_comment: 'Комментарий проверки',
    approved: 'Решение',
    content: 'Содержание',
    category: 'Категория',
    email: 'Email',
    budget: 'Бюджет',
    name: 'Название',
  };

  const resolve = async (confirm) => {
    setBusy(true);
    try {
      await onResolve(action.id, confirm);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 10, border: '1px solid var(--accent)' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Требуется подтверждение</div>
      <div style={{ marginBottom: 12 }}>{action.summary}</div>
      {action.args && Object.keys(action.args).length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '6px 12px', margin: '0 0 14px', fontSize: 13 }}>
          {Object.entries(action.args).filter(([key]) => key !== 'task_id' && key !== 'document_id').map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--text-muted)' }}>{labels[key] || key}</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {key === 'approved' ? (value ? 'Принять' : 'Вернуть на доработку') : String(value ?? '—')}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => resolve(true)}>Подтвердить</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => resolve(false)}>Отклонить</button>
      </div>
    </div>
  );
}
