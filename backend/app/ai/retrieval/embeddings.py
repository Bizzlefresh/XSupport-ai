"""Embedding providers. All run locally; nothing is sent to an external service.

- LsaEmbedder: TF-IDF + truncated SVD (latent semantic analysis) fitted on the indexed corpus. Always available.
- SentenceTransformerEmbedder: a pretrained sentence-embedding model. It needs the optional `embeddings` extra and a
  one-time model download, so it is only used when it loads successfully. `auto` falls back to LSA otherwise.
"""
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize


class EmbeddingUnavailable(RuntimeError):
    pass


class LsaEmbedder:
    name = "lsa"

    def __init__(self, dim: int = 100, seed: int = 42):
        self.dim, self.seed = dim, seed
        self._vec: TfidfVectorizer | None = None
        self._svd: TruncatedSVD | None = None

    def fit(self, texts: list[str]) -> "LsaEmbedder":
        self._vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1, stop_words="english")
        x = self._vec.fit_transform(texts)
        k = min(self.dim, x.shape[0] - 1, x.shape[1] - 1)
        if k < 2:  # corpus too small for a meaningful SVD: use the normalised TF-IDF vectors themselves
            self._svd = None
            return self
        self._svd = TruncatedSVD(n_components=k, random_state=self.seed)
        self._svd.fit(x)
        return self

    def encode(self, texts: list[str]) -> np.ndarray:
        assert self._vec is not None, "fit() first"
        x = self._vec.transform(texts)
        return normalize(x.toarray() if self._svd is None else self._svd.transform(x))


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str):
        try:
            from sentence_transformers import SentenceTransformer  # optional dependency
            self._model = SentenceTransformer(model_name)
        except Exception as exc:  # missing package, no network for the download, corrupt cache...
            raise EmbeddingUnavailable(f"sentence-transformers model '{model_name}' is not available: {exc}") from exc
        self.name = f"sentence-transformers:{model_name}"

    def fit(self, texts: list[str]) -> "SentenceTransformerEmbedder":
        return self  # pretrained: nothing to fit

    def encode(self, texts: list[str]) -> np.ndarray:
        return np.asarray(self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False))


def make_embedder(provider: str, model_name: str):
    """Return (embedder, note). `auto` tries sentence-transformers and falls back to LSA with an explanatory note."""
    if provider == "lsa":
        return LsaEmbedder(), None
    if provider == "sentence_transformers":
        return SentenceTransformerEmbedder(model_name), None  # raises EmbeddingUnavailable if it cannot load
    if provider == "auto":
        try:
            return SentenceTransformerEmbedder(model_name), None
        except EmbeddingUnavailable as exc:
            return LsaEmbedder(), str(exc)
    raise ValueError(f"unknown embedding provider '{provider}'")
