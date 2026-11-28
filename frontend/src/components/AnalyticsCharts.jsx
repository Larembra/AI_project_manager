import React from 'react';

export default function AnalyticsCharts({ data, title = "Аналитический дашборд" }) {
  if (!data) return null;

  const {
    total_revenue = data.revenue ?? 0,
    total_cost = data.cost ?? 0,
    net_profit = data.profit ?? 0,
    total_clients = data.clients ?? 0,
    total_workers = 0,
    total_tasks = data.tasks_total ?? 0,
    completed_tasks = data.tasks_completed ?? 0,
    overdue_tasks = data.tasks_overdue ?? 0,
    in_progress_tasks = data.tasks_in_progress ?? 0,
    projects_breakdown = [],
    timeline = []
  } = data;

  // Расчет максимального значения для шкалы гистограммы
  const maxFinanceValue = Math.max(
    1,
    ...timeline.map(t => Math.max(t.revenue, t.cost, Math.abs(t.profit)))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. KPI СВОДКА */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="label">Общая выручка</p>
          <h2 className="value" style={{ color: 'var(--success)' }}>
            +{total_revenue.toLocaleString('ru-RU')} ₽
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Со всех завершенных задач и сделок
          </p>
        </div>

        <div className="stat-card">
          <p className="label">Фактические расходы</p>
          <h2 className="value" style={{ color: 'var(--danger)' }}>
            -{total_cost.toLocaleString('ru-RU')} ₽
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Затраты проектов и утвержденные чеки
          </p>
        </div>

        <div className="stat-card">
          <p className="label">Чистая прибыль</p>
          <h2
            className="value"
            style={{
              color: net_profit >= 0 ? 'var(--text-primary)' : 'var(--danger)',
              fontWeight: 800
            }}
          >
            {net_profit >= 0 ? '+' : ''}{net_profit.toLocaleString('ru-RU')} ₽
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {net_profit >= 0 ? 'Положительный баланс' : 'Дефицит бюджета'}
          </p>
        </div>

        <div className="stat-card">
          <p className="label">Новые клиенты</p>
          <h2 className="value" style={{ color: 'var(--accent)' }}>
            +{total_clients} чел
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Привлечено маркетингом и продажами
          </p>
        </div>

        <div className="stat-card">
          <p className="label">Выполнено задач</p>
          <h2 className="value">
            {completed_tasks} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {total_tasks}</span>
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {total_tasks > 0 ? `${Math.round((completed_tasks / total_tasks) * 100)}% эффективности` : '0%'}
          </p>
        </div>

        <div className="stat-card">
          <p className="label">Просроченные задачи</p>
          <h2 className="value" style={{ color: overdue_tasks > 0 ? '#ff5252' : 'var(--text-muted)' }}>
            {overdue_tasks}
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {overdue_tasks > 0 ? 'Требуют строгого надзора' : 'Срывов нет'}
          </p>
        </div>
      </div>

      {/* 2. ДИНАМИКА ПО ВРЕМЕНИ (ГИСТОГРАММА) */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Финансовая динамика и выручка (по дням)</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Автоматический учет доходов и расходов по мере выполнения задач сотрудниками
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--success)' }} /> Доходы
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--danger)' }} /> Расходы
            </span>
          </div>
        </div>

        {timeline.length === 0 ? (
          <div className="empty-state">Нет данных о динамике</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, paddingBottom: 24, borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
            {timeline.map((item, idx) => {
              const revHeight = Math.max(4, (item.revenue / maxFinanceValue) * 160);
              const costHeight = Math.max(4, (item.cost / maxFinanceValue) * 160);

              return (
                <div key={idx} style={{ flex: 1, minWidth: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                    {/* Revenue Bar */}
                    <div
                      style={{
                        width: 14,
                        height: `${revHeight}px`,
                        background: 'var(--success)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease'
                      }}
                      title={`Доход: ${item.revenue} ₽`}
                    />
                    {/* Cost Bar */}
                    <div
                      style={{
                        width: 14,
                        height: `${costHeight}px`,
                        background: 'var(--danger)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease'
                      }}
                      title={`Расход: ${item.cost} ₽`}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, whiteSpace: 'nowrap' }}>
                    {item.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. РАСПРЕДЕЛЕНИЕ ПО ПРОЕКТАМ */}
      {projects_breakdown.length > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Вклад проектов в экономику организации</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Проект</th>
                  <th>Категория</th>
                  <th>Доход</th>
                  <th>Расход</th>
                  <th>Чистая прибыль</th>
                  <th>Клиенты</th>
                  <th>Задачи (вып / всего)</th>
                  <th>Просрочки</th>
                </tr>
              </thead>
              <tbody>
                {projects_breakdown.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <span className="badge badge-neutral">{p.category}</span>
                    </td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>
                      +{p.revenue.toLocaleString('ru-RU')} ₽
                    </td>
                    <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      -{p.cost.toLocaleString('ru-RU')} ₽
                    </td>
                    <td style={{ fontWeight: 700, color: p.profit >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
                      {p.profit >= 0 ? '+' : ''}{p.profit.toLocaleString('ru-RU')} ₽
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      +{p.clients}
                    </td>
                    <td>
                      {p.tasks_completed} / {p.tasks_total}
                    </td>
                    <td>
                      {p.tasks_overdue > 0 ? (
                        <span className="badge badge-danger">{p.tasks_overdue}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
