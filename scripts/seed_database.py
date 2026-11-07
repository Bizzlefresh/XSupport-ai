"""Seed categories, demo users and synthetic tickets (idempotent).

Passwords come from SEED_ADMIN_PASSWORD / SEED_TECH_PASSWORD; if unset, a random password is
generated and printed once. The extra synthetic technicians get random, never-shown passwords
(they exist only so tickets can be assigned to different people).
Run from the backend directory:  python ../scripts/seed_database.py
"""
import json
import os
import secrets
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import ArticleStatus, Category, KnowledgeArticle, Role, Ticket, TicketActivity, User  # noqa: E402

TICKETS_FILE = ROOT / "data" / "synthetic" / "tickets.json"
ARTICLES_FILE = ROOT / "data" / "knowledge" / "articles.json"
CATEGORIES = [
    ("Network and Connectivity", "Wi-Fi, VPN, wired network, and connectivity problems"),
    ("Account and Authentication", "Locked accounts, password resets, MFA, login failures"),
    ("Software and Applications", "Installs, licensing, application errors"),
    ("Hardware and Devices", "Laptops, printers, lab workstations, peripherals"),
    ("Email and Collaboration", "Email, calendars, Microsoft 365, Teams"),
    ("Classroom and AV Support", "Projectors, classroom audio/video, lecture capture"),
    ("Security-Related Issues", "Phishing, suspected compromise, security incidents"),
    ("General IT Support", "Requests that fit no other category"),
]
SYNTHETIC_TECHS = {
    "tech1": ("jordan.lee@xsupport.example.com", "Jordan Lee"),
    "tech2": ("priya.nair@xsupport.example.com", "Priya Nair"),
    "tech3": ("marcus.webb@xsupport.example.com", "Marcus Webb"),
    "tech4": ("sofia.alvarez@xsupport.example.com", "Sofia Alvarez"),
}
DEMO_TECH_EMAIL = "tech@xsupport.example.com"


def seed_users(db: Session) -> None:
    demo = [
        ("admin@xsupport.example.com", "Demo Administrator", Role.admin, "SEED_ADMIN_PASSWORD"),
        (DEMO_TECH_EMAIL, "Demo Technician", Role.technician, "SEED_TECH_PASSWORD"),
    ]
    for email, full_name, role, env_var in demo:
        if db.scalar(select(User).where(User.email == email)):
            continue
        given = os.environ.get(env_var)
        password = given or secrets.token_urlsafe(12)
        db.add(User(email=email, full_name=full_name, role=role, hashed_password=hash_password(password)))
        print(f"Created {role.value} {email}" + (" (password from env)" if given else f" password={password}  <- save it now"))
    for email, name in SYNTHETIC_TECHS.values():
        if not db.scalar(select(User).where(User.email == email)):
            db.add(User(email=email, full_name=name, role=Role.technician,
                        hashed_password=hash_password(secrets.token_urlsafe(24))))
    db.flush()


def seed_tickets(db: Session) -> int:
    if not TICKETS_FILE.exists():
        print(f"No {TICKETS_FILE}; run scripts/generate_tickets.py first. Skipping tickets.")
        return 0
    if db.scalar(select(Ticket.id).where(Ticket.source == "synthetic", Ticket.external_id.like("SYN-%")).limit(1)):
        print("Synthetic tickets already present; skipping.")
        return 0
    cats = {c.name: c.id for c in db.scalars(select(Category))}
    users = {u.email: u for u in db.scalars(select(User))}
    key_to_user = {"tech0": users[DEMO_TECH_EMAIL]} | {k: users[e] for k, (e, _) in SYNTHETIC_TECHS.items()}
    n = 0
    for r in json.loads(TICKETS_FILE.read_text(encoding="utf-8"))["tickets"]:
        created = datetime.fromisoformat(r["created_at"])
        resolved = datetime.fromisoformat(r["resolved_at"]) if r["resolved_at"] else None
        who = key_to_user.get(r["assignee_key"]) if r["assignee_key"] else None
        t = Ticket(
            source="synthetic", external_id=r["external_id"], subject=r["subject"], description=r["description"],
            category_id=cats[r["category"]], priority=r["priority"], status=r["status"],
            assignee_id=who.id if who else None, created_at=created, updated_at=resolved or created,
            resolved_at=resolved, resolution_summary=r["resolution_summary"])
        t.activities.append(TicketActivity(kind="created", detail="Ticket created", created_at=created))
        if who:
            t.activities.append(TicketActivity(kind="assignee", detail=f"Assigned nobody -> {who.full_name}",
                                               user_id=who.id, created_at=created))
        if r["status"] != "new":
            t.activities.append(TicketActivity(kind="status", detail=f"Status new -> {r['status']}",
                                               user_id=who.id if who else None, created_at=resolved or created))
        db.add(t)
        n += 1
    return n


def seed_articles(db: Session) -> int:
    """Original sample articles (clearly labelled as such). Idempotent by slug."""
    if not ARTICLES_FILE.exists():
        return 0
    cats = {c.name: c.id for c in db.scalars(select(Category))}
    admin = db.scalar(select(User).where(User.email == "admin@xsupport.example.com"))
    existing = set(db.scalars(select(KnowledgeArticle.slug)))
    n = 0
    for a in json.loads(ARTICLES_FILE.read_text(encoding="utf-8"))["articles"]:
        if a["slug"] in existing:
            continue
        db.add(KnowledgeArticle(
            slug=a["slug"], title=a["title"], category_id=cats[a["category"]], problem_description=a["problem_description"],
            steps=a["steps"], escalation=a["escalation"], tags=a["tags"], source_type=a["source_type"],
            source_note=a["source_note"], status=ArticleStatus(a["status"]),
            created_by=admin.id if admin else None, updated_by=admin.id if admin else None))
        n += 1
    return n


def main() -> None:
    with SessionLocal() as db:
        for name, desc in CATEGORIES:
            if not db.scalar(select(Category).where(Category.name == name)):
                db.add(Category(name=name, description=desc))
        db.flush()
        seed_users(db)
        count = seed_tickets(db)
        arts = seed_articles(db)
        db.commit()
        if count:
            print(f"Loaded {count} synthetic tickets.")
        if arts:
            print(f"Loaded {arts} original sample knowledge articles.")
    print("Seed complete.")


if __name__ == "__main__":
    main()
