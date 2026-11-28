import uuid
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.board import Board, BoardColumn, Card, CardPriority
from app.models.project import ProjectTask


DEFAULT_COLUMNS = [
    ("Бэклог", False),
    ("В работе", False),
    ("Готово", False),
    ("Подтверждено", True),
]


def map_task_status_to_column(status: str, columns: list, approval_status: str = "none") -> BoardColumn | None:
    """Определяет подходящую колонку доски Kanban для статуса проектной задачи."""
    cols = sorted(columns, key=lambda c: c.position)
    if not cols:
        return None
    st = (status or "todo").lower()
    if st == "todo":
        for c in cols:
            if any(k in c.title.lower() for k in ["бэклог", "todo", "очередь"]):
                return c
        return cols[0]
    elif st == "in_progress":
        for c in cols:
            if any(k in c.title.lower() for k in ["работ", "progress"]):
                return c
        return cols[1] if len(cols) > 1 else cols[0]
    elif st == "review":
        for c in cols:
            if any(k in c.title.lower() for k in ["проверк", "review"]) or ("готов" in c.title.lower() and not c.is_confirmed):
                return c
        return cols[2] if len(cols) > 2 else cols[-1]
    elif st == "completed":
        if approval_status == "approved":
            for c in reversed(cols):
                if c.is_confirmed or "подтвержд" in c.title.lower():
                    return c
        for c in cols:
            if not c.is_confirmed and any(k in c.title.lower() for k in ["готов", "review", "проверк"]):
                return c
        return cols[-1]
    return cols[0]


def map_column_to_task_status(column: BoardColumn) -> str:
    """Определяет статус проектной задачи по колонке доски Kanban."""
    if column.is_confirmed:
        return "completed"
    t = column.title.lower()
    if any(k in t for k in ["подтвержд", "завершен"]):
        return "completed"
    if any(k in t for k in ["готов", "проверк", "review"]):
        return "review"
    if any(k in t for k in ["работ", "progress"]):
        return "in_progress"
    return "todo"


async def ensure_project_board(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    project_name: str,
    creator_id: uuid.UUID,
) -> Board:
    """
    Гарантирует существование связанной Kanban-доски для проекта.
    Создает доску и 4 стандартные колонки при их отсутствии,
    а также автоматически переносит существующие проектные задачи в виде карточек.
    """
    res = await db.execute(select(Board).where(Board.project_id == project_id))
    board = res.scalar_one_or_none()

    if not board:
        board = Board(
            organization_id=org_id,
            project_id=project_id,
            name=f"Проект: {project_name}",
            description=f"Автоматическая Kanban-доска для задач проекта '{project_name}'",
            created_by=creator_id,
        )
        db.add(board)
        await db.flush()

        for i, (col_title, is_confirmed) in enumerate(DEFAULT_COLUMNS):
            db.add(BoardColumn(board_id=board.id, title=col_title, position=i, is_confirmed=is_confirmed))
        await db.flush()

    # Загружаем колонки
    cols_res = await db.execute(
        select(BoardColumn).where(BoardColumn.board_id == board.id).order_by(BoardColumn.position)
    )
    cols = cols_res.scalars().all()

    # Синхронизируем задачи проекта, у которых еще нет карточки
    tasks_res = await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id))
    tasks = tasks_res.scalars().all()
    task_ids = [task.id for task in tasks]
    if task_ids and cols:
        existing_result = await db.execute(select(Card.project_task_id).where(Card.project_task_id.in_(task_ids)))
        existing_task_ids = set(existing_result.scalars().all())
        cards = []
        for task in tasks:
            if task.id in existing_task_ids:
                continue
            target_col = map_task_status_to_column(task.status, cols, task.approval_status)
            if not target_col:
                continue
            priority = CardPriority(task.priority) if task.priority in {item.value for item in CardPriority} else CardPriority.MEDIUM
            cards.append(Card(
                board_id=board.id,
                column_id=target_col.id,
                project_task_id=task.id,
                title=task.title,
                description=task.description,
                priority=priority,
                due_date=task.due_date,
                creator_id=task.created_by_id,
                assignee_id=task.assignee_id,
                position=0,
            ))
        db.add_all(cards)

    await db.flush()
    return board
