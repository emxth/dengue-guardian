"""PHI login and signed bearer-token helpers."""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from component_3_phi_planning.api.mongo_store import get_database


bearer_scheme = HTTPBearer(auto_error=False)
PASSWORD_ITERATIONS = 310_000
TOKEN_ALGORITHM = "HS256"
TOKEN_LIFETIME_HOURS = 8
JWT_SECRET_PATH = Path(__file__).resolve().parent / "output" / ".phi_jwt_secret"


def get_signing_secret():
    configured_secret = os.getenv("PHI_JWT_SECRET")
    if configured_secret:
        return configured_secret
    if os.getenv("APP_ENV", "development").casefold() not in {"development", "dev", "test"}:
        raise RuntimeError("PHI_JWT_SECRET is required outside local development.")

    JWT_SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        with JWT_SECRET_PATH.open("x", encoding="utf-8") as secret_file:
            secret_file.write(secrets.token_urlsafe(48))
    except FileExistsError:
        pass
    return JWT_SECRET_PATH.read_text(encoding="utf-8").strip()


def hash_password(password, salt=None):
    salt_bytes = salt or secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt_bytes, PASSWORD_ITERATIONS
    )
    return {
        "salt": salt_bytes.hex(),
        "password_hash": password_hash.hex(),
        "iterations": PASSWORD_ITERATIONS,
    }


def verify_password(password, account):
    try:
        expected = bytes.fromhex(account["password_hash"])
        salt = bytes.fromhex(account["salt"])
        iterations = int(account["iterations"])
    except (KeyError, TypeError, ValueError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def issue_token(phi_id):
    secret = get_signing_secret()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": phi_id, "role": "phi", "iat": now, "exp": now + timedelta(hours=TOKEN_LIFETIME_HOURS)},
        secret,
        algorithm=TOKEN_ALGORITHM,
    )


def get_current_phi(credentials=Depends(bearer_scheme)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="PHI login required.")
    try:
        secret = get_signing_secret()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="PHI authentication is not configured.",
        ) from exc
    try:
        claims = jwt.decode(credentials.credentials, secret, algorithms=[TOKEN_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="PHI session is invalid or expired.") from exc
    if claims.get("role") != "phi" or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="PHI session is invalid.")
    try:
        database = get_database()
        collection = database.phi_accounts if hasattr(database, "phi_accounts") else database["phi_accounts"]
        account = collection.find_one(
            {"phi_id": claims["sub"], "active": True},
            {"_id": 0, "phi_id": 1, "display_name": 1, "moh_area": 1, "phi_range": 1},
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="PHI account service is unavailable.") from exc
    if account is None:
        raise HTTPException(status_code=401, detail="PHI account is inactive.")
    return account