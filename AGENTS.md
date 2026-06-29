# Notes for an AI assistant picking this up

This project is worked on by more than one person. Before making any change in a new session:

1. Run `git pull` to get the latest.
2. Run `git log --oneline -20` and `git diff` against your last known point to see what teammates changed since you were last here.
3. Read this file and `README.md` so you don't undo someone's work.

## Ground rules

- `index.html` is the single source of truth. Everything (data, model, UI) lives there. Don't reintroduce a separate data file or a duplicate copy.
- All displayed data must be real. If real data isn't available for something (for example live per-match stats or injuries), show a clear "not available yet" state rather than inventing numbers.
- The forecast model is a transparent heuristic (Elo + form + squad + host). Keep it explainable; if you change the weighting, note it in the commit message and in `README.md`.

## Deploy

Pushing to `main` auto-deploys to Vercel. Don't deploy with a personal token; let the Git integration handle it.

## Common task: refresh the data

Update `GROUPS`, `RATINGS`, `REAL_R32`, `REAL_RESULTS` in `index.html` from the sources listed in `README.md`, verify the page still renders, commit with a clear message, and push.
