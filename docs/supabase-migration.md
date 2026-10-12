# Supabase realtime mirror rollout

TDQSYS keeps Cloudflare Pages as the public site. Supabase replaces only the
cloud state mirror: its `queue_state` row receives desktop updates through the
existing Pages `/api/save` endpoint, and public clients receive updates through
Supabase Realtime instead of polling every two seconds.

## 1. Create the table

In the Supabase project's **SQL Editor**, open a new query, paste the complete
contents of `supabase/migrations/202610120001_queue_state.sql`, and run it.
The script creates the table, enables RLS, permits read-only anonymous viewing,
and adds the table to the realtime publication.

The state contains vehicle models and queue numbers only. The instance ID in a
QR link is a public viewing capability, not an authentication credential.

## 2. Configure Cloudflare Pages secrets

In **Cloudflare Dashboard > Workers & Pages > tdqsys > Settings > Variables
and Secrets**, add these variables for the Production environment:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://pnyptdyfkftrcgjlaqnr.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase **Project Settings > API Keys > Secret key** (`sb_secret_...`) |

Use **Encrypt** for the secret key. Never commit it or put it in
`public/`. The supplied `sb_publishable_...` key is intentionally public and is
already stored in `public/supabase-config.js` for browser realtime reads.

Once both secrets exist and a new Pages deployment has completed, `/api/save`
upserts Supabase. `/api/data` reads Supabase first. If the secrets are absent,
both routes retain their existing KV behavior, which makes rollback immediate:
remove either secret and redeploy.

## 3. Direct desktop sync (bridge retirement)

The final architecture deploys `supabase/functions/queue-sync/index.ts` as a
Supabase Edge Function. It accepts only an installation-specific writer token,
stored locally by the desktop app and never included in the public state row.

Deploy it from **Edge Functions > Deploy a new function > Via Editor** as
`queue-sync`, using the contents of that `index.ts` file. Disable the function's
JWT verification: this endpoint authenticates the writer token itself. The
matching deployment configuration is in `supabase/config.toml`.

Re-run the complete SQL migration before deploying the function. It is
idempotent and adds the private writer-token registry for the direct path.

## 4. Verify before cutover

1. Run `node tests/run.js` locally.
2. Deploy Pages following `AGENTS.md` (delete `.wrangler` first).
3. Change one queue number in a desktop app and confirm a row appears in
   **Table Editor > queue_state**.
4. Open the QR `client.html?id=...` link on a phone. Change the queue again;
   it should update without a periodic refresh.
5. Keep KV intact for one release cycle. It is the rollback copy for older
   desktop builds and for an incomplete secret configuration.
