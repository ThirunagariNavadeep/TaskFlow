from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Task, User
from app.schemas import DashboardStats
from app.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    project_count = db.scalar(
        select(func.count(Project.id)).where(Project.user_id == user.id)
    ) or 0
    task_count = db.scalar(select(func.count(Task.id)).where(Task.user_id == user.id)) or 0
    status_counts = dict(
        db.execute(
            select(Task.status, func.count(Task.id))
            .where(Task.user_id == user.id)
            .group_by(Task.status)
        ).all()
    )
    completed = status_counts.get("Completed", 0)
    recent_tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == user.id)
            .order_by(Task.created_at.desc(), Task.id.desc())
            .limit(6)
        )
    )
    return DashboardStats(
        total_projects=project_count,
        total_tasks=task_count,
        pending_tasks=status_counts.get("Pending", 0),
        in_progress_tasks=status_counts.get("In Progress", 0),
        completed_tasks=completed,
        completion_percentage=round(completed * 100 / task_count, 1) if task_count else 0,
        recent_tasks=recent_tasks,
    )