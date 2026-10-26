create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null,
  tech text not null default '',
  url text default '',
  github text default '',
  image_url text default '',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.comments enable row level security;
alter table public.messages enable row level security;

-- The Node server uses the Supabase service-role key, so browser clients do not need direct DB access.
-- Do not expose the service-role key in frontend code.

insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do nothing;

-- Profile editing: one server-managed document. No browser policies are required.
create table if not exists public.portfolio_profile (
  id text primary key check (id = 'main'),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.portfolio_profile enable row level security;

-- The service-role key is used only by the Node server.
-- Existing projects, messages and comments are preserved.

-- GitHub sync, privacy and visibility
alter table public.projects add column if not exists github_repo text;
alter table public.projects add column if not exists github_id bigint;
alter table public.projects add column if not exists github_private boolean not null default false;
alter table public.projects add column if not exists hidden boolean not null default false;
alter table public.projects add column if not exists source text not null default 'manual';
create unique index if not exists projects_github_id_key on public.projects (github_id) where github_id is not null;

create table if not exists public.site_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_state enable row level security;
