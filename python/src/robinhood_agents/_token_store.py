"""Token storage adapters for Robinhood API credentials.

Two adapters are provided:

- **KeychainTokenStore** (default) — OS keychain via ``keyring``.
  Best for local dev on macOS/Linux with a desktop session.

- **EncryptedFileTokenStore** — AES-256-GCM encrypted file.
  Best for Docker, headless servers, CI, and cloud deployments
  where no OS keychain is available.

Auto-detection: if ``ROBINHOOD_TOKENS_FILE`` is set, the SDK uses
``EncryptedFileTokenStore``; otherwise it uses ``KeychainTokenStore``.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from time import time
from typing import Protocol, runtime_checkable

KEYRING_SERVICE = "robinhood-for-agents"
KEYRING_TOKENS = "session-tokens"
KEYRING_ENCRYPTION_KEY = "encryption-key"


# ---------------------------------------------------------------------------
# TokenData
# ---------------------------------------------------------------------------


@dataclass
class TokenData:
    """Robinhood OAuth tokens."""

    access_token: str
    refresh_token: str
    token_type: str
    device_token: str
    saved_at: float
    account_hint: str | None = None

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_type": self.token_type,
            "device_token": self.device_token,
            "saved_at": self.saved_at,
        }
        if self.account_hint is not None:
            d["account_hint"] = self.account_hint
        return d

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> TokenData | None:
        """Parse from a dict, returning None if required fields are missing."""
        try:
            return cls(
                access_token=str(data["access_token"]),
                refresh_token=str(data["refresh_token"]),
                token_type=str(data["token_type"]),
                device_token=str(data["device_token"]),
                saved_at=float(str(data["saved_at"])),
                account_hint=str(data["account_hint"]) if "account_hint" in data else None,
            )
        except (KeyError, TypeError, ValueError):
            return None


def with_timestamp(
    *,
    access_token: str,
    refresh_token: str,
    token_type: str,
    device_token: str,
    account_hint: str | None = None,
) -> TokenData:
    """Create TokenData with the current timestamp."""
    return TokenData(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type=token_type,
        device_token=device_token,
        saved_at=time(),
        account_hint=account_hint,
    )


# ---------------------------------------------------------------------------
# TokenStore protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class TokenStore(Protocol):
    """Interface for token persistence."""

    async def load(self) -> TokenData | None: ...
    async def save(self, tokens: TokenData) -> None: ...
    async def delete(self) -> None: ...


# ---------------------------------------------------------------------------
# KeychainTokenStore — OS keychain via keyring
# ---------------------------------------------------------------------------


class KeychainTokenStore:
    """Store tokens in the OS keychain via the ``keyring`` library.

    Keyring calls are synchronous and may block (especially on macOS with
    authorization prompts), so they are dispatched to a thread via
    ``asyncio.to_thread`` to avoid blocking the event loop.
    """

    async def load(self) -> TokenData | None:
        try:
            import keyring

            raw = await asyncio.to_thread(keyring.get_password, KEYRING_SERVICE, KEYRING_TOKENS)
            if raw:
                data = json.loads(raw)
                return TokenData.from_dict(data)
        except Exception:
            pass
        return None

    async def save(self, tokens: TokenData) -> None:
        import keyring

        await asyncio.to_thread(
            keyring.set_password, KEYRING_SERVICE, KEYRING_TOKENS, json.dumps(tokens.to_dict())
        )

    async def delete(self) -> None:
        try:
            import keyring

            await asyncio.to_thread(keyring.delete_password, KEYRING_SERVICE, KEYRING_TOKENS)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# EncryptedFileTokenStore — AES-256-GCM encrypted file
# ---------------------------------------------------------------------------

_IV_BYTES = 12
_KEY_BYTES = 32


def _resolve_encryption_key() -> bytes:
    """Resolve the encryption key: env var -> keychain -> generate (keychain only)."""
    # 1. Env var
    env_key = os.environ.get("ROBINHOOD_TOKEN_KEY", "").strip()
    if env_key:
        key = base64.b64decode(env_key)
        if len(key) != _KEY_BYTES:
            msg = f"ROBINHOOD_TOKEN_KEY must decode to {_KEY_BYTES} bytes (got {len(key)})"
            raise ValueError(msg)
        return key

    # 2. Keychain
    try:
        import keyring

        stored = keyring.get_password(KEYRING_SERVICE, KEYRING_ENCRYPTION_KEY)
        if stored:
            return base64.b64decode(stored)
    except Exception:
        pass

    # 3. Generate and store in keychain
    key = os.urandom(_KEY_BYTES)
    try:
        import keyring

        keyring.set_password(
            KEYRING_SERVICE,
            KEYRING_ENCRYPTION_KEY,
            base64.b64encode(key).decode(),
        )
    except Exception:
        pass  # Key lives only in memory this session
    return key


class EncryptedFileTokenStore:
    """Store tokens in an AES-256-GCM encrypted file."""

    def __init__(self, file_path: str | None = None) -> None:
        self._file_path = (
            file_path
            or os.environ.get("ROBINHOOD_TOKENS_FILE", "").strip()
            or str(Path.home() / ".robinhood-for-agents" / "tokens.enc")
        )

    async def load(self) -> TokenData | None:
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM

            raw = Path(self._file_path).read_text("utf-8")
            blob = json.loads(raw)
            if not all(k in blob for k in ("iv", "tag", "ciphertext")):
                return None

            key = _resolve_encryption_key()
            iv = base64.b64decode(blob["iv"])
            tag = base64.b64decode(blob["tag"])
            ciphertext = base64.b64decode(blob["ciphertext"])

            aesgcm = AESGCM(key)
            plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)

            data = json.loads(plaintext.decode("utf-8"))
            return TokenData.from_dict(data)
        except Exception:
            return None

    async def save(self, tokens: TokenData) -> None:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        key = _resolve_encryption_key()
        iv = os.urandom(_IV_BYTES)
        aesgcm = AESGCM(key)

        plaintext = json.dumps(tokens.to_dict()).encode("utf-8")
        ciphertext_with_tag = aesgcm.encrypt(iv, plaintext, None)

        # AESGCM appends the 16-byte tag to the ciphertext
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]

        blob = {
            "iv": base64.b64encode(iv).decode(),
            "tag": base64.b64encode(tag).decode(),
            "ciphertext": base64.b64encode(ciphertext).decode(),
        }

        path = Path(self._file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(blob), "utf-8")
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600 — owner only

    async def delete(self) -> None:
        Path(self._file_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Auto-detection
# ---------------------------------------------------------------------------


def create_token_store() -> KeychainTokenStore | EncryptedFileTokenStore:
    """Create the appropriate TokenStore based on environment."""
    if os.environ.get("ROBINHOOD_TOKENS_FILE", "").strip():
        return EncryptedFileTokenStore()
    return KeychainTokenStore()
