import sys
from pathlib import Path

# Add backend directory to sys.path so 'app' can always be imported
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, organizations, members, departments, invitations, chat, finance, absences, admin, search, boards, notifications, logs, ai, roles, projects, analytics

app = FastAPI(title="Soprano", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(members.router)
app.include_router(departments.router)
app.include_router(invitations.router)
app.include_router(invitations.user_invites_router)
app.include_router(chat.router)
app.include_router(finance.router)
app.include_router(absences.router)
app.include_router(admin.router)
app.include_router(search.router)
app.include_router(boards.router)
app.include_router(notifications.router)
app.include_router(logs.router)
app.include_router(logs.admin_org_logs_router)
app.include_router(ai.router)
app.include_router(roles.router)
app.include_router(projects.router)
app.include_router(analytics.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}