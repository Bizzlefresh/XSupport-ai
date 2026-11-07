import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import generate_tickets as g  # noqa: E402


def test_reproducible_and_seed_sensitive():
    assert g.generate(42) == g.generate(42)
    assert g.generate(42) != g.generate(7)


def test_size_and_all_categories_present():
    d = g.generate(42)
    assert 300 <= d["meta"]["count"] <= 500
    assert len(d["meta"]["category_counts"]) == 8


def test_primary_split_never_shares_a_phrasing_template_or_family_between_val_and_test():
    d = g.generate(42)
    tmpl, ev_family = defaultdict(set), defaultdict(set)
    for t in d["tickets"]:
        tmpl[t["template_id"]].add(t["split"])
        if t["split"] in ("validation", "test"):
            ev_family[t["family_id"]].add(t["split"])
    assert all(len(v) == 1 for v in tmpl.values())  # near-duplicates cannot straddle splits
    assert all(len(v) == 1 for v in ev_family.values())  # validation and test never share a problem type


def test_stress_split_never_shares_a_family_and_every_category_is_in_every_split():
    d = g.generate(42)
    fam, cat_primary, cat_stress = defaultdict(set), defaultdict(set), defaultdict(set)
    for t in d["tickets"]:
        fam[t["family_id"]].add(t["split_novel"])
        cat_primary[t["category"]].add(t["split"])
        cat_stress[t["category"]].add(t["split_novel"])
    assert all(len(v) == 1 for v in fam.values())
    full = {"train", "validation", "test"}
    assert all(v == full for v in cat_primary.values()) and all(v == full for v in cat_stress.values())


def test_subject_and_description_come_from_the_same_template():
    from ticket_scenarios import FAMILIES  # noqa: PLC0415
    assert all(len(f["subjects"]) == len(f["descriptions"]) == 2 for f in FAMILIES)


def test_not_a_few_templates():
    d = g.generate(42)
    assert len({t["description"] for t in d["tickets"]}) > 250


def test_resolution_fields_consistent_except_deliberate_flaws():
    d = g.generate(42)
    for t in d["tickets"]:
        if t["status"] in ("new", "open", "pending"):
            assert t["resolved_at"] is None and t["resolution_summary"] is None
        if t["resolved_at"]:
            assert t["resolved_at"] >= t["created_at"]
