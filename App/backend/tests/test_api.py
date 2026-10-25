import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # "with" runs the lifespan, so the model is loaded once
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["vocab"] == 65000


def test_suggest_returns_k_sorted(client):
    r = client.post("/v1/suggest", json={"text": "ኢትዮጵያ ውስጥ", "k": 7})
    assert r.status_code == 200
    probs = [s["prob"] for s in r.json()["suggestions"]]
    assert len(probs) == 7 and probs == sorted(probs, reverse=True)


def test_empty_text_gives_sentence_start(client):
    r = client.post("/v1/suggest", json={"text": ""})
    assert r.status_code == 200 and len(r.json()["suggestions"]) == 5


def test_non_amharic_text_does_not_crash(client):
    r = client.post("/v1/suggest", json={"text": "hello world 123 <UNK> 😀"})
    assert r.status_code == 200 and len(r.json()["suggestions"]) == 5


def test_too_long_text_rejected(client):
    r = client.post("/v1/suggest", json={"text": "ሀ" * 501})
    assert r.status_code == 422
