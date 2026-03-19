"""Proxy token storage using OS keychain via keyring.

The proxy generates a per-session shared secret (UUID) for access control.
It saves this token to the OS keychain so that clients on the same machine
can discover and authenticate to the proxy without env vars.
"""

KEYRING_SERVICE = "robinhood-for-agents"
PROXY_TOKEN_NAME = "proxy-token"


def save_proxy_token(token: str) -> None:
    """Save proxy access token to OS keychain."""
    try:
        import keyring

        keyring.set_password(KEYRING_SERVICE, PROXY_TOKEN_NAME, token)
    except Exception:
        pass


def load_proxy_token() -> str | None:
    """Load proxy access token from OS keychain."""
    try:
        import keyring

        return keyring.get_password(KEYRING_SERVICE, PROXY_TOKEN_NAME)
    except Exception:
        return None


def delete_proxy_token() -> None:
    """Delete proxy access token from OS keychain."""
    try:
        import keyring

        keyring.delete_password(KEYRING_SERVICE, PROXY_TOKEN_NAME)
    except Exception:
        pass
