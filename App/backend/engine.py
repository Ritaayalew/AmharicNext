"""N-gram next-word engine for AmharicNext.

How the model is stored (written by scripts/export_pruned.py)
------------------------------------------------------------
Words are numbered 0..V-1 (vocab.json). Ids 0, 1, 2 are <UNK>, <s>, </s>.
For each order n = 2, 3, 4 we store, for every context (the n-1 previous words):
  ctx_keys[i]   the context packed into one integer (16 bits per word, oldest first)
  ctx_tot[i]    how many times that context was seen in training (ORIGINAL total,
                so probabilities stay correct even after pruning)
  offsets[i]..offsets[i+1]   slice into next_ids / next_cnt
  next_ids, next_cnt   words seen after that context and their counts,
                       most frequent first
Unigram counts are stored densely in uni_cnt (one count per word id).

How a suggestion is scored (linear interpolation)
-------------------------------------------------
  P(w | a b c) = l1*P1(w) + l2*P2(w|c) + l3*P3(w|b c) + l4*P4(w|a b c)
where Pn(w|context) = count(context, w) / count(context), or 0 if the context
(or the word after it) was never seen. P1 uses add-k smoothing so every word
gets a small non-zero probability. When the 4-word history is unseen, the
lower orders still contribute: this is how the model "backs off".
"""
import json
import os
from pathlib import Path

import numpy as np

UNK, BOS, EOS = 0, 1, 2
ORDERS = (2, 3, 4)

# Which exported model to load: set AMHARICNEXT_MODEL_DIR to switch, e.g. to
# serving/default (the 296 MB "lite" model). Relative paths are resolved from backend/.
BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = BACKEND_DIR / os.environ.get("AMHARICNEXT_MODEL_DIR", "serving/full")


def pack(ids):
    """Pack a sequence of word ids into one integer, 16 bits each, oldest first."""
    key = 0
    for w in ids:
        key = (key << 16) | int(w)
    return key


class NgramModel:
    def __init__(self, model_dir=DEFAULT_MODEL_DIR, lambdas=(0.1, 0.2, 0.3, 0.4), add_k=0.01, mmap=True):
        d = Path(model_dir)
        mode = "r" if mmap else None
        self.id2w = json.loads((d / "vocab.json").read_text(encoding="utf-8"))["id2w"]
        self.w2id = {w: i for i, w in enumerate(self.id2w)}
        V = len(self.id2w)

        self.tables = {}
        for n in ORDERS:
            t = d / f"order_{n}"
            self.tables[n] = {name: np.load(t / f"{name}.npy", mmap_mode=mode)
                              for name in ("ctx_keys", "ctx_tot", "offsets", "next_ids", "next_cnt")}

        # Unigram probability with add-k smoothing: (count(w) + k) / (N + k*V)
        uni_cnt = np.load(d / "uni_cnt.npy").astype(np.float64)
        self.p1 = (uni_cnt + add_k) / (uni_cnt.sum() + add_k * V)
        self.lambdas = dict(zip((1, 2, 3, 4), lambdas))

        # Words we never suggest: special tokens and single characters.
        self.allowed = np.array([len(w) > 1 for w in self.id2w])
        self.allowed[[UNK, BOS, EOS]] = False

        # Unigram backoff candidates: only the 100 most frequent allowed words.
        # (A word that never followed any of the contexts only gets the l1*P1 term,
        # so only very frequent words can reach the top 5 that way.)
        ranked = np.argsort(-uni_cnt)
        self.top_unigrams = ranked[self.allowed[ranked]][:100]

    def continuations(self, n, context):
        """Return (ctx_total, word_ids, counts) for an (n-1)-word context, or None if unseen."""
        t = self.tables[n]
        key = np.uint64(pack(context))  # same dtype as ctx_keys, so numpy doesn't convert the array
        i = np.searchsorted(t["ctx_keys"], key)
        if i == len(t["ctx_keys"]) or t["ctx_keys"][i] != key:
            return None
        a, b = t["offsets"][i], t["offsets"][i + 1]
        return int(t["ctx_tot"][i]), np.asarray(t["next_ids"][a:b]), np.asarray(t["next_cnt"][a:b])

    def suggest_ids(self, history, k=5):
        """Top-k next words for a list of word ids (padded with <s> at the start).

        Returns a list of (word_id, probability, order) where `order` is the
        highest n-gram order in which the word was seen after this history.
        """
        history = [BOS] * 3 + list(history)
        score = self.lambdas[1] * self.p1           # every word starts with l1*P1(w)
        is_candidate = np.zeros(len(score), dtype=bool)
        is_candidate[self.top_unigrams] = True
        order = np.ones(len(score), dtype=np.int8)

        for n in ORDERS:                            # bigram, trigram, 4-gram
            found = self.continuations(n, history[-(n - 1):])
            if found is None:                       # unseen context: this order adds 0
                continue
            total, ids, counts = found
            score[ids] += self.lambdas[n] * counts / total
            is_candidate[ids] = True
            order[ids] = n                          # higher orders overwrite lower ones

        score[~(is_candidate & self.allowed)] = 0.0
        top = np.argpartition(-score, k)[:k]
        top = top[np.argsort(-score[top])]
        return [(int(w), float(score[w]), int(order[w])) for w in top if score[w] > 0]
