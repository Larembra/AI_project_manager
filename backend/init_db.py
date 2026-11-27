import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import asyncio
from sqlalchemy import text
from app.database import engine, Base, async_session
from app.models import *
from app.models.user import User, PlatformRole
from app.utils.security import hash_password


async def apply_migrations(conn):
    await conn.execute(text("ALTER TABLE ai_conversation_messages ADD COLUMN IF NOT EXISTS turn_id UUID"))
    await conn.execute(text("ALTER TABLE ai_conversation_messages ADD COLUMN IF NOT EXISTS model VARCHAR(200)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ai_conversation_messages_turn_id ON ai_conversation_messages (turn_id)"))
    await conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS via_agent BOOLEAN NOT NULL DEFAULT FALSE"))
    await conn.execute(
        text(
            """
            DO $$
            BEGIN
                CREATE TYPE organizationcategory AS ENUM (
                    'it','marketing','hr','finance','sales','education','healthcare','nonprofit','other'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE organizations
                ADD COLUMN IF NOT EXISTS category organizationcategory NOT NULL DEFAULT 'other',
                ADD COLUMN IF NOT EXISTS data JSONB;
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE board_columns
                ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
            """
        )
    )
    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY,
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                action VARCHAR NOT NULL,
                entity_type VARCHAR NOT NULL,
                entity_id VARCHAR,
                details VARCHAR,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL
            );
            """
        )
    )
    statements = [
        """
        CREATE TABLE IF NOT EXISTS ai_agent_steps (
            id UUID PRIMARY KEY,
            conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
            turn_id UUID NOT NULL,
            step_index INTEGER NOT NULL,
            model VARCHAR(200) NOT NULL,
            raw_parts JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_ai_agent_steps_conversation_id ON ai_agent_steps (conversation_id)",
        "CREATE INDEX IF NOT EXISTS ix_ai_agent_steps_turn_id ON ai_agent_steps (turn_id)",
        """
        CREATE TABLE IF NOT EXISTS ai_tool_calls (
            id UUID PRIMARY KEY,
            step_id UUID NOT NULL REFERENCES ai_agent_steps(id) ON DELETE CASCADE,
            conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
            call_index INTEGER NOT NULL,
            name VARCHAR(100) NOT NULL,
            args JSONB NOT NULL,
            result JSONB,
            status VARCHAR(30) NOT NULL,
            risk VARCHAR(20) NOT NULL,
            summary VARCHAR(500) NOT NULL,
            error_code VARCHAR(100),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE,
            resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            resolved_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_ai_tool_calls_step_id ON ai_tool_calls (step_id)",
        "CREATE INDEX IF NOT EXISTS ix_ai_tool_calls_conversation_id ON ai_tool_calls (conversation_id)",
        "CREATE INDEX IF NOT EXISTS ix_ai_tool_calls_user_id ON ai_tool_calls (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_ai_tool_calls_status ON ai_tool_calls (status)",
        """
        CREATE TABLE IF NOT EXISTS project_integrations (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            provider VARCHAR(30) NOT NULL,
            repo_owner VARCHAR(100) NOT NULL,
            repo_name VARCHAR(100) NOT NULL,
            token_encrypted VARCHAR(2000),
            token_last4 VARCHAR(4),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
            CONSTRAINT uq_project_integrations_project_provider UNIQUE (project_id, provider)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_project_integrations_project_id ON project_integrations (project_id)",
        """
        CREATE TABLE IF NOT EXISTS org_roles (
            id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            can_manage_roles BOOLEAN NOT NULL DEFAULT FALSE,
            can_create_projects BOOLEAN NOT NULL DEFAULT FALSE,
            can_edit_tasks BOOLEAN NOT NULL DEFAULT TRUE,
            can_approve_tasks BOOLEAN NOT NULL DEFAULT FALSE,
            can_view_org_analytics BOOLEAN NOT NULL DEFAULT FALSE,
            can_manage_members BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
        """
        ALTER TABLE members
            ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES org_roles(id) ON DELETE SET NULL
        """,
        """
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            description TEXT,
            category VARCHAR(50) NOT NULL DEFAULT 'development',
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            budget NUMERIC(14, 2) NOT NULL DEFAULT 0.0,
            start_date DATE,
            end_date DATE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS project_members (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_in_project VARCHAR(100) NOT NULL DEFAULT 'Исполнитель',
            joined_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS project_tasks (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title VARCHAR(250) NOT NULL,
            description TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'todo',
            priority VARCHAR(20) NOT NULL DEFAULT 'medium',
            assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            start_date DATE,
            due_date DATE,
            completed_at TIMESTAMP WITH TIME ZONE,
            revenue_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.0,
            cost_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.0,
            clients_acquired INTEGER NOT NULL DEFAULT 0,
            completion_comment TEXT,
            approval_status VARCHAR(30) NOT NULL DEFAULT 'none',
            approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
            approval_comment TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS project_documents (
            id UUID PRIMARY KEY,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            content TEXT NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'general',
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
        """
        ALTER TABLE boards
            ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE
        """,
        """
        ALTER TABLE cards
            ADD COLUMN IF NOT EXISTS project_task_id UUID REFERENCES project_tasks(id) ON DELETE CASCADE
        """
    ]
    for stmt in statements:
        await conn.execute(text(stmt))


async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await apply_migrations(conn)

    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(
                email="admin@ocs.local",
                username="admin",
                hashed_password=hash_password("admin123"),
                full_name="Администратор",
                platform_role=PlatformRole.ADMIN,
            )
            session.add(admin)
            await session.commit()
            print("Admin user created: admin / admin123")
        else:
            print("Admin user already exists")


if __name__ == "__main__":
    asyncio.run(init())
