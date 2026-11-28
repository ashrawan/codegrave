-- The pro plan (docs/ACCOUNTS.md, "The pro plan"): an account is free or pro, said on its own row.
-- Only the payment webhook writes these fields (with the service key): an account may write only
-- its username (see the grants on profiles), so nobody can make themselves pro. `stripe_customer`
-- ties the account to its customer at Stripe, so a later renewal or cancellation finds its row.
alter table public.profiles add column plan text not null default 'free' check (plan in ('free', 'pro'));
alter table public.profiles add column stripe_customer text unique;
