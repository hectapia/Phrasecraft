create table public.phrase_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  creator text,
  publisher text,
  isbn text,
  source_url text,
  license_name text,
  license_url text,
  rights_verified_at timestamptz,
  citation text,
  rights_basis text not null check (
    rights_basis in (
      'public_domain',
      'not_copyrightable',
      'licensed',
      'permission_granted',
      'user_authored',
      'reference_only'
    )
  ),
  reproduction_allowed boolean not null default false,
  rights_notes text,
  is_public boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phrase_sources_rights_consistency check (
    (rights_basis = 'reference_only' and not reproduction_allowed)
    or (
      rights_basis in (
        'public_domain',
        'not_copyrightable',
        'licensed',
        'permission_granted',
        'user_authored'
      )
      and reproduction_allowed
    )
  ),
  constraint phrase_sources_licensed_metadata check (
    rights_basis <> 'licensed'
    or (
      nullif(btrim(license_name), '') is not null
      and nullif(btrim(license_url), '') is not null
    )
  )
);

create table public.phrases (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.phrase_sources (id) on delete restrict,
  phrase_text text not null,
  meaning text,
  usage_notes text,
  example_text text,
  source_locator text,
  modality text not null default 'both'
    check (modality in ('written', 'spoken', 'both')),
  topic text,
  tags text[] not null default '{}',
  is_public boolean not null default false,
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phrases_text_not_blank check (length(btrim(phrase_text)) > 0)
);

create table public.practice_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  description text not null,
  sessions_per_week smallint not null default 4
    check (sessions_per_week between 1 and 14),
  duration_weeks smallint not null default 6
    check (duration_weeks between 1 and 52),
  minutes_per_session smallint not null default 15
    check (minutes_per_session between 1 and 240),
  starts_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_goals_title_not_blank check (length(btrim(title)) > 0),
  constraint practice_goals_description_not_blank check (
    length(btrim(description)) > 0
  )
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  goal_id uuid references public.practice_goals (id) on delete set null,
  phrase_id uuid references public.phrases (id) on delete set null,
  modality text not null default 'written'
    check (modality in ('written', 'spoken')),
  topic text not null,
  prompt text,
  original_text text not null default '',
  revised_text text not null,
  reflection text not null default '',
  outcome text not null check (outcome in ('progress', 'setback')),
  created_at timestamptz not null default now(),
  constraint practice_sessions_revision_not_blank check (
    length(btrim(revised_text)) > 0
  )
);

create index phrases_source_id_idx on public.phrases (source_id);
create index phrases_topic_idx on public.phrases (topic);
create index phrases_tags_idx on public.phrases using gin (tags);
create index practice_goals_user_starts_idx
  on public.practice_goals (user_id, starts_on desc);
create index practice_sessions_user_created_idx
  on public.practice_sessions (user_id, created_at desc);
create index practice_sessions_user_outcome_created_idx
  on public.practice_sessions (user_id, outcome, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger phrase_sources_set_updated_at
before update on public.phrase_sources
for each row execute function public.set_updated_at();

create trigger phrases_set_updated_at
before update on public.phrases
for each row execute function public.set_updated_at();

create trigger practice_goals_set_updated_at
before update on public.practice_goals
for each row execute function public.set_updated_at();

alter table public.phrase_sources enable row level security;
alter table public.phrases enable row level security;
alter table public.practice_goals enable row level security;
alter table public.practice_sessions enable row level security;

create policy "Users can read public or owned sources"
on public.phrase_sources
for select to authenticated
using (is_public or created_by = (select auth.uid()));

create policy "Users can create owned sources"
on public.phrase_sources
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (not is_public or reproduction_allowed)
);

create policy "Users can update owned sources"
on public.phrase_sources
for update to authenticated
using (created_by = (select auth.uid()))
with check (
  created_by = (select auth.uid())
  and (not is_public or reproduction_allowed)
);

create policy "Users can delete owned sources"
on public.phrase_sources
for delete to authenticated
using (created_by = (select auth.uid()));

create policy "Users can read public or owned phrases"
on public.phrases
for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    is_public
    and exists (
      select 1
      from public.phrase_sources as source
      where source.id = source_id
        and source.is_public
        and source.reproduction_allowed
    )
  )
);

create policy "Users can create phrases from permitted sources"
on public.phrases
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.phrase_sources as source
    where source.id = source_id
      and source.reproduction_allowed
      and (
        source.created_by = (select auth.uid())
        or source.is_public
      )
      and (not is_public or source.is_public)
  )
);

create policy "Users can update owned phrases"
on public.phrases
for update to authenticated
using (created_by = (select auth.uid()))
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.phrase_sources as source
    where source.id = source_id
      and source.reproduction_allowed
      and (
        source.created_by = (select auth.uid())
        or source.is_public
      )
      and (not is_public or source.is_public)
  )
);

create policy "Users can delete owned phrases"
on public.phrases
for delete to authenticated
using (created_by = (select auth.uid()));

create policy "Users can read owned goals"
on public.practice_goals
for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create owned goals"
on public.practice_goals
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update owned goals"
on public.practice_goals
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete owned goals"
on public.practice_goals
for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read owned practice sessions"
on public.practice_sessions
for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create owned practice sessions"
on public.practice_sessions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    goal_id is null
    or exists (
      select 1
      from public.practice_goals as goal
      where goal.id = goal_id
        and goal.user_id = (select auth.uid())
    )
  )
  and (
    phrase_id is null
    or exists (
      select 1
      from public.phrases as phrase
      where phrase.id = phrase_id
        and (
          phrase.created_by = (select auth.uid())
          or phrase.is_public
        )
    )
  )
);

create policy "Users can update owned practice sessions"
on public.practice_sessions
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (
    goal_id is null
    or exists (
      select 1
      from public.practice_goals as goal
      where goal.id = goal_id
        and goal.user_id = (select auth.uid())
    )
  )
  and (
    phrase_id is null
    or exists (
      select 1
      from public.phrases as phrase
      where phrase.id = phrase_id
        and (
          phrase.created_by = (select auth.uid())
          or phrase.is_public
        )
    )
  )
);

create policy "Users can delete owned practice sessions"
on public.practice_sessions
for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete
on public.phrase_sources,
   public.phrases,
   public.practice_goals,
   public.practice_sessions
to authenticated;

comment on column public.phrase_sources.rights_basis is
  'Rights basis for storing phrase text. Use not_copyrightable only when the material has been determined not to qualify for copyright protection; use reference_only for citation metadata without copied content.';
comment on column public.phrase_sources.reproduction_allowed is
  'Must be true before phrases can be stored from this source.';
comment on column public.phrase_sources.license_name is
  'Name or identifier of the license permitting reproduction, when applicable.';
comment on column public.phrase_sources.license_url is
  'URL to the license terms; required when rights_basis is licensed.';
comment on column public.phrase_sources.rights_verified_at is
  'When the source reproduction rights were last verified.';
comment on column public.phrases.source_locator is
  'Page, chapter, section, or other location of this phrase in its source.';
