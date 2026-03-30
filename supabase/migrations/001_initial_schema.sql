-- ─── Profiles (extends Supabase auth.users) ──────────────────────

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'enterprise')),
  default_machine_brand text,
  default_hoop_size text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Projects ─────────────────────────────────────────────────────

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('upload_image', 'text_only', 'ready_design', 'from_scratch')),
  surface text not null check (surface in ('cap', 'shirt', 'jacket', 'patch', 'other')),
  hoop_size text not null,
  machine_brand text not null,
  export_format text not null,
  current_phase text not null default 'onboarding',
  status text not null default 'draft' check (status in ('draft', 'processing', 'preview_ready', 'approved', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
create policy "Users can CRUD own projects" on public.projects for all using (auth.uid() = user_id);

-- ─── Project files ────────────────────────────────────────────────

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  phase text not null,
  file_type text not null,
  storage_path text not null,
  mime_type text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table public.project_files enable row level security;
create policy "Users can read own project files" on public.project_files
  for select using (
    exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
  );

-- ─── Briefs ───────────────────────────────────────────────────────

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  version int not null default 1,
  content text not null,
  intent jsonb not null default '{}',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.briefs enable row level security;
create policy "Users can read own briefs" on public.briefs
  for select using (
    exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
  );

-- ─── Pipeline runs ───────────────────────────────────────────────

create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  phase text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'needs_approval')),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table public.pipeline_runs enable row level security;
create policy "Users can read own pipeline runs" on public.pipeline_runs
  for select using (
    exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
  );

-- ─── Feedback ─────────────────────────────────────────────────────

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  rating text not null check (rating in ('perfect', 'minor_adjustments', 'problems')),
  broke_thread boolean not null default false,
  wrinkled_fabric boolean not null default false,
  gaps_in_fill boolean not null default false,
  color_issues boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
create policy "Users can CRUD own feedback" on public.feedback
  for all using (
    exists (select 1 from public.projects where id = project_id and user_id = auth.uid())
  );

-- ─── Storage buckets ──────────────────────────────────────────────

insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false);

create policy "Users can upload to own project folder" on storage.objects
  for insert with check (
    bucket_id = 'project-files' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own project files from storage" on storage.objects
  for select using (
    bucket_id = 'project-files' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
