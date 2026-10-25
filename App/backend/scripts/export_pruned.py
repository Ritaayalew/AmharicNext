"""Export a (pruned) serving model from the full n-gram tables.

Pruning rules (defaults):
  * drop 3-grams and 4-grams seen only once (min count 2)
  * keep only the 20 most frequent continuations of each context
  * keep each context's ORIGINAL total count, so count/total is still the true
    relative frequency for every word we keep

Usage:
  uv run python scripts/export_pruned.py                       # -> serving/default
  uv run python scripts/export_pruned.py --top-k 0 --min-count-34 1 --out serving/full
    (top-k 0 = keep everything: the unpruned model in the same layout, for evaluation)
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np

CHUNK = 4_000_000  # rows per chunk, so memory stays small even for 43M 4-grams


def export_order(src, out, n, top_k, min_count):
    keys = np.load(src / f"table_{n}" / "keys.npy", mmap_mode="r")
    cnt = np.load(src / f"table_{n}" / "cnt.npy", mmap_mode="r")
    all_ctx_keys = np.load(src / f"table_{n}" / "ctx_keys.npy", mmap_mode="r")
    all_ctx_tot = np.load(src / f"table_{n}" / "ctx_tot.npy", mmap_mode="r")

    parts = {"ctx": [], "ids": [], "cnt": []}
    start = 0
    while start < len(keys):
        # End the chunk on a context boundary (keys are sorted, so all rows of
        # one context are next to each other).
        end = min(start + CHUNK, len(keys))
        if end < len(keys):
            end = int(np.searchsorted(keys, (int(keys[end]) >> 16) << 16))
        k = np.asarray(keys[start:end])
        c = np.asarray(cnt[start:end])
        start = end

        keep = c >= min_count
        k, c = k[keep], c[keep]
        ctx = k >> np.uint64(16)
        # Sort by context, then by count (descending) inside each context.
        o = np.lexsort((-c, ctx))
        ctx, k, c = ctx[o], k[o], c[o]
        if top_k:
            group_start = np.r_[0, np.flatnonzero(ctx[1:] != ctx[:-1]) + 1]
            group_len = np.diff(np.r_[group_start, len(ctx)])
            rank = np.arange(len(ctx)) - np.repeat(group_start, group_len)
            keep = rank < top_k
            ctx, k, c = ctx[keep], k[keep], c[keep]
        parts["ctx"].append(ctx)
        parts["ids"].append((k & np.uint64(0xFFFF)).astype(np.uint16))
        parts["cnt"].append(c.astype(np.uint32))

    ctx = np.concatenate(parts["ctx"])
    next_ids = np.concatenate(parts["ids"])
    next_cnt = np.concatenate(parts["cnt"])
    del parts

    ctx_keys, first = np.unique(ctx, return_index=True)
    offsets = np.r_[first, len(ctx)].astype(np.uint32)
    # Original context totals from the full model.
    pos = np.searchsorted(all_ctx_keys, ctx_keys)
    assert np.array_equal(all_ctx_keys[pos], ctx_keys), "context missing from ctx_keys"
    ctx_tot = np.asarray(all_ctx_tot[pos]).astype(np.uint32)

    d = out / f"order_{n}"
    d.mkdir(parents=True, exist_ok=True)
    for name, arr in (("ctx_keys", ctx_keys), ("ctx_tot", ctx_tot), ("offsets", offsets),
                      ("next_ids", next_ids), ("next_cnt", next_cnt)):
        np.save(d / f"{name}.npy", arr)
    print(f"order {n}: {len(ctx_keys):,} contexts, {len(next_ids):,} n-grams kept of {len(keys):,}")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="model_artifacts")
    ap.add_argument("--out", default="serving/default")
    ap.add_argument("--top-k", type=int, default=20, help="0 = keep all continuations")
    ap.add_argument("--min-count-34", type=int, default=2, help="min count for 3- and 4-grams")
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    npy = src / "npy"
    out.mkdir(parents=True, exist_ok=True)

    for n in (2, 3, 4):
        export_order(npy, out, n, args.top_k, args.min_count_34 if n >= 3 else 1)

    # Unigram counts as one dense array indexed by word id.
    vocab = json.loads((src / "vocab.json").read_text(encoding="utf-8"))
    uni_cnt = np.zeros(len(vocab["id2w"]), dtype=np.uint32)
    uni_cnt[np.load(npy / "table_1" / "keys.npy")] = np.load(npy / "table_1" / "cnt.npy")
    np.save(out / "uni_cnt.npy", uni_cnt)
    shutil.copy(src / "vocab.json", out / "vocab.json")

    files = sorted(p for p in out.rglob("*") if p.is_file() and p.name != "manifest.json")
    manifest = {
        "version": 1,
        "vocab_size": len(vocab["id2w"]),
        "settings": {"top_k": args.top_k, "min_count_34": args.min_count_34},
        "source_stats": vocab.get("stats"),
        "files": {str(p.relative_to(out)): sha256(p) for p in files},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"wrote {out} ({sum(p.stat().st_size for p in files) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
