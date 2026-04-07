create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.canonical_sessions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  canonical_type text,
  start_date timestamptz,
  end_date timestamptz,
  duration_min numeric,
  trimp numeric,
  match_confidence text,
  relationship text,
  overlap_summary jsonb,
  sources jsonb not null default '{}'::jsonb,
  preferred_metrics jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (user_id, session_id),
  constraint canonical_sessions_duration_min_nonnegative check (duration_min is null or duration_min >= 0),
  constraint canonical_sessions_trimp_nonnegative check (trimp is null or trimp >= 0),
  constraint canonical_sessions_end_after_start check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists canonical_sessions_user_start_date_idx
  on public.canonical_sessions (user_id, start_date);

drop trigger if exists set_canonical_sessions_updated_at on public.canonical_sessions;
create trigger set_canonical_sessions_updated_at
before update on public.canonical_sessions
for each row execute function public.set_updated_at();

alter table public.canonical_sessions enable row level security;

drop policy if exists canonical_sessions_select_own on public.canonical_sessions;
create policy canonical_sessions_select_own
on public.canonical_sessions
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists canonical_sessions_insert_own on public.canonical_sessions;
create policy canonical_sessions_insert_own
on public.canonical_sessions
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists canonical_sessions_update_own on public.canonical_sessions;
create policy canonical_sessions_update_own
on public.canonical_sessions
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists canonical_sessions_delete_own on public.canonical_sessions;
create policy canonical_sessions_delete_own
on public.canonical_sessions
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create table if not exists public.sleep_records (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_id text not null,
  source text,
  sleep_date date not null,
  start_at timestamptz,
  end_at timestamptz,
  duration_min numeric,
  time_in_bed_min numeric,
  sleep_quality numeric,
  avg_hr_bpm numeric,
  steps numeric,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (user_id, sleep_id),
  constraint sleep_records_duration_min_nonnegative check (duration_min is null or duration_min >= 0),
  constraint sleep_records_time_in_bed_min_nonnegative check (time_in_bed_min is null or time_in_bed_min >= 0),
  constraint sleep_records_end_after_start check (end_at is null or start_at is null or end_at >= start_at)
);

create index if not exists sleep_records_user_sleep_date_idx
  on public.sleep_records (user_id, sleep_date desc);

create index if not exists sleep_records_user_start_at_idx
  on public.sleep_records (user_id, start_at desc);

drop trigger if exists set_sleep_records_updated_at on public.sleep_records;
create trigger set_sleep_records_updated_at
before update on public.sleep_records
for each row execute function public.set_updated_at();

alter table public.sleep_records enable row level security;

drop policy if exists sleep_records_select_own on public.sleep_records;
create policy sleep_records_select_own
on public.sleep_records
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists sleep_records_insert_own on public.sleep_records;
create policy sleep_records_insert_own
on public.sleep_records
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists sleep_records_update_own on public.sleep_records;
create policy sleep_records_update_own
on public.sleep_records
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists sleep_records_delete_own on public.sleep_records;
create policy sleep_records_delete_own
on public.sleep_records
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create table if not exists public.healthfit_daily (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  ctl numeric,
  atl numeric,
  tsb numeric,
  acwr numeric,
  trimp numeric,
  duration_sec numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (user_id, record_date),
  constraint healthfit_daily_duration_sec_nonnegative check (duration_sec is null or duration_sec >= 0),
  constraint healthfit_daily_trimp_nonnegative check (trimp is null or trimp >= 0)
);

create index if not exists healthfit_daily_user_record_date_idx
  on public.healthfit_daily (user_id, record_date desc);

drop trigger if exists set_healthfit_daily_updated_at on public.healthfit_daily;
create trigger set_healthfit_daily_updated_at
before update on public.healthfit_daily
for each row execute function public.set_updated_at();

alter table public.healthfit_daily enable row level security;

drop policy if exists healthfit_daily_select_own on public.healthfit_daily;
create policy healthfit_daily_select_own
on public.healthfit_daily
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists healthfit_daily_insert_own on public.healthfit_daily;
create policy healthfit_daily_insert_own
on public.healthfit_daily
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists healthfit_daily_update_own on public.healthfit_daily;
create policy healthfit_daily_update_own
on public.healthfit_daily
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists healthfit_daily_delete_own on public.healthfit_daily;
create policy healthfit_daily_delete_own
on public.healthfit_daily
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

create table if not exists public.biometric_records (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  biometric_id text not null,
  source text,
  measured_at timestamptz,
  measured_date date,
  active_energy_cal numeric,
  resting_energy_cal numeric,
  resting_hr_bpm numeric,
  hrv numeric,
  steps numeric,
  vo2_max numeric,
  exercise_minutes numeric,
  stand_hours numeric,
  weight_lb numeric,
  body_fat_pct numeric,
  bmi numeric,
  bp_systolic numeric,
  bp_diastolic numeric,
  pulse_bpm numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (user_id, biometric_id),
  constraint biometric_records_active_energy_cal_nonnegative check (active_energy_cal is null or active_energy_cal >= 0),
  constraint biometric_records_resting_energy_cal_nonnegative check (resting_energy_cal is null or resting_energy_cal >= 0),
  constraint biometric_records_steps_nonnegative check (steps is null or steps >= 0),
  constraint biometric_records_exercise_minutes_nonnegative check (exercise_minutes is null or exercise_minutes >= 0),
  constraint biometric_records_stand_hours_nonnegative check (stand_hours is null or stand_hours >= 0),
  constraint biometric_records_weight_lb_nonnegative check (weight_lb is null or weight_lb >= 0),
  constraint biometric_records_body_fat_pct_range check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 100)),
  constraint biometric_records_bp_systolic_nonnegative check (bp_systolic is null or bp_systolic >= 0),
  constraint biometric_records_bp_diastolic_nonnegative check (bp_diastolic is null or bp_diastolic >= 0),
  constraint biometric_records_pulse_bpm_nonnegative check (pulse_bpm is null or pulse_bpm >= 0)
);

create index if not exists biometric_records_user_measured_date_idx
  on public.biometric_records (user_id, measured_date desc);

create index if not exists biometric_records_user_measured_at_idx
  on public.biometric_records (user_id, measured_at desc);

drop trigger if exists set_biometric_records_updated_at on public.biometric_records;
create trigger set_biometric_records_updated_at
before update on public.biometric_records
for each row execute function public.set_updated_at();

alter table public.biometric_records enable row level security;

drop policy if exists biometric_records_select_own on public.biometric_records;
create policy biometric_records_select_own
on public.biometric_records
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists biometric_records_insert_own on public.biometric_records;
create policy biometric_records_insert_own
on public.biometric_records
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists biometric_records_update_own on public.biometric_records;
create policy biometric_records_update_own
on public.biometric_records
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists biometric_records_delete_own on public.biometric_records;
create policy biometric_records_delete_own
on public.biometric_records
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);
