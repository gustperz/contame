-- How many bank movements were joined into one expense from the inbox (the
-- rent sent in two transfers because of a daily limit, a purchase paid in two
-- parts). Null for an expense that is one movement or was typed in the app.

alter table public.expenses
  add column parts smallint check (parts is null or parts between 2 and 100);
