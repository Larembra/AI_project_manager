import pytest
from fastapi import HTTPException
from cryptography.fernet import Fernet
from app.services.integrations import decrypt_token, encrypt_token, parse_github_repository


def test_github_token_encryption_round_trip(monkeypatch):
    from app.services import integrations
    monkeypatch.setattr(integrations.settings, "INTEGRATIONS_ENCRYPTION_KEY", Fernet.generate_key().decode("ascii"))
    encrypted = encrypt_token("github_pat_sensitive_value")
    assert "github_pat_sensitive_value" not in encrypted
    assert decrypt_token(encrypted) == "github_pat_sensitive_value"


def test_github_token_encryption_requires_its_own_key(monkeypatch):
    from app.services import integrations
    monkeypatch.setattr(integrations.settings, "INTEGRATIONS_ENCRYPTION_KEY", "")
    with pytest.raises(HTTPException) as error:
        encrypt_token("github_pat_sensitive_value")
    assert error.value.status_code == 503


def test_parse_github_repository():
    assert parse_github_repository("https://github.com/owner/repository.git") == ("owner", "repository")
    assert parse_github_repository("owner/repository") == ("owner", "repository")


@pytest.mark.parametrize("value", ["http://github.com/owner/repo", "https://example.com/owner/repo", "https://github.com/owner", "https://github.com/owner/repo/issues"])
def test_parse_github_repository_rejects_invalid_urls(value):
    with pytest.raises(HTTPException):
        parse_github_repository(value)
