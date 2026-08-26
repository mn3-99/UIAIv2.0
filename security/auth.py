import hashlib
import hmac
import base64
import json
import os
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional, Dict

try:
    import jwt
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False

try:
    import bcrypt
    BCRYPT_AVAILABLE = True
except ImportError:
    BCRYPT_AVAILABLE = False

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV_PATH = os.path.join(_PROJECT_ROOT, ".env")


def load_env_file() -> None:
    """Load project .env into os.environ (without overriding real env vars)."""
    try:
        from dotenv import load_dotenv
        load_dotenv(_ENV_PATH, override=False)
        return
    except ImportError:
        pass
    # Minimal fallback parser (KEY=VALUE lines, optional quotes, # comments).
    # Matches python-dotenv semantics: within the file the LAST occurrence of a
    # key wins, and real environment variables always take precedence.
    try:
        if not os.path.exists(_ENV_PATH):
            return
        parsed: Dict[str, str] = {}
        with open(_ENV_PATH, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    parsed[key] = value
        for key, value in parsed.items():
            if key not in os.environ:
                os.environ[key] = value
    except Exception:
        pass


def _read_env_value(key: str) -> str:
    """Read a key straight from the .env file (last occurrence wins)."""
    try:
        if not os.path.exists(_ENV_PATH):
            return ""
        value = ""
        with open(_ENV_PATH, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith(f"{key}="):
                    value = line.partition("=")[2].strip().strip('"').strip("'")
        return value
    except Exception:
        return ""


def ensure_env_secret(key: str) -> str:
    """
    Return the secret for `key` from the environment. When absent, generate a
    cryptographically strong one and persist it to the project .env file so it
    survives restarts. Never falls back to a hardcoded value. Re-scans the .env
    file before generating to stay consistent when several processes boot at once.
    """
    existing = os.environ.get(key, "").strip()
    if existing:
        return existing
    from_file = _read_env_value(key)
    if from_file:
        os.environ[key] = from_file
        return from_file
    generated = secrets.token_urlsafe(48)
    try:
        with open(_ENV_PATH, "a", encoding="utf-8") as fh:
            fh.write(f"\n# Auto-generated strong secret ({time.strftime('%Y-%m-%d %H:%M:%S')})\n{key}={generated}\n")
    except Exception as exc:
        # Secret stays valid for this process lifetime even if persistence fails.
        print(f"⚠️ [security] Could not persist {key} to .env: {exc}")
    os.environ[key] = generated
    return generated


load_env_file()

SECRET_KEY = ensure_env_secret("JWT_SECRET_KEY")

def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _b64_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

class SecureAuthManager:
    """
    Secure password hashing & JWT auth manager with bcrypt & PBKDF2 fallback
    and pure Python JWT fallback when pyjwt is not installed.
    """
    @staticmethod
    def hash_password(password: str) -> str:
        if BCRYPT_AVAILABLE:
            salt = bcrypt.gensalt(rounds=12)
            return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
        else:
            salt = os.urandom(16)
            pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
            return f"pbkdf2:{salt.hex()}:{pwd_hash.hex()}"

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        if not hashed:
            return False
        # Legacy plain-text fallback (auto-upgraded on next login)
        if not hashed.startswith("$2") and not hashed.startswith("pbkdf2:"):
            return password == hashed
            
        if hashed.startswith("$2") and BCRYPT_AVAILABLE:
            try:
                return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
            except Exception:
                return False
        elif hashed.startswith("pbkdf2:"):
            try:
                parts = hashed.split(":")
                salt = bytes.fromhex(parts[1])
                expected = parts[2]
                pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000).hex()
                return pwd_hash == expected
            except Exception:
                return False
        return password == hashed

    @staticmethod
    def generate_token(user_id: str, role: str, email: str = "", expires_hours: int = 24) -> str:
        exp_time = datetime.utcnow() + timedelta(hours=expires_hours)
        if JWT_AVAILABLE:
            payload = {
                "user_id": user_id,
                "role": role,
                "email": email,
                "exp": exp_time,
                "iat": datetime.utcnow()
            }
            return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

        # Standard library JWT encoder fallback
        payload = {
            "user_id": user_id,
            "role": role,
            "email": email,
            "exp": int(exp_time.timestamp()),
            "iat": int(datetime.utcnow().timestamp())
        }
        header = {"alg": "HS256", "typ": "JWT"}
        header_b64 = _b64_encode(json.dumps(header).encode('utf-8'))
        payload_b64 = _b64_encode(json.dumps(payload).encode('utf-8'))
        signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
        signature = hmac.new(SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest()
        signature_b64 = _b64_encode(signature)
        return f"{header_b64}.{payload_b64}.{signature_b64}"

    @staticmethod
    def verify_token(token: str) -> Optional[Dict]:
        if JWT_AVAILABLE:
            try:
                return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            except Exception:
                return None

        try:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            header_b64, payload_b64, signature_b64 = parts
            signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
            expected_sig = _b64_encode(hmac.new(SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest())
            if not hmac.compare_digest(signature_b64, expected_sig):
                return None
            payload = json.loads(_b64_decode(payload_b64).decode('utf-8'))
            if payload.get("exp") and time.time() > payload["exp"]:
                return None
            return payload
        except Exception:
            return None

