-- What the phone learns while confirming automatic purchases:
--   * accounts.cards: last four digits of the cards of each account, so a bank
--     notice for "•4007" lands on the right account.
--   * settings.merchant_categories: merchant -> category chosen by the person
--     ("from now on, Americanino goes to Ropa"). Keys are the merchant name
--     lower-cased and without accents.

alter table public.accounts
  add column cards text[] not null default '{}'
    check (array_to_string(cards, ',') ~ '^([0-9]{4}(,[0-9]{4})*)?$');

alter table public.settings
  add column merchant_categories jsonb not null default '{}'::jsonb
    check (jsonb_typeof(merchant_categories) = 'object');
