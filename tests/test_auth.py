from sqlalchemy import select

from app.models import User


def test_registration_hashes_password(client):
    response = client.post(
        "/api/auth/register",
        json={"username": "casey", "email": "casey@example.com", "password": "correct-horse-42"},
    )

    assert response.status_code == 201
    assert response.json()["email"] == "casey@example.com"
    with client.app.state.session_factory() as db:
        user = db.scalar(select(User).where(User.email == "casey@example.com"))
        assert user.password_hash != "correct-horse-42"


def test_login_sets_authenticated_session_and_csrf(client, registered_user):
    response = client.post(
        "/api/auth/login",
        json={"email": "casey@example.com", "password": "correct-horse-42"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["id"] == registered_user["id"]
    assert response.json()["csrf_token"]
    assert client.get("/api/auth/me").status_code == 200


def test_invalid_login_is_rejected(client, registered_user):
    response = client.post(
        "/api/auth/login",
        json={"email": "casey@example.com", "password": "incorrect-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_private_endpoint_rejects_anonymous_user(client):
    assert client.get("/api/auth/me").status_code == 401