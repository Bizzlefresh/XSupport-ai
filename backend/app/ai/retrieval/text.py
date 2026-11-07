from app.ai.classification.text import build_text


def ticket_doc_text(subject: str, description: str) -> str:
    return build_text(subject, description)


def article_doc_text(title: str, problem: str, steps: list[str], tags: list[str]) -> str:
    # Title repeated once for weight, mirroring ticket text; tags help lexical and semantic matching.
    return f"{title}. {title}. {problem} {' '.join(steps)} {' '.join(tags)}"
