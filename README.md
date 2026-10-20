# AFTER TAKEOFF — Dana & Vlad · 4 September 2027 · Madison Park

Static site on GitHub Pages + a Google Sheet (Apps Script) for the guest list and RSVPs.

```
docs/index.html        ← the website GitHub Pages serves (built, do not edit by hand)
src/template.html      ← source: design, copy, CONFIG block, logic
apps-script/Code.gs    ← backend, pasted into the Google Sheet
build.mjs              ← node build.mjs [apps-script-url] → docs/index.html
data/                  ← fictional sample invitations, used only without a backend
```

## 1 · Google Sheet backend (≈10 min)
1. Create a new Google Sheet, e.g. "Dana & Vlad — Guests".
2. Extensions → Apps Script. Delete the sample code, paste all of `apps-script/Code.gs`, save.
3. Choose `setup` in the function dropdown → Run → allow access. This creates the
   **Invitations** and **RSVP** tabs.
4. Deploy → New deployment → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   → Deploy, copy the **Web app URL** (ends in `/exec`).
5. Open the URL in a browser: you should see `{"ok":true,"service":"after-takeoff"}`.

After any later change to Code.gs: Deploy → Manage deployments → edit → Version: New version.
The URL stays the same.

## 2 · Guest list (Invitations tab)
One row per household:

| Code | Display name | Short name | Greeting | Party size | Lookup names |
|---|---|---|---|---|---|
| (leave empty) | The Ceban Family | Familia Ceban | Ion & Natalia | 4 | Ion Ceban, Natalia Ceban |

- **Lookup names**: every name a guest might type to check in, comma-separated.
  Accents, capitals and surname-first order are handled automatically.
- Run `fillMissingCodes` to generate codes. Party size is the maximum number of seats.
- Delete the sample Popescu row before sending invitations.

## 3 · Build and publish on GitHub Pages
```
node build.mjs https://script.google.com/macros/s/XXXX/exec
```
1. github.com → New repository, e.g. `dana-vlad`, **Public** (free Pages needs public;
   no guest data is in the repo, it all stays in the Sheet).
2. Upload the project files (or `git push`).
3. Settings → Pages → Source: **Deploy from a branch** · Branch **main** · Folder **/docs** → Save.
4. After ~1 minute the site is at `https://<username>.github.io/dana-vlad/`.

## 4 · Personal invitation links (recommended)
In Code.gs set `SITE_URL` to your Pages address, then run `writeInviteLinks`.
Column G gets one link per household (`…/?invite=CODE`). A guest who opens their
link is checked in directly; everyone else can still check in with their name.

## Content changes
Edit `CONFIG` at the top of the script in `src/template.html`, run the build again, upload `docs/index.html`.

## Notes
- Anyone who types a guest's exact full name can see that household's pass and RSVP
  for it. Personal links make this a non-issue in practice.
- Failed check-ins are capped at 40 per minute across the whole site.
- The page asks search engines not to index it.
