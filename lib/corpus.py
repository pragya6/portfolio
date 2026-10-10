"""Loading the assistant's grounding corpus, and deciding what it may cite.

data/corpus.json is the whole of what the assistant knows about Pragya. It is
small enough — a couple of thousand tokens — to go into every prompt whole,
so there is no retrieval step here and none is wanted: a corpus that fits in
the context window cannot suffer a retrieval miss.

Two things this module is careful about:

  - The list of ids the assistant may cite is derived, never written down.
    Adding a project to the page and to the corpus is enough; nothing here
    needs editing. It also means `work` — an id the page moves between
    project bands at runtime — stays uncitable, because it is on the deny
    list rather than being an entry.

  - Only the visitor's own profile is sent. The hero and the results band
    read differently on ?r=genai and ?r=swe, and quoting the variant the
    visitor cannot see would produce a citation that nothing on screen
    matches.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

# Resolved from this file rather than the working directory: Vercel runs
# functions from the project root, uvicorn runs them from wherever it was
# started, and only one of those makes a relative path work.
CORPUS_PATH = Path(__file__).resolve().parents[1] / "data" / "corpus.json"

DEFAULT_PROFILE = "genai"


class CorpusError(RuntimeError):
    """The corpus is missing or unreadable — the assistant cannot run without it."""


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    """Read and cache the corpus. Cached because the file never changes at runtime."""
    try:
        return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise CorpusError("data/corpus.json was not bundled with the function") from error
    except (OSError, ValueError) as error:
        raise CorpusError(f"data/corpus.json could not be read: {error}") from error


@lru_cache(maxsize=1)
def citable_ids() -> frozenset[str]:
    """Every id the assistant is allowed to cite: each entry's anchor, minus the deny list."""
    corpus = load()
    entries = corpus.get("entries", [])
    denied = set(corpus.get("deny_ids", []))
    return frozenset({(e.get("anchor") or e.get("id")) for e in entries} - denied)


def profiles() -> list[str]:
    return list(load().get("profiles", [DEFAULT_PROFILE]))


def normalise_profile(value: str | None) -> str:
    """Fall back to the default for anything the corpus does not publish."""
    candidate = (value or "").strip().lower()
    return candidate if candidate in profiles() else DEFAULT_PROFILE


def _flatten(value: Any, profile: str) -> Any:
    """Collapse a {genai, swe} field down to the one profile being served."""
    if isinstance(value, dict) and set(value) <= set(profiles()):
        return value.get(profile, [])
    return value


def for_profile(profile: str) -> list[dict[str, Any]]:
    """The corpus entries as this visitor's page actually reads."""
    profile = normalise_profile(profile)
    flattened = []

    for entry in load().get("entries", []):
        copy = dict(entry)
        for field in ("text", "metrics"):
            if field in copy:
                copy[field] = _flatten(copy[field], profile)
        flattened.append(copy)

    return flattened


def summary() -> dict[str, Any]:
    """Counts for the health endpoint. Never the contents."""
    corpus = load()
    return {
        "loaded": True,
        "version": corpus.get("version"),
        "entries": len(corpus.get("entries", [])),
        "citable_ids": len(citable_ids()),
        "profiles": profiles(),
        "link_keys": len(corpus.get("link_keys", [])),
    }
