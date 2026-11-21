import uuid
from datetime import date, datetime, timezone
import pytest
from app.routers.roles import list_roles, create_role
from app.routers.projects import list_projects, create_project, complete_task_with_metrics, update_project_member
from app.schemas.role import RoleCreate
from app.schemas.project import ProjectCreate, TaskComplete, ProjectMemberUpdate
from app.models.member import OrgRole
from test.fakes import FakeAsyncSession, FakeResult
from test.factories import make_member, make_user, make_organization
from app.models.project import Project, ProjectTask, ProjectMember


@pytest.mark.asyncio
async def test_list_roles_empty():
    org_id = uuid.uuid4()
    user = make_user()
    member = make_member(user.id, org_id)
    db = FakeAsyncSession(results=[
        FakeResult(scalar=member),
        FakeResult(scalars=[]),
    ])
    res = await list_roles(org_id=org_id, current_user=user, db=db)
    assert res == []


@pytest.mark.asyncio
async def test_create_role_by_moderator():
    org_id = uuid.uuid4()
    user = make_user()
    member = make_member(user.id, org_id, role=OrgRole.MODERATOR)
    db = FakeAsyncSession(results=[
        FakeResult(scalar=member),
    ])
    data = RoleCreate(
        name="Тимлид",
        can_manage_roles=True,
        can_create_projects=True,
        can_edit_tasks=True,
        can_approve_tasks=True,
        can_view_org_analytics=False,
    )
    role = await create_role(org_id=org_id, data=data, current_user=user, db=db)
    assert role.name == "Тимлид"
    assert role.can_manage_roles is True
    assert role.can_view_org_analytics is False


@pytest.mark.asyncio
async def test_create_project_success():
    org_id = uuid.uuid4()
    user = make_user()
    member = make_member(user.id, org_id, role=OrgRole.MODERATOR)
    db = FakeAsyncSession(results=[
        FakeResult(scalar=member),
    ])
    data = ProjectCreate(
        name="Маркетинговая кампания Q1",
        description="Привлечение B2B клиентов",
        category="marketing",
        budget=150000.0,
    )
    proj = await create_project(org_id=org_id, data=data, current_user=user, db=db)
    assert proj.name == "Маркетинговая кампания Q1"
    assert proj.category == "marketing"
    assert proj.budget == 150000.0


@pytest.mark.asyncio
async def test_complete_task_with_metrics():
    org_id = uuid.uuid4()
    user = make_user()
    member = make_member(user.id, org_id)
    proj = Project(id=uuid.uuid4(), organization_id=org_id, name="Test")
    task = ProjectTask(
        id=uuid.uuid4(),
        project_id=proj.id,
        title="Запуск таргета",
        created_by_id=user.id,
    )
    db = FakeAsyncSession(results=[
        FakeResult(scalar=task),
        FakeResult(scalar=proj),
        FakeResult(scalar=member),
    ])
    data = TaskComplete(
        revenue_impact=250000.0,
        cost_impact=45000.0,
        clients_acquired=12,
        completion_comment="Успешный запуск, 12 новых контрактов",
    )
    completed = await complete_task_with_metrics(task_id=task.id, data=data, current_user=user, db=db)
    assert completed.status == "completed"
    assert completed.revenue_impact == 250000.0
    assert completed.cost_impact == 45000.0
    assert completed.clients_acquired == 12
    assert completed.completion_comment == "Успешный запуск, 12 новых контрактов"


@pytest.mark.asyncio
async def test_update_project_member_role():
    org_id = uuid.uuid4()
    user = make_user()
    target_user = make_user(full_name="Иван Петров", email="ivan@soprano.io")
    member = make_member(user.id, org_id, role=OrgRole.MODERATOR)
    proj = Project(id=uuid.uuid4(), organization_id=org_id, name="Test")
    pm = ProjectMember(
        id=uuid.uuid4(),
        project_id=proj.id,
        user_id=target_user.id,
        role_in_project="Сотрудник",
        joined_at=datetime.now(timezone.utc),
    )
    db = FakeAsyncSession(results=[
        FakeResult(scalar=proj),
        FakeResult(scalar=member),
        FakeResult(scalar=pm),
        FakeResult(scalar=target_user),
    ])
    data = ProjectMemberUpdate(role_in_project="Организатор")
    res = await update_project_member(
        project_id=proj.id,
        user_id=target_user.id,
        data=data,
        current_user=user,
        db=db,
    )
    assert res.role_in_project == "Организатор"
    assert res.user_id == target_user.id


def test_kanban_status_column_mapping():
    from app.utils.kanban_sync import map_task_status_to_column, map_column_to_task_status
    from app.models.board import BoardColumn

    b_id = uuid.uuid4()
    col_backlog = BoardColumn(id=uuid.uuid4(), board_id=b_id, title="Бэклог", position=0, is_confirmed=False)
    col_work = BoardColumn(id=uuid.uuid4(), board_id=b_id, title="В работе", position=1, is_confirmed=False)
    col_done = BoardColumn(id=uuid.uuid4(), board_id=b_id, title="Готово", position=2, is_confirmed=False)
    col_approved = BoardColumn(id=uuid.uuid4(), board_id=b_id, title="Подтверждено", position=3, is_confirmed=True)

    cols = [col_backlog, col_work, col_done, col_approved]

    # Task -> Column
    assert map_task_status_to_column("todo", cols).title == "Бэклог"
    assert map_task_status_to_column("in_progress", cols).title == "В работе"
    assert map_task_status_to_column("review", cols).title == "Готово"
    assert map_task_status_to_column("completed", cols).title == "Подтверждено"

    # Column -> Task status
    assert map_column_to_task_status(col_backlog) == "todo"
    assert map_column_to_task_status(col_work) == "in_progress"
    assert map_column_to_task_status(col_done) == "review"
    assert map_column_to_task_status(col_approved) == "completed"

