"""Builds (and caches) the in-process retrieval index from the database and answers queries."""
import json
import threading
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.retrieval.embeddings import make_embedder
from app.ai.retrieval.index import Doc, RetrievalIndex
from app.ai.retrieval.text import article_doc_text, ticket_doc_text
from app.core.config import get_settings
from app.models import ArticleStatus, KnowledgeArticle, Ticket
from app.schemas.retrieval import ArticleHitOut, ArticleHitsOut, RetrievalMeta, RetrievalRequest, SimilarTicketOut, SimilarTicketsOut

REPORT = Path(__file__).resolve().parents[3] / "data" / "evaluation" / "retrieval_report.json"
SUMMARY_CHARS = 240
# One cache entry and one lock per index. Ticket writes change only the ticket index's version, so article search
# neither rebuilds nor waits while the ticket index is rebuilt (and vice versa).
_locks = {"article": threading.Lock(), "ticket": threading.Lock()}
_cache: dict[str, tuple] = {}


def _version(db: Session, kind: str) -> tuple:
    if kind == "article":
        row = db.execute(select(func.count(), func.max(KnowledgeArticle.updated_at))
                         .where(KnowledgeArticle.status == ArticleStatus.approved)).one()
    else:
        row = db.execute(select(func.count(), func.max(Ticket.updated_at))).one()
    s = get_settings()
    return (tuple(map(str, row)), s.embedding_provider, s.embedding_model)


def reset_cache() -> None:
    with _locks["article"], _locks["ticket"]:
        _cache.clear()


def _docs(db: Session, kind: str) -> list[Doc]:
    if kind == "article":
        return [Doc(f"article:{a.id}", "article", a.id, article_doc_text(a.title, a.problem_description, a.steps, a.tags),
                    {"title": a.title, "category": a.category.name if a.category else None,
                     "snippet": a.problem_description[:SUMMARY_CHARS], "source_type": a.source_type})
                for a in db.scalars(select(KnowledgeArticle).where(KnowledgeArticle.status == ArticleStatus.approved)).unique()]
    return [Doc(f"ticket:{t.id}", "ticket", t.id, ticket_doc_text(t.subject, t.description),
                {"title": t.subject, "external_id": t.external_id, "status": t.status.value,
                 "category": (t.category.name if t.category else None),
                 "resolution_summary": (t.resolution_summary or "")[:SUMMARY_CHARS] or None})
            for t in db.scalars(select(Ticket)).unique()]


def _build(db: Session, kind: str):
    """Articles and tickets get separate indexes, because the article threshold was validated on an article-only
    index (see evaluate_retrieval.py). Returns (index, note) or None when there is nothing to index."""
    docs = _docs(db, kind)
    if not docs:
        return None
    s = get_settings()
    embedder, note = make_embedder(s.embedding_provider, s.embedding_model)
    return RetrievalIndex(docs, embedder), note


def get_index(db: Session, kind: str):
    ver = _version(db, kind)
    with _locks[kind]:
        entry = _cache.get(kind)
        if entry is None or entry[0] != ver:
            entry = (ver, _build(db, kind))
            _cache[kind] = entry
        return entry[1]


def _article_threshold(embedder_name: str, method: str) -> float | None:
    """Use the evaluation threshold only if it was validated with the same kind of embedder that is running now."""
    if not REPORT.exists():
        return None
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    if rep.get("embedding", {}).get("used") != embedder_name:
        return None
    return rep.get("thresholds", {}).get("articles", {}).get(method)


def _query(db: Session, req: RetrievalRequest) -> tuple[str, set[str]]:
    if req.ticket_id is not None:
        t = db.get(Ticket, req.ticket_id)
        if t is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
        return ticket_doc_text(t.subject, t.description), {f"ticket:{t.id}"}
    return ticket_doc_text(req.subject or "", req.description or ""), set()


def _run(db: Session, req: RetrievalRequest, kind: str):
    text, exclude = _query(db, req)
    built = get_index(db, kind)
    if built is None:
        return None, None, []
    index, note = built
    hits, ms = index.timed_search(text, req.method, kind, req.limit, exclude_keys=exclude)
    return index, (note, ms), hits


def similar_tickets(db: Session, req: RetrievalRequest) -> SimilarTicketsOut:
    index, info, hits = _run(db, req, "ticket")
    name = index.embedder_name if index else "none"
    meta = RetrievalMeta(method=req.method, embedder=name, threshold=None, latency_ms=round(info[1], 2) if info else 0.0,
                         note="No similarity threshold has been validated for incident retrieval; scores are for ranking only."
                         + (f" {info[0]}" if info and info[0] else ""))
    return SimilarTicketsOut(meta=meta, results=[
        SimilarTicketOut(ticket_id=h.doc.ref_id, external_id=h.doc.meta["external_id"], title=h.doc.meta["title"],
                         score=round(h.score, 4), category=h.doc.meta["category"], status=h.doc.meta["status"],
                         resolution_summary=h.doc.meta["resolution_summary"]) for h in hits])


def related_articles(db: Session, req: RetrievalRequest) -> ArticleHitsOut:
    index, info, hits = _run(db, req, "article")
    name = index.embedder_name if index else "none"
    thr = _article_threshold(name, req.method) if index else None
    meta = RetrievalMeta(method=req.method, embedder=name, threshold=thr, latency_ms=round(info[1], 2) if info else 0.0,
                         note=(info[0] if info and info[0] else None) or
                         (None if thr is not None else "No validated threshold for this embedder; relevance is unvalidated."))

    def conf(score: float) -> str:
        return "unvalidated" if thr is None else ("strong" if score >= thr else "weak")

    return ArticleHitsOut(meta=meta, results=[
        ArticleHitOut(article_id=h.doc.ref_id, title=h.doc.meta["title"], score=round(h.score, 4), category=h.doc.meta["category"],
                      snippet=h.doc.meta["snippet"], source_type=h.doc.meta["source_type"], confidence=conf(h.score))
        for h in hits])


def search_articles(db: Session, q: str, method: str, limit: int) -> ArticleHitsOut:
    return related_articles(db, RetrievalRequest(subject=q, method=method, limit=limit))
