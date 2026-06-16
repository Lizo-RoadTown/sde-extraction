-- Step 2 persistence: the self-growing VARIABLE-ROLE registry (mirrors classification.py
-- VARIABLE_ROLES). Same governed-add as formulation_families: new roles enter only via an
-- approved classification_candidate (kind='variable_role'). Additive, schema-ahead (apply when
-- the variable sub-agents are wired). Roles classify a variable's ROLE, never its value.

create table if not exists variable_roles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,   -- match key, e.g. 'auxiliary-process'
  label           text not null,
  recognized_by   text not null default '',
  typical_symbols jsonb not null default '[]'::jsonb,  -- CONVENTION only — symbols are ambiguous
  provenance      text not null default 'corpus-confirmed',
  seen_in         jsonb not null default '[]'::jsonb,
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);
create index if not exists variable_roles_name_idx on variable_roles(name);

alter table variable_roles enable row level security;
create policy "authed full access" on variable_roles for all to authenticated using (true) with check (true);

-- Seed from the 12 completed AT3 reviews (all corpus-confirmed). The CENTRAL hazard the roles
-- solve: the same symbol means different roles across papers (V = vaccinated AND viral load; x =
-- OU log-process AND target cells) — so role is read from stated meaning, never the letter.
insert into variable_roles (name, label, recognized_by, typical_symbols, seen_in) values
  ('susceptible', 'Susceptible', 'susceptible / uninfected / at-risk; target cells available to infect',
   '["S","SH","x"]'::jsonb, '["Cholera","Koufi","Witbooi_Malaria"]'::jsonb),
  ('exposed-latent', 'Exposed / latent', 'exposed / latent / incubating — infected but not yet infectious',
   '["E","L","l"]'::jsonb, '["Chikungunya Virus","Koufi","Viral Infection"]'::jsonb),
  ('infected', 'Infected / infectious', 'infected / infectious / productively-infected cells',
   '["I","IH","IV","Ip","Iq","y","D"]'::jsonb, '["Typhoid Fever Pneumonia","Malaria","Viral Infection","HBV"]'::jsonb),
  ('asymptomatic', 'Asymptomatic carrier', 'asymptomatic / mild — transmits without symptoms',
   '["A"]'::jsonb, '["DOI_10.1016_Koufi_2022"]'::jsonb),
  ('recovered', 'Recovered / removed', 'recovered / removed / immune after infection',
   '["R","RH","Rp","Rq"]'::jsonb, '["Witbooi_Malaria","Malaria","Typhoid Fever Pneumonia"]'::jsonb),
  ('vaccinated', 'Vaccinated / immunized', 'vaccinated / immunized by intervention (NOTE: V also denotes viral load)',
   '["V","J"]'::jsonb, '["Witbooi_Malaria"]'::jsonb),
  ('pathogen-load', 'Pathogen load (virus / bacteria)', 'free virus / viral load / bacterial concentration — a pathogen quantity',
   '["V","v","B"]'::jsonb, '["HBV","Viral Infection","Typhoid Fever Pneumonia","Chikungunya Virus"]'::jsonb),
  ('immune-response', 'Immune response (antibody / effector)', 'antibody / immune effector / CTL response level',
   '["Z","w"]'::jsonb, '["Dengue Infection OrnsteinUhlenbeck","Viral Infection"]'::jsonb),
  ('vector-state', 'Vector compartment (host-vector model)', 'a vector (mosquito) compartment — SV/IV paired with human SH/IH/RH',
   '["SV","IV"]'::jsonb, '["Malaria"]'::jsonb),
  ('host-cell', 'Host cell population (within-host)', 'a host cell population in a within-host model (hepatocytes, target/infected cells)',
   '["H","D","x"]'::jsonb, '["HBV","Viral Infection"]'::jsonb),
  ('auxiliary-process', 'Auxiliary stochastic process (NOT a compartment)', 'an auxiliary stochastic driver (OU log-process) that feeds a rate; not a population',
   '["x"]'::jsonb, '["Dengue Infection OrnsteinUhlenbeck","10_1007s00332.023_copy"]'::jsonb)
on conflict (name) do nothing;
