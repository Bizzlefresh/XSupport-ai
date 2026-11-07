def build_text(subject: str, description: str) -> str:
    """Model input: subject (repeated once for weight) plus description.

    Ticket text is untrusted. It is only ever tokenised and vectorised here; it is never
    executed, templated into prompts, or used to choose an action.
    """
    return f"{subject.strip()}. {subject.strip()}. {description.strip()}"
