-- The merchant as the bank named it, for expenses confirmed from the inbox.
-- The description can be rewritten ("Comida para el desayuno"); this keeps
-- "STO 258", so the next purchase there is recognised and takes the category
-- chosen last time. Null for expenses typed in the app.

alter table public.expenses
  add column merchant text check (merchant is null or length(merchant) <= 200);
