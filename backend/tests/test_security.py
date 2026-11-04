import pytest

from app.core.config import Settings
from app.core.security import hash_password, verify_password


def test_password_hash_roundtrip_and_salting():
    h1, h2 = hash_password("correct horse"), hash_password("correct horse")
    assert h1 != h2 and h1.startswith("$2")
    assert verify_password("correct horse", h1)
    assert not verify_password("wrong", h1)


def test_verify_password_handles_garbage_hash():
    assert verify_password("x", "not-a-hash") is False


def test_production_requires_real_secret():
    with pytest.raises(ValueError):
        Settings(environment="production", secret_key="dev-only-change-me")
    Settings(environment="production", secret_key="x" * 40)
