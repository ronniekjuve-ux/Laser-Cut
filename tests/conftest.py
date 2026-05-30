import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.base import Base
from app.db.session import engine, get_db
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.fixture(scope="session", autouse=True)
def setup_db(request):
    loop = asyncio.new_event_loop()
    loop.run_until_complete(engine.begin())
    yield
    loop.run_until_complete(engine.dispose())

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture
async def db_session():
    async with AsyncSession(engine) as session:
        yield session