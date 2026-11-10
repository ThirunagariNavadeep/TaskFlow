def project_payload(name="Launch plan"):
    return {
        "project_name": name,
        "description": "Prepare a focused launch.",
        "deadline": "2026-12-01",
    }


def create_project(client, csrf_token, name="Launch plan"):
    response = client.post(
        "/api/projects",
        json=project_payload(name),
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


def create_task(client, csrf_token, project_id, **overrides):
    payload = {
        "project_id": project_id,
        "title": "Draft the outline",
        "description": "Start with the main milestones.",
        "priority": "Medium",
        "status": "Pending",
        "due_date": "2026-11-20",
    }
    payload.update(overrides)
    response = client.post(
        "/api/tasks",
        json=payload,
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


def test_project_create_update_and_delete(client, csrf_token):
    project = create_project(client, csrf_token)
    assert client.get(f"/api/projects/{project['id']}").json()["project_name"] == "Launch plan"

    updated = client.put(
        f"/api/projects/{project['id']}",
        json={**project_payload("Spring launch"), "description": "Updated scope."},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert updated.status_code == 200
    assert updated.json()["project_name"] == "Spring launch"
    assert updated.json()["description"] == "Updated scope."

    deleted = client.delete(
        f"/api/projects/{project['id']}", headers={"X-CSRF-Token": csrf_token}
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/projects/{project['id']}").status_code == 404


def test_task_create_status_update_and_delete(client, csrf_token):
    project = create_project(client, csrf_token)
    task = create_task(client, csrf_token, project["id"])
    assert task["status"] == "Pending"
    assert task["priority"] == "Medium"

    updated = client.put(
        f"/api/tasks/{task['id']}",
        json={**task, "status": "In Progress", "priority": "High"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "In Progress"
    assert updated.json()["priority"] == "High"

    deleted = client.delete(
        f"/api/tasks/{task['id']}", headers={"X-CSRF-Token": csrf_token}
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert client.get("/api/tasks").json() == []


def test_project_deletion_cascades_its_tasks(client, csrf_token):
    project = create_project(client, csrf_token)
    task = create_task(client, csrf_token, project["id"])

    response = client.delete(
        f"/api/projects/{project['id']}", headers={"X-CSRF-Token": csrf_token}
    )

    assert response.status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_task_search_filters_and_sorting(client, csrf_token):
    project = create_project(client, csrf_token)
    create_task(
        client, csrf_token, project["id"], title="Review launch copy",
        priority="High", status="In Progress", due_date="2026-11-18",
    )
    create_task(
        client, csrf_token, project["id"], title="Polish dashboard",
        priority="Low", status="Completed", due_date="2026-11-25",
    )

    response = client.get("/api/tasks?search=launch&status=In%20Progress&priority=High")
    assert response.status_code == 200
    assert [task["title"] for task in response.json()] == ["Review launch copy"]

    sorted_tasks = client.get("/api/tasks?sort_by=due_date&order=asc").json()
    assert [task["due_date"] for task in sorted_tasks] == ["2026-11-18", "2026-11-25"]
    assert client.get("/api/tasks?status=Blocked").status_code == 422


def test_nonnumeric_project_and_task_ids_are_rejected_without_weakening_numeric_ids(
    client, csrf_token
):
    project = create_project(client, csrf_token)
    task = create_task(client, csrf_token, project["id"])

    numeric_query = client.get(f"/api/tasks?project_id={project['id']}")
    invalid_body = client.post(
        "/api/tasks",
        json={"project_id": "not-an-integer", "title": "Invalid ID"},
        headers={"X-CSRF-Token": csrf_token},
    )
    invalid_query = client.get("/api/tasks?project_id=not-an-integer")
    invalid_path = client.get("/api/tasks/not-an-integer")
    invalid_project_path = client.get("/api/projects/not-an-integer")

    assert numeric_query.status_code == 200
    assert [item["id"] for item in numeric_query.json()] == [task["id"]]
    assert invalid_body.status_code == 422
    assert invalid_body.json()["detail"][0]["loc"] == ["body", "project_id"]
    assert invalid_body.json()["detail"][0]["msg"] == (
        "Input should be a valid integer, unable to parse string as an integer"
    )
    assert invalid_query.status_code == 422
    assert invalid_path.status_code == 422
    assert invalid_project_path.status_code == 422
    assert [item["id"] for item in client.get("/api/tasks").json()] == [task["id"]]


def test_dashboard_statistics_reflect_database_records(client, csrf_token):
    first = create_project(client, csrf_token, "Planning")
    second = create_project(client, csrf_token, "Delivery")
    create_task(client, csrf_token, first["id"], status="Pending")
    create_task(client, csrf_token, first["id"], title="Review", status="In Progress")
    create_task(client, csrf_token, second["id"], title="Ship", status="Completed")
    create_task(client, csrf_token, second["id"], title="Follow up", status="Completed")

    response = client.get("/api/dashboard/stats")

    assert response.status_code == 200
    assert response.json() == {
        "total_projects": 2,
        "total_tasks": 4,
        "pending_tasks": 1,
        "in_progress_tasks": 1,
        "completed_tasks": 2,
        "completion_percentage": 50.0,
        "recent_tasks": response.json()["recent_tasks"],
    }
    assert len(response.json()["recent_tasks"]) == 4


def test_unauthorized_api_access_is_rejected(client):
    for path in ("/api/auth/me", "/api/projects", "/api/tasks", "/api/dashboard/stats"):
        assert client.get(path).status_code == 401


def test_cross_user_project_and_task_access_is_prevented(client, csrf_token):
    project = create_project(client, csrf_token, "Private project")
    task = create_task(client, csrf_token, project["id"])

    registration = client.post(
        "/api/auth/register",
        json={"username": "jordan", "email": "jordan@example.com", "password": "another-secure-42"},
    )
    assert registration.status_code == 201
    login = client.post(
        "/api/auth/login",
        json={"email": "jordan@example.com", "password": "another-secure-42"},
    )
    second_user_token = login.json()["csrf_token"]
    headers = {"X-CSRF-Token": second_user_token}

    assert client.get("/api/projects").json() == []
    assert client.get("/api/tasks").json() == []
    assert client.get(f"/api/projects/{project['id']}").status_code == 404
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert client.put(
        f"/api/projects/{project['id']}",
        json=project_payload("Takeover"),
        headers=headers,
    ).status_code == 404
    assert client.delete(f"/api/tasks/{task['id']}", headers=headers).status_code == 404
    assert client.post(
        "/api/tasks",
        json={"project_id": project["id"], "title": "Wrong owner"},
        headers=headers,
    ).status_code == 404


def test_mutations_require_a_valid_csrf_token(client, registered_user):
    login = client.post(
        "/api/auth/login",
        json={"email": "casey@example.com", "password": "correct-horse-42"},
    )

    response = client.post("/api/projects", json=project_payload())

    assert login.status_code == 200
    assert response.status_code == 403