"""The assistant's API.

Vercel detects FastAPI from requirements.txt and loads the top-level `app`
from this file, then routes every request to it. The page itself is not
deployed here — see .vercelignore — so this host answers nothing but the
API routes declared below.

Phase 0 ships /api/health only. /api/chat arrives in Phase 1 and will live
beside it in this same app, sharing lib/corpus.py.
"""

from __future__ import annotations

import os

from fastapi import FastAPI

from lib import corpus

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def _env_status() -> dict:
    """Which settings arrived — whether they are set, never what they are.

    The model name is the one value reported back. It is not a secret, and
    seeing the wrong one here is the fastest explanation for a surprising
    answer later.
    """
    secrets = ["GEMINI_API_KEY", "TURNSTILE_SECRET", "RESEND_API_KEY",
               "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    links = ["LINK_SWE_RESUME", "LINK_GENAI_RESUME", "LINK_PORTFOLIO", "LINK_LINKEDIN",
             "LINK_GITHUB", "LINK_CRM_AGENT", "LINK_HOMOEO_QUIZ"]
    origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

    return {
        "model": os.environ.get("GEMINI_MODEL") or "unset",
        "model_fallback": os.environ.get("GEMINI_MODEL_FALLBACK") or "unset",
        "secrets_set": {name: bool(os.environ.get(name)) for name in secrets},
        "links_set": sum(1 for name in links if os.environ.get(name)),
        "links_total": len(links),
        "allowed_origins": len(origins),
    }


@app.get("/api/health")
def health() -> dict:
    """Deploy check: did the function build, did the settings arrive, is the corpus here.

    It calls no model, so it is free and safe to hit as often as you like.
    """
    try:
        corpus_state = corpus.summary()
    except corpus.CorpusError as error:
        corpus_state = {"loaded": False, "reason": str(error)}

    config = _env_status()
    ready = (
        corpus_state.get("loaded", False)
        and config["secrets_set"]["GEMINI_API_KEY"]
        and config["allowed_origins"] > 0
    )

    return {"ok": True, "ready_for_chat": ready, "corpus": corpus_state, "config": config}


@app.get("/")
def root() -> dict:
    """The portfolio lives on GitHub Pages; this host only answers API routes."""
    return {"ok": True, "see": "/api/health"}
