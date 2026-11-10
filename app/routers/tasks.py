from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Task, User
from app.schemas import TaskCreate, TaskRead
from app.security import get_current_user, require_csrf

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def get_owned_task(db: Session, user_id: int, task_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user_id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def get_owned_project(db: Session, user_id: int, project_id: int) -> Project:
    project = db.scalar(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("", response_model=list[TaskRead])
def list_tasks(
    search: str = Query(default="", max_length=160),
    task_status: Literal["Pending", "In Progress", "Completed"] | None = Query(
        default=None, alias="status"
    ),
    priority: Literal["Low", "Medium", "High"] | None = None,
    project_id: int | None = Query(default=None, ge=1),
    sort_by: Literal["created_at", "due_date"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    statement = select(Task).where(Task.user_id == user.id)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(Task.title.ilike(pattern), Task.description.ilike(pattern))
        )
    if task_status:
        statement = statement.where(Task.status == task_status)
    if priority:
        statement = statement.where(Task.priority == priority)
    if project_id:
        statement = statement.where(Task.project_id == project_id)

    sort_column = Task.due_date if sort_by == "due_date" else Task.created_at
    sort_expression = sort_column.asc() if order == "asc" else sort_column.desc()
    return list(db.scalars(statement.order_by(sort_expression, Task.id.desc())))


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_csrf(request)
    get_owned_project(db, user.id, payload.project_id)
    task = Task(user_id=user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
def read_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return get_owned_task(db, user.id, task_id)


@router.put("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int,
    payload: TaskCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_csrf(request)
    task = get_owned_task(db, user.id, task_id)
    get_owned_project(db, user.id, payload.project_id)
    for field, value in payload.model_dump().items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_csrf(request)
    task = get_owned_task(db, user.id, task_id)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)