### Organization Control System

```bash
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm run dev
```

### Agent configuration

Copy `backend/.env.example` to `backend/.env`. Set `GEMINI_API_KEY`, a stable private `SECRET_KEY`, and a Fernet key in `INTEGRATIONS_ENCRYPTION_KEY` to enable GitHub PAT storage. Generate the Fernet key with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Keep the encryption key stable; changing it makes newly stored PATs unreadable. Initialize or upgrade the database with:

```bash
cd backend
python init_db.py
```

The GitHub integration uses the official GitHub MCP Streamable HTTP endpoint at `https://api.githubcopilot.com/mcp/` by default. Set `GITHUB_MCP_URL` in `backend/.env` to use a self-hosted compatible endpoint. Repository PATs are stored encrypted in the database; use a token with read-only access to the selected repository. GitHub credentials are sent only in authorization headers for read-only requests and never included in model input or tool results. File reads use the MCP `get_file_contents` tool in read-only mode.

### Tests

Run backend tests from the repository root:

```bash
python -m pytest test
```

Build the frontend from `frontend/`:

```bash
npm run build
```
