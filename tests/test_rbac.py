import pytest
from app.core.security import create_token

@pytest.mark.asyncio
async def test_admin_access_users(client):
    token = create_token({"sub": 1, "role": "admin"})
    resp = await client.get("/users/", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200

@pytest.mark.asyncio
async def test_operator_denied_users(client):
    token = create_token({"sub": 2, "role": "operator"})
    resp = await client.get("/users/", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 403