# AIC Egerton Chapel — Staff Guide

This guide describes the current site workflows and clearly marks features that still depend on deployment/configuration. Do not treat a form response or browser timeout as proof of a payment.

## Publishing sermons and events

1. Sign in to the church Contentful space.
2. Open **Content** and select the existing `sermons` or `upcomingEvent` content type.
3. Edit or create an entry using the fields defined in that content type. For sermons, confirm the title, preacher and date before publishing; attach audio, PDF, video or image assets only in the appropriate fields.
4. Preview the entry and publish it when ready.
5. Refresh the Sermons page and `/feed.xml` to verify the published result.

Contentful is the primary CMS. The homepage and sermon archive automatically use published sermons in Supabase if Contentful is unavailable. This is a read fallback, not an automatic copy: maintain backup records in `public.sermons` using the Supabase card on `/admin.html`. The fallback only displays published records and does not expose premium resource URLs.

If entries do not appear, confirm the Contentful space ID, environment and Delivery API token in the site configuration and Netlify environment before requesting a deploy. A secured Contentful webhook and automatic YouTube draft import are not yet available.

![Screenshot placeholder: Contentful sermon editor]

## Events, announcements and service times

The existing homepage may read upcoming events from Contentful when its page integration and model configuration are available. The announcement and editable service-time models are not wired end to end yet. Until that work is completed, verify event and schedule content on the public site after publishing; do not assume expired events are automatically removed.

![Screenshot placeholder: Contentful event entry]

## Prayer requests

The admin dashboard is not yet production-ready: legacy inline scripts remain and have not been verified against the deployed Content Security Policy. Do not rely on dashboard moderation until that cleanup is complete and tested.

Public prayer requests are submitted as unapproved. Requests marked private are intended for the pastoral team and must not be published. When Supabase and the form/email/Turnstile integrations are configured:

1. Sign in at `/admin.html` with an invited admin account.
2. Open **Prayer Wall** and review the request text and category.
3. Approve only requests that are appropriate to share publicly; otherwise keep private or remove them.

The dashboard currently provides a basic list, not bulk moderation, audit history or urgent-prayer alerts. If the dashboard is unavailable, contact the church directly rather than attempting direct database edits.

![Screenshot placeholder: Prayer moderation panel]

## Contact and ministry applications

Contact and ministry forms send through the Netlify form function. They require the Supabase server credentials, configured email provider and Turnstile keys. If a form displays an error, the website has not confirmed full delivery; follow up by email or WhatsApp:

- Email: aicegertonchapel@gmail.com
- WhatsApp/phone: +254 799 522 418

The admin dashboard currently has a basic inquiry list. Assignment, internal notes, CSV export and full pagination are not implemented.

## Giving and payment reconciliation

Manual giving is always available:

| M-Pesa field | Value |
|---|---|
| Paybill | 522522 |
| Account | 7506439 |

The website does not confirm manual payments. Verify manual donations against the Safaricom statement and confirmation details.

STK prompts are disabled by default. Keep them disabled until the owner confirms the Daraja shortcode can receive payments for this account and all server credentials, Turnstile and database migrations are configured. A completed status is recorded only after a valid Safaricom callback. The admin payment list is read-only; there is no reconciliation action or CSV export yet.

![Screenshot placeholder: Give page and manual Paybill details]

## Admin access

Admin access uses Supabase magic links. A trusted existing user must be promoted by an authorized database operator. Follow the SQL in the project README; do not share or put the service-role key in the browser. Restrict production signup to invited users in Supabase Auth settings.

## Still to be configured or built

- Confirm Contentful models, browser Delivery API values and site publishing behavior.
- Configure Supabase, email and Turnstile in the intended environment.
- Confirm Paybill/Daraja compatibility before enabling STK.
- Confirm the retention period for inquiries, prayer requests and payments.
- Build and verify the secured Contentful webhook, event cleanup, YouTube draft importer, digest and admin audit/reconciliation features.

For technical help, contact the church at +254 799 522 418 or aicegertonchapel@gmail.com.
