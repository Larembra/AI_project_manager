# Диаграмма сущностей и связей (Entity-Relationship Diagram, ER-D) — Платформа «Сопрано»

> Документ содержит полную схему реляционной базы данных платформы «Сопрано» (PostgreSQL / SQLAlchemy 2.0 Async), описание сущностей, первичных (PK) и внешних (FK) ключей, типов данных и правил целостности.

---

## 1. ER-диаграмма базы данных (Mermaid ERD)

```mermaid
erDiagram
    users ||--o{ organizations : "owns"
    users ||--o{ members : "member_of"
    users ||--o{ project_members : "assigned_to"
    users ||--o{ project_tasks : "assignee / creator / approver"
    users ||--o{ finance_records : "created_by"
    users ||--o{ absences : "absent_user"
    users ||--o{ chat_messages : "author"
    users ||--o{ notifications : "receives"

    organizations ||--o{ members : "has_members"
    organizations ||--o{ org_roles : "defines_roles"
    organizations ||--o{ departments : "contains_departments"
    organizations ||--o{ invitations : "sends_invitations"
    organizations ||--o{ projects : "runs_projects"
    organizations ||--o{ boards : "has_boards"
    organizations ||--o{ finance_records : "tracks_finances"
    organizations ||--o{ absences : "tracks_absences"
    organizations ||--o{ chat_channels : "hosts_channels"
    organizations ||--o{ audit_logs : "logs_actions"

    departments ||--o{ members : "groups_members"

    org_roles ||--o{ members : "assigns_permissions"

    projects ||--o{ project_members : "team"
    projects ||--o{ project_tasks : "tasks"
    projects ||--o{ project_documents : "knowledge_base"

    boards ||--o{ board_columns : "columns"
    board_columns ||--o{ cards : "contains_cards"

    chat_channels ||--o{ chat_messages : "messages"

    users {
        uuid id PK
        string email UK
        string hashed_password
        string full_name
        boolean is_active
        boolean is_superuser
        datetime created_at
        datetime updated_at
    }

    organizations {
        uuid id PK
        string name
        text description
        string category
        uuid owner_id FK
        jsonb data
        datetime created_at
        datetime updated_at
    }

    members {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string role
        string position
        uuid department_id FK
        uuid custom_role_id FK
        datetime joined_at
    }

    org_roles {
        uuid id PK
        uuid organization_id FK
        string name
        text description
        boolean can_manage_roles
        boolean can_create_projects
        boolean can_edit_tasks
        boolean can_approve_tasks
        boolean can_view_org_analytics
        boolean can_manage_members
        datetime created_at
    }

    departments {
        uuid id PK
        uuid organization_id FK
        string name
        text description
        datetime created_at
    }

    invitations {
        uuid id PK
        uuid organization_id FK
        string email
        string role
        string token UK
        string status
        datetime expires_at
        datetime created_at
    }

    projects {
        uuid id PK
        uuid organization_id FK
        string name
        text description
        string category
        string status
        numeric budget
        date start_date
        date end_date
        datetime created_at
        datetime updated_at
    }

    project_members {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string role_in_project
        datetime joined_at
    }

    project_tasks {
        uuid id PK
        uuid project_id FK
        string title
        text description
        string status
        string priority
        uuid assignee_id FK
        uuid created_by_id FK
        date start_date
        date due_date
        datetime completed_at
        numeric revenue_impact
        numeric cost_impact
        integer clients_acquired
        text completion_comment
        string approval_status
        uuid approved_by_id FK
        text approval_comment
        datetime created_at
        datetime updated_at
    }

    project_documents {
        uuid id PK
        uuid project_id FK
        string title
        text content
        string category
        datetime created_at
        datetime updated_at
    }

    boards {
        uuid id PK
        uuid organization_id FK
        string title
        text description
        datetime created_at
    }

    board_columns {
        uuid id PK
        uuid board_id FK
        string title
        integer position
    }

    cards {
        uuid id PK
        uuid board_id FK
        uuid column_id FK
        string title
        text description
        integer position
        date due_date
        string priority
    }

    finance_records {
        uuid id PK
        uuid organization_id FK
        uuid creator_id FK
        string title
        text description
        numeric amount
        string category
        string status
        uuid approved_by_id FK
        datetime created_at
    }

    absences {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string absence_type
        date start_date
        date end_date
        text reason
        string status
        uuid approved_by_id FK
        datetime created_at
    }

    chat_channels {
        uuid id PK
        uuid organization_id FK
        string name
        text description
        datetime created_at
    }

    chat_messages {
        uuid id PK
        uuid channel_id FK
        uuid author_id FK
        text content
        boolean is_deleted
        datetime created_at
    }

    audit_logs {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string action
        string entity_type
        string entity_id
        text details
        datetime created_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        string title
        text message
        boolean is_read
        datetime created_at
    }
```

---

## 2. Описание ключевых таблиц и атрибутов

### 2.1. `projects` (Проекты организации)
Проекты представляют собой независимые направления деятельности организации (IT-разработка, бизнес-аналитика, маркетинг, HR, логистика и т.д.):
- `id` (UUID, PK) — уникальный идентификатор проекта.
- `organization_id` (UUID, FK -> `organizations.id`, `ON DELETE CASCADE`) — ссылка на родительскую организацию.
- `name` (VARCHAR(200), NOT NULL) — наименование проекта.
- `description` (TEXT, NULL) — развернутые цели, стейкхолдеры и критерии успеха.
- `category` (VARCHAR(50), NOT NULL, default='development') — категоризация (`development`, `business_analysis`, `marketing`, `hr`, `logistics`, `finance`, `other`).
- `status` (VARCHAR(30), NOT NULL, default='active') — статус проекта (`planning`, `active`, `paused`, `completed`, `archived`).
- `budget` (NUMERIC(14, 2), NOT NULL, default=0.0) — выделенный бюджет проекта.
- `start_date` / `end_date` (DATE, NULL) — плановые даты старта и завершения.

### 2.2. `project_tasks` (Задачи проекта)
Задачи с временными рамками для календаря и диаграммы Ганта, а также атрибутами бизнес-влияния:
- `id` (UUID, PK) — уникальный идентификатор задачи.
- `project_id` (UUID, FK -> `projects.id`, `ON DELETE CASCADE`) — проект задачи.
- `title` (VARCHAR(250), NOT NULL) — название задачи.
- `status` (VARCHAR(30), default='todo') — статус выполнения (`todo`, `in_progress`, `review`, `completed`).
- `priority` (VARCHAR(20), default='medium') — приоритет (`low`, `medium`, `high`, `urgent`).
- `assignee_id` (UUID, FK -> `users.id`, `ON DELETE SET NULL`) — назначенный исполнитель.
- `start_date` / `due_date` (DATE, NULL) — даты для диаграммы Ганта и интерактивного календаря.
- `revenue_impact` (NUMERIC(14, 2), default=0.0) — фактический доход, принесенный задачей.
- `cost_impact` (NUMERIC(14, 2), default=0.0) — фактические затраты на реализацию задачи.
- `clients_acquired` (INTEGER, default=0) — количество привлеченных клиентов.
- `approval_status` (VARCHAR(30), default='none') — статус проверки задачи (`none`, `approved`, `rejected`).
- `approved_by_id` (UUID, FK -> `users.id`, `ON DELETE SET NULL`) — проверяющий/руководитель, верифицировавший задачу.
- `approval_comment` (TEXT, NULL) — комментарий или замечание при разотметке/приемке.

### 2.3. `project_documents` (База знаний проекта и RAG)
Хранилище проектных регламентов, технических заданий и инструкций, индексируемое для AI-ассистента:
- `id` (UUID, PK) — идентификатор документа.
- `project_id` (UUID, FK -> `projects.id`, `ON DELETE CASCADE`) — ссылка на проект.
- `title` (VARCHAR(200), NOT NULL) — заголовок регламента / документа.
- `content` (TEXT, NOT NULL) — текст документа, используемый для RAG-поиска и семантического анализа.
- `category` (VARCHAR(50), default='general') — категория (`specs`, `guidelines`, `reports`, `general`).

### 2.4. `org_roles` (Настраиваемые роли с матрицей прав)
Матрица гранулярных привилегий с чекбоксами доступа:
- `id` (UUID, PK) — идентификатор роли.
- `organization_id` (UUID, FK -> `organizations.id`, `ON DELETE CASCADE`) — организация.
- `name` (VARCHAR(100), NOT NULL) — название роли (например, «Аудитор», «HR-директор», «Тимлид»).
- `can_manage_roles` (BOOLEAN, default=False) — право создавать и менять роли.
- `can_create_projects` (BOOLEAN, default=False) — право создавать и удалять проекты.
- `can_edit_tasks` (BOOLEAN, default=True) — право создавать, редактировать и удалять задачи.
- `can_approve_tasks` (BOOLEAN, default=False) — право принимать и разотмечать задачи.
- `can_view_org_analytics` (BOOLEAN, default=False) — доступ к финансовой бизнес-аналитике.
- `can_manage_members` (BOOLEAN, default=False) — право управлять составом участников и отделами.

### 2.5. `members` (Участники организации)
Связующая сущность между пользователем и организацией:
- `id` (UUID, PK).
- `organization_id` (UUID, FK -> `organizations.id`, `ON DELETE CASCADE`).
- `user_id` (UUID, FK -> `users.id`, `ON DELETE CASCADE`).
- `role` (VARCHAR(20), default='employee') — базовый статус (`moderator`, `employee`).
- `position` (VARCHAR(100), NULL) — занимаемая должность в штате.
- `department_id` (UUID, FK -> `departments.id`, `ON DELETE SET NULL`) — отдел сотрудника.
- `custom_role_id` (UUID, FK -> `org_roles.id`, `ON DELETE SET NULL`) — ссылка на настраиваемую роль с матрицей чекбоксов прав.

---

## 3. Правила целостности и каскадности (Integrity Rules)

1. **Каскадное удаление (ON DELETE CASCADE)**:
   - При удалении организации каскадно удаляются все связанные проекты (`projects`), участники (`members`), роли (`org_roles`), отделы (`departments`), финансовые записи (`finance_records`), каналы чата (`chat_channels`) и задачи.
   - При удалении проекта каскадно удаляются все его задачи (`project_tasks`), назначенные участники (`project_members`) и документы базы знаний (`project_documents`).
2. **Безопасное обнуление (ON DELETE SET NULL)**:
   - При удалении пользователя как исполнителя задачи (`assignee_id`) или проверяющего (`approved_by_id`) поле переводится в `NULL`, сохраняя саму задачу и её историю.
   - При удалении роли (`custom_role_id`) или отдела (`department_id`) сотрудники остаются в организации, а соответствующие ссылки сбрасываются в `NULL`.
3. **Индексация и производительность**:
   - Поля `email` в `users` и `token` в `invitations` имеют уникальные индексы (`UNIQUE INDEX`).
   - Внешние ключи `organization_id`, `project_id`, `user_id` проиндексированы для быстрого соединения таблиц (JOIN) и построения аналитических выборок.
