"""Deploy check for the assistant API.

Hit /api/health after a deploy. It answers the three questions that are
otherwise guesswork: did the function build, did the environment variables
arrive, and did data/corpus.json get bundled alongside the code.

It reports whether each secret is set, never what it is, and it does not
call the model — so it is safe to hit as often as you like and costs
nothing. Phase 1 adds /api/chat beside this; the two stay separate so a
broken chat endpoint can still be diagnosed from here.
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

CORPUS_PATH = Path(__file__).resolve().parents[1] / "data" / "corpus.json"


def corpus_status() -> dict:
    """Load the corpus and derive the ids the assistant will be allowed to cite.

    The allowlist is derived rather than written down: every entry's anchor
    (or its id), minus the deny list. That way adding a project to the page
    and the corpus is enough, and an id that moves at runtime — `work`, which
    the page hands to whichever project band ends up first — can never become
    a citation that points somewhere else.
    """
    if not CORPUS_PATH.exists():
        return {"loaded": False, "reason": "data/corpus.json was not bundled"}

    try:
        corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return {"loaded": False, "reason": f"unreadable: {error}"}

    entries = corpus.get("entries", [])
    denied = set(corpus.get("deny_ids", []))
    allowed = sorted({(e.get("anchor") or e.get("id")) for e in entries} - denied)

    return {
        "loaded": True,
        "version": corpus.get("version"),
        "entries": len(entries),
        "citable_ids": len(allowed),
        "profiles": corpus.get("profiles", []),
        "link_keys": len(corpus.get("link_keys", [])),
    }


def env_status() -> dict:
    """Which settings arrived. Values are never returned, only whether they are set.

    The model name is the one exception: it is not a secret, and seeing the
    wrong one here is the quickest way to explain a surprising answer.
    """
    required = ["GEMINI_API_KEY"]
    optional = [
        "TURNSTILE_SECRET",
        "RESEND_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
    ]
    link_keys = [
        "LINK_SWE_RESUME",
        "LINK_GENAI_RESUME",
        "LINK_PORTFOLIO",
        "LINK_LINKEDIN",
        "LINK_GITHUB",
        "LINK_CRM_AGENT",
        "LINK_HOMOEO_QUIZ",
    ]
    origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

    return {
        "model": os.environ.get("GEMINI_MODEL") or "unset",
        "model_fallback": os.environ.get("GEMINI_MODEL_FALLBACK") or "unset",
        "secrets_set": {name: bool(os.environ.get(name)) for name in required + optional},
        "links_set": sum(1 for name in link_keys if os.environ.get(name)),
        "links_total": len(link_keys),
        "allowed_origins": len(origins),
    }


def payload() -> dict:
    corpus = corpus_status()
    env = env_status()
    ready = bool(corpus.get("loaded")) and env["secrets_set"]["GEMINI_API_KEY"] and env["allowed_origins"] > 0
    return {"ok": True, "ready_for_chat": ready, "corpus": corpus, "config": env}


# Vercel passes the full request path through to the app, so the route is
# registered under its public URL. The bare path is kept as a convenience
# for running this locally with uvicorn.
@app.get("/api/health")
@app.get("/")
def health() -> dict:
    return payload()
