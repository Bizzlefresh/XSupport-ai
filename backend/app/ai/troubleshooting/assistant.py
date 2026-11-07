"""Troubleshooting assistant: assembles a cited, extractive suggestion from retrieved evidence.

No text is generated. Every step shown is copied from an approved knowledge article and carries that article's id, so a
technician can check it. When the best article does not clear the validated similarity threshold, the assistant says
there is not enough evidence and shows no steps. Ticket text is used only as a retrieval query, never as instructions.
"""
from dataclasses import dataclass, field

ASSISTANT_VERSION = "extractive-v1"
MAX_ARTICLES = 2
MAX_PAST_RESOLUTIONS = 3

# Generic fact-finding prompts, shown only when evidence is insufficient. Not derived from any model.
GENERIC_QUESTIONS = [
    "What exactly happens, and is there an error message? Ask for the exact text or a screenshot.",
    "When did it start, and did anything change just before (update, move, new device, password change)?",
    "Is it one person or several, and is it one location or everywhere?",
    "What has already been tried, and did it change anything?",
]


@dataclass
class ArticleEvidence:
    article_id: int
    title: str
    score: float
    confidence: str  # strong | weak | unvalidated
    category: str | None
    steps: list[str]
    escalation: str | None
    source_type: str


@dataclass
class PastResolution:
    ticket_id: int
    external_id: str | None
    title: str
    score: float
    resolution_summary: str


@dataclass
class Suggestion:
    status: str  # grounded | unvalidated | insufficient_evidence | no_evidence
    articles: list[ArticleEvidence] = field(default_factory=list)
    past_resolutions: list[PastResolution] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def decide(candidates: list[ArticleEvidence], past: list[PastResolution], threshold: float | None) -> Suggestion:
    """candidates are ranked best-first. `threshold` is the validated weak-match threshold (None = not validated)."""
    if not candidates:
        return Suggestion("no_evidence", questions=GENERIC_QUESTIONS,
                          notes=["There are no approved knowledge articles to draw on."])
    top = candidates[0]
    seen: set[str] = set()
    unique_past = []
    for p in past:  # identical resolution text from different tickets is shown once
        key = " ".join(p.resolution_summary.lower().split())
        if key not in seen:
            seen.add(key)
            unique_past.append(p)
    past = unique_past[:MAX_PAST_RESOLUTIONS]

    if threshold is not None and top.score < threshold:
        closest = [ArticleEvidence(a.article_id, a.title, a.score, "weak", a.category, [], None, a.source_type)
                   for a in candidates[:MAX_ARTICLES]]
        return Suggestion("insufficient_evidence", articles=closest, past_resolutions=past, questions=GENERIC_QUESTIONS,
                          notes=["No knowledge article matched this ticket well enough to suggest steps. The closest "
                                 "articles are listed without steps; they may not apply.",
                                 "Past resolutions below are ranked by text similarity only and are not validated."])
    chosen = [a for a in candidates[:MAX_ARTICLES] if threshold is None or a.score >= threshold]
    notes = ["Steps are copied from the cited articles. Check that they fit this ticket before using them.",
             "Past resolutions are ranked by text similarity only; no similarity threshold has been validated for them."]
    status = "grounded"
    if threshold is None:
        status = "unvalidated"
        notes.insert(0, "No validated relevance threshold exists for the embedding model in use, so these matches cannot be "
                        "called strong or weak. Treat them with extra caution.")
    return Suggestion(status, articles=chosen, past_resolutions=past, notes=notes)
