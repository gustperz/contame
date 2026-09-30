-- Month closings: the day each month starts when it does not start on the 1st.
-- Closing September on the 29th (payday) stores {"2026-10": "2026-09-29"}, so
-- spending from that day counts in October while every expense keeps its real
-- date. A month missing from the object starts on its 1st, as in the calendar.

alter table public.settings
  add column month_starts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(month_starts) = 'object');
