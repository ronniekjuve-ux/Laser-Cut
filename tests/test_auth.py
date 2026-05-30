import pytest
from app.models.user import User
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_login_success(client, db_session):
    user = User(
        username="testop",
        password_hash=get_password_hash("pass"),
        role="operator"
    )
    db_session.add(user)
    await db_session.commit()

    resp = await client.post("/auth/login", json={
        "username": "testop",
        "password": "pass",
        "remember_me": False
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client, db_session):
    resp = await client.post("/auth/login", json={
        "username": "testop",
        "password": "wrong",
        "remember_me": False
    })
    assert resp.status_code == 401