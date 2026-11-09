# Demo script (about 10 minutes, synthetic data only)

Start: `docker compose up --build`, then `docker compose exec backend python ../scripts/seed_database.py`.
Sign in with a seeded admin account (see README).

1. **Tickets** – open the list, filter by status and category. Everything shown is synthetic.
2. **Ticket detail** – open one ticket. Show the category prediction with its confidence and
   explanation, kept separate from the original ticket text. Accept or override it.
3. **Troubleshooting assistant** – on the same page, show the cited approved articles and steps.
   Open a vague ticket to show it declining below the threshold and asking generic questions.
4. **Related articles / similar incidents** – show scores; note incident similarity has no validated threshold.
5. **Knowledge base** – create a draft article, then approve it as an admin.
6. **Analytics** – category volumes, resolution times, incident-burst alerts (5 tickets per category in 3 hours).
7. **Evaluation** – show measured results. State plainly: synthetic data, so no real-world accuracy claim.
8. **Settings** – TeamDynamix shows "not configured". Explain it is optional, off by default and read-only.

Talking points: AI output never overwrites ticket data; ticket text is treated as untrusted; the app works with no external AI service.
