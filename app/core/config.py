from pydantic_settings import BaseSettings
from typing import Literal

class Settings(BaseSettings):
    PROJECT_NAME: str = "LaserCutCore"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/laser_cut"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "supersecretjwtkeychangeme"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    LONG_TOKEN_EXPIRE_MINUTES: int = 43200
    QR_TOKEN_EXPIRE_MINUTES: int = 5
    ENVIRONMENT: Literal["dev", "prod"] = "dev"

    class Config:
        env_file = ".env"

settings = Settings()