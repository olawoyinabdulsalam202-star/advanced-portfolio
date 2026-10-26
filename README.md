# Abdulsalam’s portfolio — version 3

A React portfolio, Node/Express API and private Supabase-backed studio.

## Start here

1. Install Node.js 22 or newer.
2. Open a terminal inside this `portfolio` folder.
3. Keep your supplied `.env` in this folder. It is already included in this private handoff.
4. Run:

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000 for the portfolio and http://localhost:3000/admin for the studio. If your `PORT` environment variable is different, use that port instead.

Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env`. The admin has no hard-coded default password. Do not double-click `index.html` or use a static-only Live Server: the admin and forms need the Node server.

## One-time database setup

Open the SQL editor for the Supabase project named in your `.env`, paste the contents of `supabase/schema.sql`, and run it. The script uses `CREATE TABLE IF NOT EXISTS`; it preserves existing projects, comments and messages, and adds `portfolio_profile` for editable personal details.

Then run:

```sh
npm run check:db
```

All four tables and the image bucket should report OK. The default bucket is `project-images`. If you changed `SUPABASE_BUCKET`, create that public bucket too or set the variable back to `project-images`.

The Supabase service-role key stays on the Node server. Browser clients do not need an anonymous key or public database write policies. Keep `.env` private and out of source control. The supplied `.gitignore` excludes it.

**Verification limit:** your actual Supabase endpoint timed out in the build environment. No migration was run and no records were changed in your live database. The complete admin flows were verified against an isolated local database test double, not your live Supabase project. The SQL setup and `check:db` above complete that connection check in your environment.

## Add projects without editing code

1. Sign in at `/admin`.
2. Choose **Add project**.
3. Add a title, category, project story and comma-separated technologies.
4. Add your live demo and repository links where available.
5. Upload a cover (PNG, JPEG, WebP or GIF, up to 5 MB), or paste an image URL.
6. Select **Feature this project** if it should appear first.
7. Save. New page loads of the public portfolio use the saved database record.

For strong project stories, describe the problem, your contribution, the implementation and results you can substantiate. Paragraph breaks are preserved in the detail view. Do not add invented usage numbers or outcomes.

If a cover upload fails after the text is saved, the editor tells you. Fix the image or retry the save: it updates the same project rather than creating a duplicate. The project remains published with its saved text.

Use the **Projects** tab to edit, feature, delete, search, or export records as JSON. JSON import accepts up to 100 records and skips titles already present; it does not overwrite existing projects. If an import stops on an error, successfully imported rows remain; retrying skips those titles.

### Bring the existing twelve projects across

Your original project descriptions are preserved in `src/projects.json`. In **Setup**, choose **Import original projects** once. Existing titles are skipped, so this can safely be retried. Live URLs were not invented; add your real links and screenshots in the editor.

The public site displays that original index only if the database cannot be reached. A reachable database is authoritative, including an intentionally empty project list. No fallback records are silently written to Supabase.

## Everything else in the studio

- **Profile:** edit the brand/monogram, name, role, location, contact email, GitHub link, availability, biography, principle and four games.
- **Inbox:** read website inquiries, mark them read/unread, and reply using your email application. The contact form stores messages in Supabase; it does not send an email notification.
- **Guestbook:** approve or hide visitor notes before they appear publicly.
- **Setup:** check database connectivity and import the original project index.

Your initial mark is `AO`; no abstract brand name was assumed. Change it in Profile when you choose a name.

The included portrait is the image from your original ZIP. Replace `public/portrait.png` to change the portrait. Static capability wording and section headings live in `src/main.jsx`; those are not editable through the CMS.

## Design and interaction

- Custom animated orbital sculpture responding to the pointer.
- Large editorial typography, dark olive surfaces and acid-lime accents.
- Searchable and filterable projects with detail dialogs.
- Featured projects first; remaining projects ordered by creation date.
- Conceptual project illustrations when no screenshot is available. They are explicitly labelled “system sketch.”
- Games in your requested order: Free Fire, Need for Speed, Lagos Life, Blood Strike.
- Mobile navigation, keyboard-accessible dialogs and game tabs, visible focus states, reduced-motion support, and a motion toggle.
- Self-hosted variable fonts with licenses included.
- Print styles for a readable portfolio summary.
- A portfolio assistant that uses the optional AI provider already configured in your environment. When the provider is unavailable, it answers common questions from portfolio data.

## Deploy to a Node host

This is a Node application, not just a static site. Use a service that runs Node 22+.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Supply the environment variables from `.env` through the host’s environment settings.
- Set `NODE_ENV=production` for HTTPS production hosting.
- Set `SITE_URL` to the final HTTPS origin.
- Set `TRUST_PROXY=1` when the host uses one trusted reverse proxy, such as a typical managed Node hosting service. Adjust the code if your proxy topology differs.
- Keep the Supabase URL, service-role key, bucket name, admin credentials and JWT secret server-side.

A `vercel.json` is included for the original project’s Node-function style deployment. The prebuilt public assets are included. If deploying with that configuration after editing the UI, run `npm run build` before deployment; the legacy `builds` configuration uses the included assets. Deployment to a live host has not been performed or verified in this handoff.

Only `public/` is served as static content. Backend source, `.env`, dependency manifests and test files return 404 over HTTP.

## Checks

```sh
npm run build
npm test
npm run check:db
```

The included 14 API tests cover authentication, authorization, cross-site writes, project CRUD, upload validation and cleanup, profile persistence, contact messages, moderation, error responses, and private-file protection. They use an in-memory database double and do not connect to your live database.

During development, desktop and 390px mobile browser checks also exercised navigation, search, project dialogs, game switching, admin sign-in, importing twelve projects, failed-upload retry without duplicate creation, profile editing, public contact submission, inbox state and comment approval. No page JavaScript errors or horizontal overflow were observed in those checked flows.

Preview images in `previews/` are screenshots of the local build, not proof of a live deployment.

## File map

```text
backend/app.js        Express API and admin authentication
server.js             Environment loading and Supabase connection
src/main.jsx          Public React portfolio
src/Admin.jsx         React admin studio
src/Orbit.jsx         Custom canvas sculpture
src/style.css         Public and admin styling
src/profile.json      Initial profile / graceful fallback
src/projects.json     Your original project index
public/               Public assets only
supabase/schema.sql   Non-destructive database setup
scripts/              Build and database checks
test/                 API integration tests
licenses/             Self-hosted font licenses
```

## Version 3.1 additions

### GitHub sync
Add these to `.env` (and your host settings):

- `GITHUB_TOKEN`: fine-grained token, all repositories, read access to Contents and Metadata.
- `GITHUB_USERNAME`: your GitHub username.
- `GITHUB_WEBHOOK_SECRET` (optional): for instant updates. On GitHub add a webhook to `https://YOUR-SITE/api/github/webhook`, JSON, event "Repositories".
- `CRON_SECRET` (optional): used by the daily Vercel cron at `/api/github/cron`.
- `GITHUB_ORGS`, `GITHUB_EXCLUDE`, `GITHUB_INCLUDE_FORKS=1` (all optional).

Run the updated `supabase/schema.sql` once. Then open Admin, Setup, and press Sync GitHub now.

- New repos become projects, with a Groq-written description, category, stack and image.
- Repos that match an existing project by name are linked, not duplicated.
- Private repos never show a source link. Public repos do.
- Add a live link manually in the editor; the image is captured from it automatically.
- "Delete" on a linked project hides it, so sync does not bring it back. Add the topic `no-portfolio` to a repo to skip it.

### Images and descriptions
Image order: repo screenshot file, live-site capture, README image, your upload. "Write with AI" in the editor drafts a description from the README. Setup has "Test Groq connection" and "Upgrade imported descriptions".

### Games
Admin, Profile: find art automatically or upload your own for each game.
