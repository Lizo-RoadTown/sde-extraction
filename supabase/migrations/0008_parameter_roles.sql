-- Step 3 persistence: the self-growing PARAMETER-ROLE registry (mirrors classification.py
-- PARAMETER_ROLES). Same governed-add as the other registries (candidate kind='parameter_role').
-- Additive, schema-ahead. Roles classify a parameter's role + what KIND of value to expect; the
-- value itself stays a present/absent Slot. constrains = guidance, not a hard bound.

create table if not exists parameter_roles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  label           text not null,
  recognized_by   text not null default '',
  typical_symbols jsonb not null default '[]'::jsonb,
  constrains      text not null default '',
  provenance      text not null default 'corpus-confirmed',
  seen_in         jsonb not null default '[]'::jsonb,
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);
create index if not exists parameter_roles_name_idx on parameter_roles(name);

alter table parameter_roles enable row level security;
create policy "authed full access" on parameter_roles for all to authenticated using (true) with check (true);

-- Seed from the 12 completed AT3 reviews. SDE-critical: noise-intensity (sigma — diffusion
-- coefficient), mean-reversion-rate (theta), reversion-level (x_bar — the canonical
-- requires_inference absent, "never stated explicitly").
insert into parameter_roles (name, label, recognized_by, typical_symbols, constrains, seen_in) values
  ('recruitment','Recruitment / birth / inflow','inflow into the population (births, recruitment, immigration)','["Lambda","lam","A","s","n"]'::jsonb,'positive rate or count/time','["Koufi","Witbooi_Malaria"]'::jsonb),
  ('natural-mortality','Natural mortality / death rate','natural death / per-capita mortality (not disease-induced)','["mu","muH","muV","d"]'::jsonb,'small positive rate (1/time)','["Dengue Infection OrnsteinUhlenbeck","Malaria","HBV"]'::jsonb),
  ('transmission','Transmission / infection / contact rate','rate of new infections / force of infection','["beta","betaHV","betaVH","lambda"]'::jsonb,'positive rate','["Malaria","Koufi","HBV"]'::jsonb),
  ('recovery','Recovery / clearance rate','rate of recovery / clearance from infectious state','["gamma","gammaH","gamma1","gamma2"]'::jsonb,'positive rate','["Koufi","Viral Infection"]'::jsonb),
  ('progression','Progression between stages','rate of moving between compartments (exposed->infectious)','["eta","epsilon","omega","kappa"]'::jsonb,'positive rate','["Koufi","Chikungunya Virus"]'::jsonb),
  ('disease-mortality','Disease-induced death / virulence','extra mortality caused by the disease','["delta","alpha"]'::jsonb,'positive rate','["HBV","Witbooi_Malaria"]'::jsonb),
  ('noise-intensity','Noise intensity / diffusion coefficient','the sigma on a Wiener/Brownian term — perturbation magnitude','["sigma","sigma1","sigma2","sigma3","sigma4","sigma5","zeta","xi"]'::jsonb,'non-negative; one per noisy equation','["Koufi","Chikungunya Virus","HBV","Viral Infection"]'::jsonb),
  ('mean-reversion-rate','Mean-reversion rate (Ornstein-Uhlenbeck)','speed an OU process reverts to its mean (theta)','["theta"]'::jsonb,'positive rate','["Dengue Infection OrnsteinUhlenbeck"]'::jsonb),
  ('reversion-level','OU long-run mean level','the x_bar an OU process reverts to','["x_bar"]'::jsonb,'OFTEN NOT STATED — canonical requires_inference absent','["Dengue Infection OrnsteinUhlenbeck"]'::jsonb),
  ('intervention-rate','Intervention rate (vaccination / treatment / quarantine)','rate of a control: vaccination, treatment, quarantine','["v1","v2","v3","tau","phi","psi","varpi"]'::jsonb,'non-negative rate','["Typhoid Fever Pneumonia","Koufi"]'::jsonb),
  ('waning','Waning immunity / relapse','loss of immunity / relapse to susceptible or infectious','["rho","omega"]'::jsonb,'non-negative rate','["Chikungunya Virus","Typhoid Fever Pneumonia"]'::jsonb),
  ('within-host-rate','Within-host rate (production / clearance / burst)','within-host kinetics: production, infection, burst, clearance','["k","c","pi","p","a","b"]'::jsonb,'positive','["HBV","Viral Infection"]'::jsonb),
  ('scaling','Carrying capacity / population size / scaling','a total population, carrying capacity, or scaling constant','["K","N","NH","n"]'::jsonb,'positive count/size','["Cholera","Malaria"]'::jsonb)
on conflict (name) do nothing;
