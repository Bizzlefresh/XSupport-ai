"""Seed default categories and demo users (idempotent).

Passwords come from SEED_ADMIN_PASSWORD / SEED_TECH_PASSWORD. If unset, a random password
is generated and printed once. Run from the backend directory:  python ../scripts/seed_database.py
"""
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import Category, Role, User  # noqa: E402

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


def main() -> None:
    users = [
        ("admin@xsupport.example.com", "Demo Administrator", Role.admin, "SEED_ADMIN_PASSWORD"),
        ("tech@xsupport.example.com", "Demo Technician", Role.technician, "SEED_TECH_PASSWORD"),
    ]
    with SessionLocal() as db:
        for name, desc in CATEGORIES:
            if not db.scalar(select(Category).where(Category.name == name)):
                db.add(Category(name=name, description=desc))
        for email, full_name, role, env_var in users:
            if db.scalar(select(User).where(User.email == email)):
                continue
            password = os.environ.get(env_var) or secrets.token_urlsafe(12)
            db.add(User(email=email, full_name=full_name, role=role,
                        hashed_password=hash_password(password)))
            note = "(from env)" if os.environ.get(env_var) else "(generated - save it now)"
            print(f"Created {role.value} {email} {note}" + ("" if os.environ.get(env_var) else f" password={password}"))
        db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    main()
