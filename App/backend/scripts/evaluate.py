"""Compare the full model with the pruned serving model on held-out text.

For each sampled position we give the model the 3 previous words and check
whether the real next word is in its top 1 / 3 / 5 suggestions.
Positions whose real word is <UNK>, <s> or </s> are skipped.

Usage:
  uv run python scripts/evaluate.py --val-check   # pick interpolation weights on val
  uv run python scripts/evaluate.py               # full vs default on test
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from engine import NgramModel, UNK, BOS, EOS  # noqa: E402

IDS = Path("model_artifacts/npy/ids")
N_POSITIONS = 20_000
DEFAULT = ((0.1, 0.2, 0.3, 0.4), 0.01)
CANDIDATES = [  # (lambda1..lambda4, add_k), at most 6
    DEFAULT,
    ((0.05, 0.15, 0.3, 0.5), 0.01),
    ((0.1, 0.3, 0.3, 0.3), 0.01),
    ((0.2, 0.3, 0.3, 0.2), 0.01),
    ((0.05, 0.25, 0.35, 0.35), 0.01),
    ((0.1, 0.2, 0.3, 0.4), 0.1),
]


def sample_positions(ids, n, seed=0, mask=None):
    """Fixed-seed sample of positions whose target is a real (in-vocabulary) word.
    If `mask` is given, only positions where mask is True are used."""
    ok = ~np.isin(ids, [UNK, BOS, EOS])
    if mask is not None:
        ok &= mask
    ok = np.flatnonzero(ok[3:]) + 3
    return np.sort(np.random.default_rng(seed).choice(ok, n, replace=False))


def novel_mask(train, test):
    """True for test positions whose sentence does NOT appear verbatim in train.
    GPAC contains duplicated text, so accuracy on duplicated sentences mostly
    measures memorisation; the novel subset is the honest number."""
    def sentences(ids):
        ends = np.flatnonzero(ids == EOS)
        return zip(np.r_[0, ends[:-1] + 1], ends)

    seen = {train[a:b][train[a:b] != BOS].tobytes() for a, b in sentences(train)}
    mask = np.ones(len(test), dtype=bool)
    for a, b in sentences(test):
        seg = test[a:b]
        if seg[seg != BOS].tobytes() in seen:
            mask[a:b + 1] = False
    return mask


def accuracy(model, ids, positions):
    hits = np.zeros(3)
    start = time.perf_counter()
    for p in positions:
        top = [w for w, _, _ in model.suggest_ids(ids[p - 3:p].tolist(), k=5)]
        target = ids[p]
        hits += [target in top[:1], target in top[:3], target in top[:5]]
    ms = (time.perf_counter() - start) * 1000 / len(positions)
    return hits / len(positions) * 100, ms


def size_mb(d):
    return sum(f.stat().st_size for f in Path(d).rglob("*") if f.is_file()) / 1e6


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--val-check", action="store_true")
    args = ap.parse_args()

    if args.val_check:
        val = np.load(IDS / "val.npy")
        pos = sample_positions(val, N_POSITIONS)
        print("Validation check on serving/default, 20,000 val positions")
        print("lambda1..4                k      top-1  top-3  top-5")
        for lambdas, k in CANDIDATES:
            acc, _ = accuracy(NgramModel("serving/default", lambdas, k), val, pos)
            print(f"{str(lambdas):24}  {k:<5}  " + "  ".join(f"{a:5.2f}" for a in acc))
        return

    test = np.load(IDS / "test.npy")
    pos = sample_positions(test, N_POSITIONS)
    novel = novel_mask(np.load(IDS / "train.npy"), test)
    pos_novel = sample_positions(test, N_POSITIONS, mask=novel)
    eligible = ~np.isin(test, [UNK, BOS, EOS])
    novel_share = (eligible & novel).sum() / eligible.sum() * 100

    rows = []
    for name in ("full", "keep20", "default"):
        t0 = time.perf_counter()
        model = NgramModel(f"serving/{name}", *DEFAULT, mmap=False)  # read fully into RAM
        load_s = time.perf_counter() - t0
        acc_novel, ms = accuracy(model, test, pos_novel)
        acc_all, _ = accuracy(model, test, pos)
        rows.append((name, size_mb(f"serving/{name}"), load_s, ms, acc_novel, acc_all))
        if name == "full":
            examples = [(p, model.suggest_ids(test[p - 3:p].tolist(), k=5)) for p in pos_novel[:3]]
            id2w = model.id2w
        del model

    def pct(acc):
        return " | ".join(f"{a:.2f}%" for a in acc)

    lines = [
        f"Interpolation weights l1..l4 = {DEFAULT[0]}, add-k = {DEFAULT[1]}. "
        f"Targets that are <UNK>/<s>/</s> are skipped. {N_POSITIONS:,} positions per subset, seed 0.",
        "",
        "Models: full = all n-grams · keep20 = top 20 continuations per context, singletons kept · "
        "default (lite) = top 20, singleton 3/4-grams dropped.",
        "",
        f"## Headline: novel text (test sentences NOT appearing verbatim in train, {novel_share:.1f}% of test positions)",
        "",
        "| model | size on disk | load time | ms/query | top-1 | top-3 | top-5 |",
        "|---|---|---|---|---|---|---|",
    ]
    lines += [f"| {n} | {mb:.0f} MB | {ld:.1f} s | {ms:.2f} | {pct(nov)} |" for n, mb, ld, ms, nov, _ in rows]
    lines += [
        "",
        f"## All test positions (includes the {100 - novel_share:.1f}% of positions in sentences duplicated in train)",
        "",
        "| model | top-1 | top-3 | top-5 |",
        "|---|---|---|---|",
    ]
    lines += [f"| {n} | {pct(acc)} |" for n, _, _, _, _, acc in rows]
    lines += [
        "",
        "Load time = reading every array into RAM. ms/query is measured on the novel subset.",
        "",
        "Example suggestions from serving/full (first 3 sampled novel test positions):",
        "",
    ]
    for p, sugg in examples:
        ctx = " ".join(id2w[w] for w in test[p - 3:p])
        words = ", ".join(f"{id2w[w]} ({prob:.3f}, {n}-gram)" for w, prob, n in sugg)
        lines.append(f"- context `{ctx}` → actual `{id2w[test[p]]}` → {words}")
    report = "\n".join(lines)
    print(report)
    Path("../docs").mkdir(exist_ok=True)
    Path("../docs/phase0_report.md").write_text("# Phase 0 report\n\n" + report + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
