-- Which banks' notices land on each account ("nequi", "bogota", "lulo",
-- "davivienda", "pse"), for notices that carry no card digits: a Nequi
-- transfer, a Banco de Bogotá receipt, a PSE payment.

alter table public.accounts
  add column sources text[] not null default '{}'
    check (
      -- Lower-case words only, one per element (no commas hiding two in one).
      array_to_string(sources, ',') ~ '^([a-z]+(,[a-z]+)*)?$'
      and cardinality(sources) = coalesce(array_length(string_to_array(nullif(array_to_string(sources, ','), ''), ','), 1), 0)
    );
