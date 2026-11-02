# Developer runbook

## First deployment

1. Set Netlify server variables from `.env.example`, including the Supabase URL, anon key, **service-role key**, Contentful space/environment, **Contentful Management token**, and `ADMIN_MFA_REQUIRED=true`. Keep the service-role and Management tokens in Netlify only.
2. Apply the Supabase migrations to the intended project. Confirm the `cms-media` bucket exists and is public for public photos and downloads.
3. Create the first Auth user in Supabase, then promote that account to `admin` in the SQL editor. Keep public sign-up disabled. Use `/admin/` to sign in, enroll an authenticator, and verify the admin console.
4. Run `npm run contentful:migrate` from a trusted environment with the Contentful Management token set. Confirm the Contentful content type IDs and locale match the website's existing space before publishing.
5. Set Contentful's webhook secret in Netlify and configure the Contentful webhook to call `/.netlify/functions/cms-sync` with the `x-contentful-webhook-secret` header. Configure the email provider and church notification address for terminal queue failures.
6. Deploy a preview and verify login, invite, draft, publish, scheduled publish/unpublish, upload, retry, and sign-out before promoting it.

## Invite and manage a teammate

Open **Users** in the developer console, invite their email, choose editor/admin, and grant only the private-record permissions they need. They set their password from the invitation email. Admin accounts must enroll TOTP MFA. Disable access from the same screen when someone leaves; the next protected request is rejected.

## Retry a backup

Open **Publishing queue** in the console, inspect the failed item, then choose **Retry** or **Retry all**. A scheduled function retries pending jobs every five minutes with increasing delays, then emails the configured church address after the attempt limit. Use **Mark resolved** only after checking the corresponding content.

## Restore or permanently remove content

Open **Content** in the console, inspect the revision history, and restore the needed version. Permanent removal is irreversible and is available to admins only. Soft removal from the editor view is recoverable.

## Rotate a key

Create the replacement key in its provider, update the matching Netlify environment variable, deploy, and verify the health panel. For service-role or Contentful Management tokens, never paste the value into browser configuration, source files, screenshots, logs, or support messages. Revoke the old key after the deployment is confirmed.

## If one service is unavailable

The editor saves to Supabase first. If the Contentful backup fails, the website continues serving the saved content and the queue retries it. Check the health panel and queue. If the primary database is unavailable, publishing cannot be confirmed; wait for service recovery and retry the saved draft. Do not report an unsaved post as live.

## Owner confirmations still needed

- Confirm the Contentful environment, default locale, and field definitions before running the migration script.
- Confirm that public access to the `cms-media` bucket is appropriate for church photos, PDFs, and recordings.
- Add the live site and any preview URLs to Supabase Auth's allowed redirect URLs.
- Confirm the church address used for terminal publish-failure alerts.
