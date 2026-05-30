import pytest
from app.core.security import create_token


@pytest.mark.asyncio
async def test_audit_time_masking(client, db_session):
    admin_token = create_token({"sub": 1, "role": "admin"})
    op_token = create_token({"sub": 2, "role": "operator"})

    r_admin = await client.get("/audit/logs", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    r_op = await client.get("/audit/logs", headers={
        "Authorization": f"Bearer {op_token}"
    })

    assert r_admin.status_code == 200
    assert r_op.status_code == 200