import { useState, useEffect, useMemo } from 'react';

export default function GanttChart({ tasks = [], onTaskClick, onReorderTasks }) {
  const [orderedTasks, setOrderedTasks] = useState(tasks);
  const [draggedIdx, setDraggedIdx] = useState(null);

  useEffect(() => {
    setOrderedTasks(tasks);
  }, [tasks]);

  const moveRow = (index, direction) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= orderedTasks.length) return;
    const updated = [...orderedTasks];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIdx, 0, moved);
    setOrderedTasks(updated);
    if (onReorderTasks) onReorderTasks(updated);
  };

  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const updated = [...orderedTasks];
    const [moved] = updated.splice(draggedIdx, 1);
    updated.splice(index, 0, moved);
    setDraggedIdx(index);
    setOrderedTasks(updated);
    if (onReorderTasks) onReorderTasks(updated);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  // Находим минимальную и максимальную даты среди задач
  const { startDate, endDate, totalDays, taskBars } = useMemo(() => {
    if (!orderedTasks || orderedTasks.length === 0) {
      const now = new Date();
      return { startDate: now, endDate: now, totalDays: 14, taskBars: [] };
    }

    let minTime = Infinity;
    let maxTime = -Infinity;

    orderedTasks.forEach(t => {
      const start = t.start_date ? new Date(t.start_date).getTime() : (t.due_date ? new Date(t.due_date).getTime() - 86400000 * 3 : Date.now());
      const end = t.due_date ? new Date(t.due_date).getTime() : start + 86400000 * 3;
      if (start < minTime) minTime = start;
      if (end > maxTime) maxTime = end;
    });

    if (minTime === Infinity) {
      minTime = Date.now() - 86400000 * 3;
      maxTime = Date.now() + 86400000 * 14;
    }

    // Добавляем отступ 2 дня по краям
    minTime -= 86400000 * 2;
    maxTime += 86400000 * 2;

    const totalDuration = Math.max(86400000 * 7, maxTime - minTime);
    const days = Math.ceil(totalDuration / 86400000);

    const bars = orderedTasks.map(t => {
      const start = t.start_date ? new Date(t.start_date).getTime() : (t.due_date ? new Date(t.due_date).getTime() - 86400000 * 2 : Date.now());
      const end = t.due_date ? new Date(t.due_date).getTime() : start + 86400000 * 2;

      const leftPercent = Math.max(0, Math.min(100, ((start - minTime) / totalDuration) * 100));
      const widthPercent = Math.max(3, Math.min(100 - leftPercent, ((Math.max(86400000, end - start)) / totalDuration) * 100));

      const isOverdue = t.status !== 'completed' && t.due_date && new Date(t.due_date).getTime() < Date.now();

      return {
        ...t,
        leftPercent,
        widthPercent,
        isOverdue
      };
    });

    return {
      startDate: new Date(minTime),
      endDate: new Date(maxTime),
      totalDays: days,
      taskBars: bars
    };
  }, [orderedTasks]);

  // Генерируем метки дней
  const dayMarkers = useMemo(() => {
    const markers = [];
    const step = Math.max(1, Math.floor(totalDays / 10));
    for (let i = 0; i < totalDays; i += step) {
      const d = new Date(startDate.getTime() + i * 86400000);
      markers.push({
        label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        percent: (i / totalDays) * 100
      });
    }
    return markers;
  }, [startDate, totalDays]);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="card empty-state" style={{ padding: 48 }}>
        <p>В проекте пока нет задач со сроками для отображения на диаграмме Ганта.</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Создайте задачи с датами начала и дедлайна, чтобы видеть временную шкалу проекта.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 20, overflowX: 'auto', background: 'var(--bg-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Диаграмма Ганта проекта</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Используйте кнопки ▲ ▼ или перетаскивайте строки (Drag & Drop) для смены порядка задач
          </p>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent)' }} /> В работе
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--success)' }} /> Завершена
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: '#d32f2f', border: '1px solid #fff' }} /> Просрочена
          </span>
        </div>
      </div>

      <div style={{ minWidth: 740 }}>
        {/* TIMELINE HEADER */}
        <div
          style={{
            position: 'relative',
            height: 32,
            borderBottom: '1px solid var(--border-color)',
            marginBottom: 12,
            fontSize: 11,
            color: 'var(--text-muted)',
            marginLeft: '270px'
          }}
        >
          {dayMarkers.map((m, idx) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: `${m.percent}%`,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap'
              }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* TASK ROWS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {taskBars.map((t, idx) => {
            const barBg =
              t.status === 'completed'
                ? 'var(--success)'
                : t.isOverdue
                ? '#d32f2f'
                : t.status === 'in_progress'
                ? 'var(--accent)'
                : 'var(--bg-tertiary)';

            return (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '270px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: draggedIdx === idx ? 'var(--bg-hover)' : 'transparent',
                  border: draggedIdx === idx ? '1px dashed var(--accent)' : '1px solid transparent',
                  transition: 'background 0.15s ease',
                }}
              >
                {/* Task Label & Reorder Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {/* Up / Down Reorder buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0 4px', height: '14px', fontSize: '9px', lineHeight: '14px', border: 'none' }}
                      disabled={idx === 0}
                      onClick={() => moveRow(idx, -1)}
                      title="Переместить вверх"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0 4px', height: '14px', fontSize: '9px', lineHeight: '14px', border: 'none' }}
                      disabled={idx === taskBars.length - 1}
                      onClick={() => moveRow(idx, 1)}
                      title="Переместить вниз"
                    >
                      ▼
                    </button>
                  </div>

                  <span
                    style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 13, userSelect: 'none' }}
                    title="Перетащите для изменения порядка"
                  >
                    ⋮⋮
                  </span>

                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 13,
                      cursor: onTaskClick ? 'pointer' : 'default',
                      color: t.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                      flex: 1
                    }}
                    onClick={() => onTaskClick && onTaskClick(t)}
                    title={`${t.title} (Кликните для редактирования)`}
                  >
                    {t.title}
                  </div>
                </div>

                {/* Bar Track */}
                <div
                  style={{
                    position: 'relative',
                    height: 28,
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div
                    onClick={() => onTaskClick && onTaskClick(t)}
                    style={{
                      position: 'absolute',
                      left: `${t.leftPercent}%`,
                      width: `${t.widthPercent}%`,
                      top: 3,
                      bottom: 3,
                      borderRadius: 4,
                      background: barBg,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 6px',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      transition: 'transform 0.1s ease',
                    }}
                    title={`${t.title} (${t.status === 'completed' ? 'Завершена' : t.isOverdue ? 'Просрочена' : 'В процессе'}) — Кликните для редактирования`}
                  >
                    {t.due_date ? new Date(t.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
