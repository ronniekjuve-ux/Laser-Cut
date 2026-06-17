import json
import hashlib
from functools import wraps
from typing import Optional, Callable
import redis.asyncio as aioredis
from app.core.config import settings

redis_client: Optional[aioredis.Redis] = None


async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return redis_client


async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None


def cache_key(prefix: str, *args, **kwargs) -> str:
    raw = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{prefix}:{h}"


def cached(prefix: str, ttl: int = 30):
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            r = await get_redis()
            key = cache_key(prefix, *args, **{k: v for k, v in kwargs.items() if k not in ('db', 'user', 'current_user')})
            try:
                cached_val = await r.get(key)
                if cached_val:
                    return json.loads(cached_val)
            except Exception:
                pass

            result = await func(*args, **kwargs)

            try:
                await r.setex(key, ttl, json.dumps(result, default=str))
            except Exception:
                pass

            return result
        return wrapper
    return decorator


async def invalidate(pattern: str):
    try:
        r = await get_redis()
        keys = await r.keys(f"{pattern}*")
        if keys:
            await r.delete(*keys)
    except Exception:
        pass
