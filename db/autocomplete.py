"""User prompt autocomplete dictionaries: pos/neg folders, one SQLite per letter bucket."""

from __future__ import annotations

import os
import re
import sqlite3
import threading
import time
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

# One lock per bucket file so rebuild can flush different letters in parallel.
_bucket_locks_guard = threading.Lock()
_bucket_locks: Dict[Tuple[str, str], threading.Lock] = {}

SIDES = ("pos", "neg")
MIN_SEGMENT_LEN = 2
DEFAULT_LIMIT = 20
_OTHER_BUCKET = "_other"
# HDD-friendly: a few parallel bucket writers, not one sqlite open per tag.
_REBUILD_FLUSH_WORKERS = 4


def _lock_for(side: str, bucket: str) -> threading.Lock:
    key = (side, bucket)
    with _bucket_locks_guard:
        lock = _bucket_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _bucket_locks[key] = lock
        return lock

# Outer (…), optional :weight; also strip trailing :weight on bare tokens.
_WRAP_RE = re.compile(r"^\((.+)\)$")
_WEIGHT_SUFFIX_RE = re.compile(r":[\d.]+$")
# Filename-safe single-char buckets; everything else → _other.
_UNSAFE_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _root_dir() -> str:
    directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autocomplete")
    os.makedirs(directory, exist_ok=True)
    return directory


def _side_dir(side: str) -> str:
    key = _normalize_side(side)
    path = os.path.join(_root_dir(), key)
    os.makedirs(path, exist_ok=True)
    return path


def _normalize_side(side: str) -> str:
    key = (side or "").strip().lower()
    if key in ("positive", "pos", "str_pos"):
        return "pos"
    if key in ("negative", "neg", "str_neg"):
        return "neg"
    raise ValueError("side must be pos or neg")


def normalize_segment(raw: str) -> str:
    text = unicodedata.normalize("NFC", (raw or "").strip())
    if not text:
        return ""
    # Collapse whitespace inside the segment.
    text = re.sub(r"\s+", " ", text)
    # Peel weight wrappers repeatedly: (foo:1.2) / ((bar))
    while True:
        match = _WRAP_RE.match(text)
        if not match:
            break
        text = match.group(1).strip()
        text = _WEIGHT_SUFFIX_RE.sub("", text).strip()
    text = _WEIGHT_SUFFIX_RE.sub("", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text.casefold()


def split_prompt_segments(prompt: str) -> List[str]:
    if not prompt:
        return []
    # Commas and newlines are separators; keep phrase spaces inside a segment.
    chunks = re.split(r"[\n,]+", prompt)
    out: List[str] = []
    seen = set()
    for chunk in chunks:
        seg = normalize_segment(chunk)
        if len(seg) < MIN_SEGMENT_LEN:
            continue
        if seg in seen:
            continue
        seen.add(seg)
        out.append(seg)
    return out


def bucket_key(segment: str) -> str:
    seg = normalize_segment(segment)
    if not seg:
        return _OTHER_BUCKET
    ch = seg[0]
    if not ch.isalnum():
        return _OTHER_BUCKET
    if _UNSAFE_NAME_RE.search(ch):
        return _OTHER_BUCKET
    # Avoid Windows reserved device names if somehow single-token equals them.
    if ch in (".", " "):
        return _OTHER_BUCKET
    return ch


def _bucket_path(side: str, bucket: str) -> str:
    name = bucket if bucket == _OTHER_BUCKET else bucket
    # Extra guard: only allow single alnum char or _other
    if name != _OTHER_BUCKET:
        if len(name) != 1 or not name.isalnum() or _UNSAFE_NAME_RE.search(name):
            name = _OTHER_BUCKET
    return os.path.join(_side_dir(side), f"{name}.sqlite")


def _connect_bucket(side: str, bucket: str) -> sqlite3.Connection:
    path = _bucket_path(side, bucket)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS segments (
            id INTEGER PRIMARY KEY,
            text TEXT NOT NULL UNIQUE COLLATE NOCASE,
            use_count INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_segments_text ON segments(text);
        CREATE INDEX IF NOT EXISTS idx_segments_use ON segments(use_count DESC);
        """
    )
    conn.commit()
    return conn


def _flush_counts(side: str, bucket: str, counts: Dict[str, int]) -> Tuple[int, int]:
    """Write aggregated segment counts into one bucket file (one open + one txn)."""
    if not counts:
        return 0, 0
    key = _normalize_side(side)
    now = int(time.time())
    added = 0
    updated = 0
    with _lock_for(key, bucket):
        conn = _connect_bucket(key, bucket)
        try:
            conn.execute("BEGIN")
            for text, n in counts.items():
                inc = max(1, int(n))
                row = conn.execute(
                    "SELECT id, use_count FROM segments WHERE text = ? COLLATE NOCASE",
                    (text,),
                ).fetchone()
                if row:
                    conn.execute(
                        """
                        UPDATE segments
                        SET use_count = ?, updated_at = ?, text = ?
                        WHERE id = ?
                        """,
                        (int(row["use_count"]) + inc, now, text, int(row["id"])),
                    )
                    updated += 1
                else:
                    conn.execute(
                        """
                        INSERT INTO segments (text, use_count, updated_at)
                        VALUES (?, ?, ?)
                        """,
                        (text, inc, now),
                    )
                    added += 1
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    return added, updated


def ingest_segments(side: str, segments: Sequence[str]) -> Dict:
    key = _normalize_side(side)
    by_bucket: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for raw in segments:
        seg = normalize_segment(raw)
        if len(seg) < MIN_SEGMENT_LEN:
            continue
        by_bucket[bucket_key(seg)][seg] += 1

    added = 0
    updated = 0
    for bucket, counts in by_bucket.items():
        a, u = _flush_counts(key, bucket, counts)
        added += a
        updated += u

    return {"ok": True, "side": key, "added": added, "updated": updated}


def ingest_prompt(side: str, prompt: str) -> Dict:
    return ingest_segments(side, split_prompt_segments(prompt))


def ingest_pair(positive: str = "", negative: str = "") -> Dict:
    pos = ingest_prompt("pos", positive or "")
    neg = ingest_prompt("neg", negative or "")
    return {
        "ok": True,
        "pos": pos,
        "neg": neg,
    }


def lookup(side: str, prefix: str, limit: int = DEFAULT_LIMIT) -> Dict:
    key = _normalize_side(side)
    needle = normalize_segment(prefix)
    if len(needle) < 1:
        return {"ok": True, "side": key, "prefix": needle, "items": []}

    lim = max(1, min(int(limit or DEFAULT_LIMIT), 50))
    bucket = bucket_key(needle)
    path = _bucket_path(key, bucket)
    if not os.path.isfile(path):
        return {"ok": True, "side": key, "prefix": needle, "items": []}

    like = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    with _lock_for(key, bucket):
        conn = _connect_bucket(key, bucket)
        try:
            rows = conn.execute(
                """
                SELECT text, use_count
                FROM segments
                WHERE text LIKE ? ESCAPE '\\' COLLATE NOCASE
                ORDER BY use_count DESC, text COLLATE NOCASE ASC
                LIMIT ?
                """,
                (like, lim),
            ).fetchall()
            items = [{"text": row["text"], "use_count": int(row["use_count"])} for row in rows]
            return {"ok": True, "side": key, "prefix": needle, "items": items}
        finally:
            conn.close()


def add_segment(side: str, text: str) -> Dict:
    seg = normalize_segment(text)
    if len(seg) < MIN_SEGMENT_LEN:
        return {"ok": False, "error": f"Segment too short (min {MIN_SEGMENT_LEN})"}
    result = ingest_segments(side, [seg])
    result["text"] = seg
    return result


def delete_segment(side: str, text: str) -> Dict:
    key = _normalize_side(side)
    seg = normalize_segment(text)
    if not seg:
        return {"ok": False, "error": "Empty segment"}
    bucket = bucket_key(seg)
    path = _bucket_path(key, bucket)
    if not os.path.isfile(path):
        return {"ok": False, "error": "Not found"}

    with _lock_for(key, bucket):
        conn = _connect_bucket(key, bucket)
        try:
            cur = conn.execute(
                "DELETE FROM segments WHERE text = ? COLLATE NOCASE",
                (seg,),
            )
            conn.commit()
            if cur.rowcount <= 0:
                return {"ok": False, "error": "Not found"}
            return {"ok": True, "side": key, "text": seg}
        finally:
            conn.close()


def list_segments(side: str, bucket: str = "", limit: int = 500) -> Dict:
    key = _normalize_side(side)
    lim = max(1, min(int(limit or 500), 2000))
    items: List[Dict] = []

    directory = _side_dir(key)
    want = (bucket or "").strip().casefold()
    if want:
        if want != _OTHER_BUCKET and (len(want) != 1 or not want.isalnum()):
            return {"ok": False, "error": "Invalid bucket"}
        path = _bucket_path(key, want if want == _OTHER_BUCKET else want)
        files = [path] if os.path.isfile(path) else []
    else:
        files = sorted(
            os.path.join(directory, name)
            for name in os.listdir(directory)
            if name.endswith(".sqlite")
        )

    for path in files:
        if not os.path.isfile(path):
            continue
        bname = os.path.splitext(os.path.basename(path))[0]
        with _lock_for(key, bname):
            conn = sqlite3.connect(path, timeout=30)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    """
                    SELECT text, use_count, updated_at
                    FROM segments
                    ORDER BY text COLLATE NOCASE ASC
                    LIMIT ?
                    """,
                    (lim,),
                ).fetchall()
                for row in rows:
                    items.append(
                        {
                            "text": row["text"],
                            "use_count": int(row["use_count"]),
                            "updated_at": int(row["updated_at"]),
                            "bucket": bname,
                        }
                    )
                    if len(items) >= lim:
                        break
            finally:
                conn.close()
        if len(items) >= lim:
            break

    items.sort(key=lambda row: (row["text"], row["bucket"]))
    return {"ok": True, "side": key, "items": items[:lim]}


def list_buckets(side: str) -> Dict:
    key = _normalize_side(side)
    directory = _side_dir(key)
    names = []
    if os.path.isdir(directory):
        for name in os.listdir(directory):
            if name.endswith(".sqlite"):
                names.append(os.path.splitext(name)[0])
    names.sort(key=lambda n: (n == _OTHER_BUCKET, n))
    return {"ok": True, "side": key, "buckets": names}


def _accumulate_prompt(acc: Dict[str, Dict[str, int]], prompt: str) -> None:
    for seg in split_prompt_segments(prompt):
        acc[bucket_key(seg)][seg] += 1


def iter_rebuild_events(rows: Sequence[Dict]) -> Iterator[Dict]:
    """
    Fast rebuild:
      1) parse all pairs in memory (no disk)
      2) flush each letter-bucket once (parallel writers)
    Yields NDJSON-friendly progress events.
    """
    pair_total = len(rows)
    yield {
        "ok": True,
        "phase": "start",
        "stage": "parse",
        "current": 0,
        "total": pair_total,
        "presets": pair_total,
        "unit": "pairs",
    }

    pos_acc: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    neg_acc: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for index, row in enumerate(rows, start=1):
        _accumulate_prompt(pos_acc, row.get("positive") or "")
        _accumulate_prompt(neg_acc, row.get("negative") or "")
        title = (row.get("title") or "").strip()
        shelf = (row.get("category") or "").strip()
        label = f"{shelf} / {title}" if shelf and title else (title or shelf or f"pair {index}")
        # Parse is cheap — reserve 0–70% of the bar for it.
        pct = int(round((index / pair_total) * 70)) if pair_total else 70
        yield {
            "ok": True,
            "phase": "progress",
            "stage": "parse",
            "current": index,
            "total": pair_total,
            "presets": pair_total,
            "unit": "pairs",
            "percent": pct,
            "title": title,
            "category": shelf,
            "label": label,
        }

    jobs: List[Tuple[str, str, Dict[str, int]]] = []
    for bucket, counts in pos_acc.items():
        jobs.append(("pos", bucket, dict(counts)))
    for bucket, counts in neg_acc.items():
        jobs.append(("neg", bucket, dict(counts)))

    bucket_total = len(jobs)
    if not bucket_total:
        yield {
            "ok": True,
            "phase": "done",
            "current": pair_total,
            "total": pair_total,
            "percent": 100,
            "presets": pair_total,
            "buckets": 0,
            "unit": "pairs",
        }
        return

    done_jobs = 0
    workers = max(1, min(_REBUILD_FLUSH_WORKERS, bucket_total))

    def _job(item: Tuple[str, str, Dict[str, int]]) -> Tuple[str, str, int, int]:
        side, bucket, counts = item
        added, updated = _flush_counts(side, bucket, counts)
        return side, bucket, added, updated

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_job, job): job for job in jobs}
        for fut in as_completed(futures):
            side, bucket, _added, _updated = fut.result()
            done_jobs += 1
            pct = 70 + int(round((done_jobs / bucket_total) * 30))
            yield {
                "ok": True,
                "phase": "progress",
                "stage": "write",
                "current": done_jobs,
                "total": bucket_total,
                "presets": pair_total,
                "buckets": bucket_total,
                "unit": "buckets",
                "percent": min(99, pct),
                "label": f"{side}/{bucket_label(bucket)}",
                "title": bucket_label(bucket),
                "category": side,
            }

    yield {
        "ok": True,
        "phase": "done",
        "current": pair_total,
        "total": pair_total,
        "percent": 100,
        "presets": pair_total,
        "buckets": bucket_total,
        "unit": "pairs",
    }


def bucket_label(bucket: str) -> str:
    return "other" if not bucket or bucket == _OTHER_BUCKET else bucket


def rebuild_from_presets(preset_rows: Iterable[Tuple[str, str]]) -> Dict:
    """Ingest (positive, negative) pairs from the main library (batched)."""
    rows = [
        {"positive": pos or "", "negative": neg or "", "title": "", "category": ""}
        for pos, neg in preset_rows
    ]
    last = {"ok": True, "presets": len(rows)}
    for event in iter_rebuild_events(rows):
        if event.get("phase") == "done":
            last = event
    return {
        "ok": True,
        "presets": int(last.get("presets") or len(rows)),
        "buckets": int(last.get("buckets") or 0),
    }
