-- Run this once in Supabase SQL Editor.
-- It repairs the existing registrations table for the Mind Spark website.

alter table public.registrations
add column if not exists team_id text,
add column if not exists team_name text,
add column if not exists captain_name text,
add column if not exists captain_phone text,
add column if not exists captain_email text,
add column if not exists department text,
add column if not exists branch_semester text,
add column if not exists member_2 text,
add column if not exists member_3 text,
add column if not exists member_4 text;

-- The older table may contain this required column. The new site uses team_id.
do $$
begin
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public'
			and table_name = 'registrations'
			and column_name = 'registration_id'
	) then
		alter table public.registrations alter column registration_id drop not null;
	end if;
end $$;

-- Make any other columns left by an older registration form optional.
do $$
declare
	column_record record;
begin
	for column_record in
		select column_name
		from information_schema.columns
		where table_schema = 'public'
			and table_name = 'registrations'
			and column_name not in ('id', 'created_at', 'team_id', 'team_name', 'captain_name', 'captain_phone', 'captain_email', 'department', 'branch_semester', 'member_2', 'member_3', 'member_4')
			and is_nullable = 'NO'
	loop
		execute format('alter table public.registrations alter column %I drop not null', column_record.column_name);
	end loop;
end $$;

create unique index if not exists registrations_team_id_unique
on public.registrations(team_id);

alter table public.registrations enable row level security;

drop policy if exists "public can register" on public.registrations;
drop policy if exists "public can count registrations" on public.registrations;
drop policy if exists "admin can remove registrations" on public.registrations;
drop policy if exists "admins can view registrations" on public.registrations;
drop policy if exists "admins can update registrations" on public.registrations;
drop policy if exists "admins can remove registrations" on public.registrations;

create policy "admins can view registrations"
on public.registrations
for select
to authenticated
using (true);

create policy "admins can update registrations"
on public.registrations
for update
to authenticated
using (true)
with check (true);

create policy "admins can remove registrations"
on public.registrations
for delete
to authenticated
using (true);

-- Keep public capacity and lookup access scoped to the data the website needs.
create or replace function public.get_registration_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
	select count(*) from public.registrations;
$$;

create or replace function public.lookup_registration(p_team_id text, p_captain_email text)
returns table (
	team_id text,
	team_name text,
	captain_name text,
	department text,
	branch_semester text,
	member_2 text,
	member_3 text,
	member_4 text
)
language sql
stable
security definer
set search_path = public
as $$
	select r.team_id, r.team_name, r.captain_name, r.department,
				 r.branch_semester, r.member_2, r.member_3, r.member_4
	from public.registrations as r
	where upper(trim(r.team_id)) = upper(trim(p_team_id))
		and lower(trim(r.captain_email)) = lower(trim(p_captain_email));
$$;

create or replace function public.team_name_exists(p_team_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.registrations
		where lower(trim(team_name)) = lower(trim(p_team_name))
	);
$$;

create or replace function public.register_team(
	p_team_name text,
	p_captain_name text,
	p_captain_phone text,
	p_captain_email text,
	p_department text,
	p_branch_semester text,
	p_member_2 text,
	p_member_3 text,
	p_member_4 text
)
returns table (team_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
	next_number integer;
	new_team_id text;
begin
	perform pg_advisory_xact_lock(hashtext('mind_spark_registration'));
	if nullif(trim(p_team_name), '') is null or nullif(trim(p_captain_name), '') is null
		or nullif(trim(p_captain_phone), '') is null or nullif(trim(p_captain_email), '') is null
		or nullif(trim(p_department), '') is null or nullif(trim(p_branch_semester), '') is null
		or nullif(trim(p_member_2), '') is null or nullif(trim(p_member_3), '') is null
		or nullif(trim(p_member_4), '') is null then
		raise exception using errcode = 'P0001', message = 'Please complete all required fields.';
	end if;
	if lower(trim(p_captain_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
		raise exception using errcode = 'P0001', message = 'Please enter a valid captain email.';
	end if;
	if regexp_replace(p_captain_phone, '[^0-9]', '', 'g') !~ '^[0-9]{10}$' then
		raise exception using errcode = 'P0001', message = 'Please enter a valid 10-digit phone number.';
	end if;
	if exists (select 1 from public.registrations where lower(trim(team_name)) = lower(trim(p_team_name))) then
		raise exception using errcode = '23505', message = 'That team name is already registered.';
	end if;
	select coalesce(max(substring(r.team_id from 3)::integer), 0) + 1 into next_number
	from public.registrations as r where r.team_id ~ '^MS[0-9]+$';
	if next_number > 30 then
		raise exception using errcode = 'P0002', message = 'FULL';
	end if;
	new_team_id := 'MS' || lpad(next_number::text, 2, '0');
	insert into public.registrations (
		team_id, team_name, captain_name, captain_phone, captain_email,
		department, branch_semester, member_2, member_3, member_4
	) values (
		new_team_id, trim(p_team_name), trim(p_captain_name),
		regexp_replace(p_captain_phone, '[^0-9]', '', 'g'), lower(trim(p_captain_email)),
		trim(p_department), trim(p_branch_semester), trim(p_member_2), trim(p_member_3), trim(p_member_4)
	);
	return query select new_team_id;
end;
$$;

revoke all on function public.get_registration_count() from public;
revoke all on function public.lookup_registration(text, text) from public;
revoke all on function public.team_name_exists(text) from public;
revoke all on function public.register_team(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.get_registration_count() to anon, authenticated;
grant execute on function public.lookup_registration(text, text) to anon, authenticated;
grant execute on function public.team_name_exists(text) to anon, authenticated;
grant execute on function public.register_team(text, text, text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
