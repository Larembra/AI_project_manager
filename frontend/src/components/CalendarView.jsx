import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function CalendarView({ events = [], onEventClick, orgId }) {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Первый и последний день текущего месяца
  const { daysInMonth, startDayOffset, monthName } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const mName = firstDay.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

    return {
      daysInMonth: lastDay.getDate(),
      startDayOffset: startDay,
      monthName: mName.charAt(0).toUpperCase() + mName.slice(1)
    };
  }, [year, month]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  // Группировка событий по датам (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(e => {
      const dateStr = (e.end || e.start || '').slice(0, 10);
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(e);
    });
    return map;
  }, [events]);

  const calendarCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < startDayOffset; i++) {
      cells.push({ dayNumber: null, key: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = new Date().toISOString().slice(0, 10) === dateStr;
      cells.push({
        dayNumber: d,
        dateStr,
        isToday,
        events: eventsByDate[dateStr] || [],
        key: `day-${d}`
      });
    }
    return cells;
  }, [year, month, daysInMonth, startDayOffset, eventsByDate]);

  const handleEventItemClick = (e, ev) => {
    e.stopPropagation();
    setSelectedEvent(ev);
  };

  const handleGoToTask = (ev) => {
    setSelectedEvent(null);
    if (onEventClick) {
      onEventClick(ev);
      return;
    }
    if (ev.project_id) {
      const targetOrg = orgId || ev.organization_id;
      if (targetOrg) {
        navigate(`/organizations/${targetOrg}/projects/${ev.project_id}`);
      }
    }
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* HEADER CONTROLS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{monthName}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Нажмите на любое событие в ячейке дня, чтобы просмотреть детали и перейти к задаче
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handlePrevMonth}>←</button>
          <button className="btn btn-secondary btn-sm" onClick={handleToday}>Сегодня</button>
          <button className="btn btn-secondary btn-sm" onClick={handleNextMonth}>→</button>
        </div>
      </div>

      {/* WEEKDAY HEADERS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8, textAlign: 'center' }}>
        {WEEKDAYS.map((w, idx) => (
          <div key={idx} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
            {w}
          </div>
        ))}
      </div>

      {/* CALENDAR GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {calendarCells.map(c => {
          if (!c.dayNumber) {
            return <div key={c.key} style={{ minHeight: 95, background: 'transparent' }} />;
          }

          return (
            <div
              key={c.key}
              style={{
                minHeight: 100,
                background: c.isToday ? 'rgba(211, 47, 47, 0.08)' : 'var(--bg-secondary)',
                border: c.isToday ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: c.isToday ? 700 : 500,
                    color: c.isToday ? 'var(--accent)' : 'var(--text-secondary)'
                  }}
                >
                  {c.dayNumber}
                </span>
                {c.events.length > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {c.events.length} соб.
                  </span>
                )}
              </div>

              {/* Day Events */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', maxHeight: 85 }}>
                {c.events.map((ev, eIdx) => {
                  const isAbsence = ev.type === 'absence';
                  const isCompleted = ev.status === 'completed';

                  return (
                    <div
                      key={eIdx}
                      onClick={(e) => handleEventItemClick(e, ev)}
                      style={{
                        fontSize: 11,
                        padding: '3px 6px',
                        borderRadius: 3,
                        background: isAbsence
                          ? 'var(--warning-bg)'
                          : isCompleted
                          ? 'var(--success-bg)'
                          : 'var(--accent-glow)',
                        color: isAbsence
                          ? 'var(--warning)'
                          : isCompleted
                          ? 'var(--success)'
                          : 'var(--accent)',
                        border: '1px solid transparent',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                      }}
                      title={`${ev.title} — Кликните для перехода`}
                    >
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* EVENT DETAILS INTERACTIVE MODAL */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedEvent(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: 10 }}>
                  {selectedEvent.type === 'absence' ? 'Отсутствие' : 'Задача проекта'}
                </span>
                <h3 style={{ margin: '8px 0 0', fontSize: 17, color: 'var(--text-primary)' }}>
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedEvent(null)}
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {selectedEvent.project_name && (
                <div>
                  Проект: <strong style={{ color: 'var(--text-primary)' }}>{selectedEvent.project_name}</strong>
                </div>
              )}
              {selectedEvent.status && (
                <div>
                  Статус:{' '}
                  <span className={`badge ${
                    selectedEvent.status === 'completed' ? 'badge-success' :
                    selectedEvent.status === 'in_progress' ? 'badge-info' : 'badge-neutral'
                  }`}>
                    {selectedEvent.status === 'completed' ? 'Выполнена' :
                     selectedEvent.status === 'in_progress' ? 'В работе' :
                     selectedEvent.status === 'review' ? 'На проверке' : 'К выполнению'}
                  </span>
                </div>
              )}
              {selectedEvent.priority && (
                <div>
                  Приоритет: <strong style={{ color: 'var(--text-primary)' }}>{selectedEvent.priority}</strong>
                </div>
              )}
              {selectedEvent.user_name && (
                <div>
                  Сотрудник: <strong style={{ color: 'var(--text-primary)' }}>{selectedEvent.user_name}</strong>
                </div>
              )}
              <div>
                Сроки:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {new Date(selectedEvent.start).toLocaleDateString('ru-RU')}
                  {selectedEvent.end && selectedEvent.end !== selectedEvent.start && (
                    ` — ${new Date(selectedEvent.end).toLocaleDateString('ru-RU')}`
                  )}
                </strong>
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedEvent(null)}
              >
                Закрыть
              </button>
              {selectedEvent.type === 'task' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleGoToTask(selectedEvent)}
                >
                  Перейти к задаче →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
