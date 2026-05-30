from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

# Используем bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Обрезаем пароль до 72 байт для совместимости с bcrypt
    if len(plain_password.encode('utf-8')) > 72:
        plain_password = plain_password.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    # Обрезаем пароль до 72 байт для совместимости с bcrypt
    if len(password.encode('utf-8')) > 72:
        password = password.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    return pwd_context.hash(password)


def create_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})

    # ВАЖНО: JWT требует, чтобы sub был строкой
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])

    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        print(f"=== DECODING TOKEN ===")
        print(f"Token: {token[:50]}...")
        print(f"SECRET_KEY: {settings.SECRET_KEY}")
        print(f"ALGORITHM: {settings.ALGORITHM}")

        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        print(f"Decoded payload: {payload}")
        print(f"=== END DECODE ===")
        return payload
    except JWTError as e:
        print(f"=== JWT ERROR ===")
        print(f"Error: {e}")
        print(f"SECRET_KEY: {settings.SECRET_KEY}")
        print(f"=== END ERROR ===")
        return None