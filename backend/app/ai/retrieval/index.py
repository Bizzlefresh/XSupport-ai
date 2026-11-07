"""In-process retrieval index over knowledge articles and tickets.

Two scorers over the same documents so they can be compared fairly:
- lexical: TF-IDF (word 1-2 grams) cosine similarity - the keyword baseline
- semantic: embedding cosine similarity (sentence-transformers when available, otherwise LSA)
- hybrid: simple average of the two cosine scores
The corpus is small, so brute-force cosine similarity is exact and fast. (pgvector is the documented scale-up path.)
Document text is untrusted: it is only vectorised, never executed or used to choose an action.
"""
import time
from dataclasses import dataclass, field

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

METHODS = ("lexical", "semantic", "hybrid")


@dataclass
class Doc:
    key: str          # unique within the index, e.g. "article:3" or "ticket:17"
    kind: str         # "article" | "ticket"
    ref_id: int
    text: str
    meta: dict = field(default_factory=dict)


@dataclass
class Hit:
    doc: Doc
    score: float
    method: str


class RetrievalIndex:
    def __init__(self, docs: list[Doc], embedder, fit_texts: list[str] | None = None):
        if not docs:
            raise ValueError("cannot build an index with no documents")
        self.docs = docs
        self.embedder = embedder
        texts = [d.text for d in docs]
        self._tfidf = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        self._tfidf.fit(fit_texts or texts)
        self._lex = self._tfidf.transform(texts)
        embedder.fit(fit_texts or texts)
        self._emb = embedder.encode(texts)
        self._kinds = np.array([d.kind for d in docs])

    @property
    def embedder_name(self) -> str:
        return self.embedder.name

    def scores(self, query: str, method: str) -> np.ndarray:
        if method not in METHODS:
            raise ValueError(f"unknown method '{method}'")
        lex = sem = None
        if method in ("lexical", "hybrid"):
            lex = (self._lex @ self._tfidf.transform([query]).T).toarray().ravel()
        if method in ("semantic", "hybrid"):
            sem = self._emb @ self.embedder.encode([query])[0]
        if method == "lexical":
            return lex
        if method == "semantic":
            return sem
        return (lex + sem) / 2

    def search(self, query: str, method: str = "hybrid", kind: str | None = None, k: int = 5,
               exclude_keys: set[str] | None = None, min_score: float = -1.0) -> list[Hit]:
        s = self.scores(query, method).copy()
        if kind:
            s[self._kinds != kind] = -np.inf
        if exclude_keys:
            for i, d in enumerate(self.docs):
                if d.key in exclude_keys:
                    s[i] = -np.inf
        order = np.argsort(-s, kind="stable")[:k]
        return [Hit(self.docs[i], float(s[i]), method) for i in order if np.isfinite(s[i]) and s[i] > min_score]

    def timed_search(self, *args, **kw) -> tuple[list[Hit], float]:
        t = time.perf_counter()
        hits = self.search(*args, **kw)
        return hits, (time.perf_counter() - t) * 1000
