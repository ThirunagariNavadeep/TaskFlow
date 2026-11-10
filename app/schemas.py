from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserRead
    csrf_token: str


class ProjectFields(BaseModel):
    project_name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5000)
    deadline: date | None = None


class ProjectCreate(ProjectFields):
    pass


class ProjectRead(ProjectFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime


class TaskFields(BaseModel):
    project_id: int
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)
    priority: Literal["Low", "Medium", "High"] = "Medium"
    status: Literal["Pending", "In Progress", "Completed"] = "Pending"
    due_date: date | None = None


class TaskCreate(TaskFields):
    pass


class TaskRead(TaskFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class DashboardStats(BaseModel):
    total_projects: int
    total_tasks: int
    pending_tasks: int
    in_progress_tasks: int
    completed_tasks: int
    completion_percentage: float
    recent_tasks: list[TaskRead]