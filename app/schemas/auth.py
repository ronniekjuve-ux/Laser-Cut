from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False

class QRLoginRequest(BaseModel):
    qr_payload: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"