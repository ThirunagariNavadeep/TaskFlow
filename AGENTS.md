# TaskFlow Agent Guide

## Project Overview

TaskFlow is a same-origin FastAPI application with SQLAlchemy/SQLite persistence and a vanilla HTML/CSS/JavaScript frontend. Keep the application framework-free on the client and follow the existing package layout under `app/` and `tests/`.

## Development Instructions

- Create and activate a local virtual environment, then install `requirements.txt` before running the app or tests.
- Run the web app with `uvicorn app.main:app --reload` from the repository root.
- Run the full behavior suite with `python -m pytest -q`.
- Use `create_app(engine=...)` and an isolated SQLite engine for tests. Do not point tests at the developer database.
- Add or update tests alongside every API or data-model behavior change.
- Keep request/response contracts in `app/schemas.py`, ORM tables in `app/models.py`, and route behavior in `app/routers/`.
- Keep frontend changes in the static HTML/CSS/JS files; no frontend build step is expected.

## Coding Conventions

- Use type hints and descriptive names. Keep route handlers focused and use SQLAlchemy expressions rather than constructing SQL strings.
- Validate all input with Pydantic schemas and return meaningful HTTP status codes.
- Keep API responses stable and avoid exposing password hashes, session secrets, or internal exception details.
- Use semantic HTML, labels for form controls, keyboard-accessible dialogs, responsive CSS, and `textContent` or escaped values for user-controlled text.
- Keep changes scoped; do not reformat unrelated files or add dependencies without a clear need.

## Security Requirements

- Hash passwords with the configured Argon2 `pwdlib` hasher. Never log or store plain-text passwords.
- Treat every project/task identifier as untrusted. Scope reads and mutations by the authenticated user; keep the task/project composite ownership constraint intact.
- Require the session CSRF token in `X-CSRF-Token` for authenticated state-changing requests.
- Keep session cookies HttpOnly and SameSite=Lax. Enable `TASKFLOW_HTTPS_ONLY=true` in HTTPS deployments and use a strong, private `TASKFLOW_SESSION_SECRET`.
- Preserve the security response headers. Do not add permissive cross-origin access without a reviewed requirement.
- Use SQLAlchemy-bound values; do not build query text from user input. Escape user-controlled strings before inserting them into HTML.

## Testing Expectations

- Test actual database effects and response contents, not only that a route returns a response.
- Cover both successful and invalid inputs, unauthenticated access, and cross-user access for private data.
- Assert dashboard statistics from seeded records and verify task search/filter/sort results.
- Keep the test database separate from `taskflow.db`; never delete or reset a user's local database during tests.