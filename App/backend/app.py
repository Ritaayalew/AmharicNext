"""AmharicNext API: thin FastAPI layer around engine.NgramModel.

Run:  uv run python app.py      (listens on 0.0.0.0:8000 so a phone on the same Wi-Fi can reach it)

Settings (environment variables):
  AMHARICNEXT_MODEL_DIR     model folder, default serving/full
  AMHARICNEXT_CORS_ORIGINS  comma-separated allowed origins, default "*" (development only;
                            set real origins in production)
"""
import os
import socket
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from engine import DEFAULT_MODEL_DIR, NgramModel


class SuggestRequest(BaseModel):
    text: str = Field("", max_length=500)
    k: int = Field(5, ge=1, le=10)


class Suggestion(BaseModel):
    word: str
    prob: float
    order: int  # highest n-gram order (1-4) in which the word was seen after the context


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]
    latency_ms: float


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = NgramModel(DEFAULT_MODEL_DIR)  # loaded once, shared by all requests
    yield


app = FastAPI(title="AmharicNext", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("AMHARICNEXT_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health(request: Request):
    model = request.app.state.model
    return {"status": "ok", "model": DEFAULT_MODEL_DIR.name, "vocab": len(model.id2w)}


@app.post("/v1/suggest", response_model=SuggestResponse)
def suggest(body: SuggestRequest, request: Request):
    start = time.perf_counter()
    suggestions = request.app.state.model.suggest(body.text, body.k)
    return {"suggestions": suggestions, "latency_ms": round((time.perf_counter() - start) * 1000, 2)}


def lan_ip():
    """The laptop's address on the Wi-Fi network (no packet is actually sent)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


if __name__ == "__main__":
    import uvicorn

    print(f"\n  AmharicNext API on your network: http://{lan_ip()}:8000  (phone must be on the same Wi-Fi)\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
