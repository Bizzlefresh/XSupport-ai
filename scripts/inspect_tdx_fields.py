"""Check, on YOUR machine, whether TeamDynamix answers match what XSupport's adapter expects.

It prints only field NAMES and value TYPES, never ticket contents, so nothing sensitive is shown or stored.
It sends at most 3 read-only requests: one search (1 ticket), one ticket fetch, one status list.
Needs the same settings as the app (TEAMDYNAMIX_BASE_URL, TEAMDYNAMIX_APP_ID, TEAMDYNAMIX_TOKEN) in your environment or .env.
Run from the repo root:   python scripts/inspect_tdx_fields.py
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.integrations.errors import IntegrationError  # noqa: E402
from app.integrations.teamdynamix import TeamDynamixProvider, _items  # noqa: E402

EXPECTED_TICKET = ["ID", "Title", "Description", "StatusName", "PriorityName", "CreatedDate", "ModifiedDate",
                   "CompletedDate"]
OPTIONAL_PEOPLE = ["RequestorName", "ResponsibleFullName"]


def shape(obj) -> dict:
    return {k: type(v).__name__ for k, v in sorted(obj.items())}


def inspect(p: TeamDynamixProvider) -> list[str]:
    out = []
    try:
        page = p._request("POST", f"/api/{p._app}/tickets/search/paged", json={"PageIndex": 0, "PageSize": 1})
    except IntegrationError as e:
        return [f"Paged search FAILED: {e}", "-> Open the swagger page, find the paged ticket search, and note the exact request body it expects."]
    kind = "a list" if isinstance(page, list) else f"an object with keys {sorted(page)}" if isinstance(page, dict) else type(page).__name__
    items = _items(page)
    out.append(f"Paged search worked. The reply is {kind}; it held {len(items)} ticket(s).")
    if not items:
        out.append("-> No tickets returned (empty result, or the search needs different criteria). Try a ticket id from the web interface.")
        return out
    tid = items[0].get("ID")
    try:
        one = p._request("GET", f"/api/{p._app}/tickets/{int(tid)}")
    except (IntegrationError, TypeError, ValueError) as e:
        return out + [f"Fetching one ticket FAILED: {e}"]
    if not isinstance(one, dict):
        return out + ["Ticket fetch did not return an object."]
    out.append(f"A ticket has {len(one)} fields. Names and types: {shape(one)}")
    missing = [f for f in EXPECTED_TICKET if f not in one]
    if "ServiceName" not in one and "TypeName" not in one:
        missing.append("ServiceName or TypeName (category)")
    out.append("Expected fields all present." if not missing else f"MISSING expected fields: {missing}")
    if missing:
        out.append("-> Look in the list above for the real names (for example 'Subject' instead of 'Title') and tell your assistant.")
    out.append(f"People fields present: {[f for f in OPTIONAL_PEOPLE if f in one]} (only used if TEAMDYNAMIX_INCLUDE_PEOPLE=true)")
    try:
        names = p.list_statuses()
        out.append(f"Status list worked: {len(names)} statuses. Status NAMES are configuration, not tickets: {names}")
    except IntegrationError as e:
        out.append(f"Status list FAILED: {e}")
    return out


if __name__ == "__main__":
    env = {}
    envfile = ROOT / ".env"
    if envfile.exists():
        for ln in envfile.read_text().splitlines():
            if "=" in ln and not ln.lstrip().startswith("#"):
                k, v = ln.split("=", 1)
                env[k.strip()] = v.strip()
    g = lambda k: os.environ.get(k) or env.get(k, "")  # noqa: E731
    try:
        prov = TeamDynamixProvider(g("TEAMDYNAMIX_BASE_URL"), g("TEAMDYNAMIX_APP_ID"), g("TEAMDYNAMIX_TOKEN"))
    except IntegrationError as e:
        sys.exit(f"Configuration problem: {e}")
    print("\n".join(inspect(prov)))
