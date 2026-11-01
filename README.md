# AIC Egerton Chapel Website

Static multi-page site for AIC Egerton Chapel, hosted on Netlify. Contentful and Supabase provide cooperating editorial sources; Supabase also handles transactional data and authentication. Netlify Functions handle server-side forms, CMS reconciliation, feeds, sitemaps and optional payment operations. No frontend secret keys are used.

**Production URL:** <https://aicegertonchapel.netlify.app>

## Pages

`index.html`, `about.html`, `ministries.html`, `sermons.html`, `live.html`, `prayer-wall.html`, `contact.html`, `give.html`, `privacy.html`, `accessibility.html`, `admin.html`, and `404.html`.

## Architecture

```text
Static HTML/CSS/JS
  ├─ Content service: merges/deduplicates Contentful and Supabase editorial records
  │    ├─ Contentful Delivery API: primary editorial source
  │    ├─ Supabase CMS tables: native content, Contentful mirror, and media
  │    └─ local cache + build snapshot: fallback when a provider is unavailable
  ├─ Supabase: forms, payments, prayer moderation, CMS admin authentication
  └─ Netlify Functions: forms, CMS webhook/scheduled reconciliation, RSS, sitemap, health, M-Pesa callbacks/status
```

M-Pesa STK is **disabled by default**. Manual giving (Paybill 522522, account 7506439) remains available on [give.html](./give.html). Do not enable STK until the church confirms that its Daraja shortcode can receive payments for this account; a shared bank Paybill may not support the church's own STK application.

## Local development

Requirements: Node.js 20+, npm, Netlify CLI, and (for database work) Supabase CLI.

```powershell
npm install
npm run dev
```

To run and open the website locally:

1. Open a terminal in the project folder.
2. Install the project dependencies with `npm install` (first run only).
3. Start the development server with `npm run dev`.
4. Open `http://localhost:8888` in a browser. The home page is `http://localhost:8888/index.html`.
5. Press `Ctrl+C` in the terminal to stop the server.

The Netlify development server serves the website and its local functions at `http://localhost:8888`. Copy `.env.example` to `.env` and set only local/test credentials. The local Supabase config is in `supabase/config.toml`; start it with `supabase start` and apply migrations with `supabase db push`.

Build and run checks:

```powershell
npm run build
npm run lint
npm test
```

The build synchronizes shared header/footer markup, generates a content snapshot when public CMS settings are available, and validates internal links. Tests do not contact production services.

## Configuration

The full server-side variable list is in `.env.example`. Set production values in Netlify site environment variables, not in the repository.

| Integration | Required configuration |
|---|---|
| Site | `URL`, `ALLOWED_ORIGINS` |
| Supabase functions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; the anon key is public and should only be used with RLS |
| Contentful functions | `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENV`, `CONTENTFUL_DELIVERY_TOKEN` |
| CMS reconciliation | `CONTENTFUL_WEBHOOK_SECRET` in addition to the Contentful and Supabase function settings |
| Email | `EMAIL_PROVIDER` (`resend` or `brevo`), `EMAIL_API_KEY`, `EMAIL_FROM`, `CHURCH_EMAIL` |
| Spam protection | `TURNSTILE_SECRET_KEY`; put the matching public site key in root `site-config.js` |
| Daraja | `MPESA_STK_ENABLED=false` until verified; then configure all `DARAJA_*` values and Turnstile |
| YouTube | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`; configure the public channel ID in root `site-config.js` |
| Optional AI | `AI_TRIAGE_ENABLED=false`, `GEMINI_API_KEY`, `GEMINI_MODEL` |

Root `site-config.js` is the classic-script browser config consumed by existing pages. Its public Supabase/Contentful fields are intentionally empty until the owner supplies the project values. The ES module at `assets/js/site-config.js` exports the same browser configuration for module-based code. The local Supabase override is accepted only on localhost.

## Database and admin

Migrations live in `supabase/migrations/`; run `supabase db push` against the intended project after reviewing them. The database uses RLS. Public prayer submission is limited to display name, category and request text; payment, inquiry and application records are not publicly readable.

Admin users sign in with a Supabase magic link. Promote an existing invited account in the Supabase SQL Editor:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);
```

Restrict production sign-in to invited users in the hosted Supabase Auth settings. Do not grant public signup or expose the service-role key.

## Contentful and publishing

Contentful remains the primary editorial source. Public pages merge and deduplicate published records from Contentful and the `cms_*` Supabase tables, then use a time-limited browser cache or `/content-snapshot.json` if both sources fail. Contentful entries are mirrored into Supabase for fallback use; locally authored Supabase records remain independently editable. Premium sermon media is not exposed in public normalized content.

The admin dashboard supports Supabase-native CRUD, uploads to the `cms-media` bucket, hiding/restoring mirrored Contentful entries, sync history, and on-demand Contentful reconciliation. A scheduled reconciliation runs every six hours. Configure Contentful webhooks to POST published/unpublished entry events to `/.netlify/functions/cms-sync` with the `x-contentful-webhook-secret` header. The function only accepts a matching webhook secret or a verified Supabase admin session.

The browser values in root `site-config.js` must be populated with the public Supabase URL/anon key and Contentful space/environment/delivery token for live client-side requests. Configure the same provider values as Netlify environment variables so the build can produce a snapshot and server functions can reconcile content. Never place the Supabase service-role key or a Contentful management token in browser configuration.

## Forms and payments

Forms require Supabase service-role access, an email provider and Turnstile in production. When any required service is not configured, the function returns an error instead of reporting success. Prayer requests submitted for public display remain unapproved until moderation.

When enabled, M-Pesa uses `/api/mpesa-stkpush`, a secret-path callback and `/api/mpesa-status`. Only the callback can mark a checkout completed; a browser timeout is not a payment confirmation. The callback and status functions require the latest Supabase migrations. Reconciliation UI and premium access grants still require additional implementation/configuration.

## Deployment

Connect the repository to Netlify and configure the environment variables above. Netlify uses `netlify.toml` as the single header/redirect configuration, publishes the repository root, and runs Node 20 functions. Verify function routes and response headers on a deploy preview before promoting to production.

Legacy filename redirects are configured in `netlify.toml`. The `/feed.xml` and `/sitemap.xml` routes use Netlify Functions.

## Remaining owner actions and implementation gaps

- Supply the Supabase URL, public anon key and server-only service-role key; apply and review all migrations in the intended environment.
- Supply Contentful space ID, delivery token and confirm the existing content model field names used by the pages.
- Set a unique `CONTENTFUL_WEBHOOK_SECRET`, configure Contentful webhooks, and verify the scheduled/on-demand reconciliation after applying the CMS migration.
- Create Turnstile site/secret keys and enter the matching public key in `site-config.js`.
- Supply the verified YouTube channel ID and API key.
- Choose and configure an email provider and the church recipient addresses.
- Confirm with the owner whether Paybill 522522 is shared. Only configure Daraja STK with a shortcode/account reference that the church's Daraja app can actually use; keep `MPESA_STK_ENABLED=false` until then.
- Confirm privacy retention periods and crisis-response wording before publishing final policy language.
- Review remaining legacy inline styles and page scripts against the production CSP, and verify any third-party script integrity/version policy before deployment.
- Configure Contentful field models (especially events, gallery, announcements, ministries, service times, and leadership) to match the normalizers and apply the CMS migration.
- Check all pages, metadata, accessibility and internal links in a deployed preview; automated tests are not a substitute for that review.

## Verified contact details

- **Location:** Egerton University, Njoro, Kenya
- **Phone / WhatsApp:** +254 799 522 418
- **Email:** aicegertonchapel@gmail.com
- **Manual M-Pesa:** Paybill 522522, account 7506439
