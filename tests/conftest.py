import pytest
from fastapi.testclient import TestClient

from app.database import build_engine
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'taskflow-test.db'}")
    application = create_app(engine)
    with TestClient(application) as test_client:
        yield test_client
    engine.dispose()


@pytest.fixture
def registered_user(client):
    response = client.post(
        "/api/auth/register",
        json={"username": "casey", "email": "casey@example.com", "password": "correct-horse-42"},
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def csrf_token(client, registered_user):
    response = client.post(
        "/api/auth/login",
        json={"email": "casey@example.com", "password": "correct-horse-42"},
    )
    assert response.status_code == 200
    return response.json()["csrf_token"]