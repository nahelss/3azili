# This folder is superseded

The app no longer runs on this Express/Prisma backend — it talks directly
to Supabase now (see `../mobile/src/supabaseClient.js` and
`../mobile/src/api/client.js`). This folder is kept as a reference for the
original data model and route/validation design, not as something to
deploy or run in production.

If you're looking for the real schema and security rules, they live as
migrations on the Supabase project (tables, RLS policies, storage buckets,
admin RPC functions) rather than as Prisma models here.
