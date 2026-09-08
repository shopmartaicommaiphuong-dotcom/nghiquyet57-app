-- =====================================================================
--  VIDEO theo từng ĐƠN VỊ (module Loại 2 "Các đơn vị") — realtime
--  Chạy 1 lần sau org_schema.sql & org_slides_schema.sql.
--  owner_type: 'tab' (đơn vị) | 'block'. Dùng chung bucket 'sotay' (folder 'videos').
-- =====================================================================
create table if not exists public.org_videos(
  id bigserial primary key,
  owner_type text not null,           -- 'tab' | 'block'
  owner_id   bigint not null,
  title text default '',
  kind  text default 'file',          -- 'file' | 'youtube'
  video_url text default '',
  storage_path text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);
create index if not exists org_videos_owner on public.org_videos(owner_type,owner_id,display_order,id);

drop trigger if exists t_ovid on public.org_videos;
create trigger t_ovid before update on public.org_videos for each row execute function public.touch_updated_at();

alter table public.org_videos enable row level security;
drop policy if exists "pub read org_videos" on public.org_videos;
create policy "pub read org_videos" on public.org_videos for select using (active = true);
drop policy if exists "auth all org_videos" on public.org_videos;
create policy "auth all org_videos" on public.org_videos for all to authenticated using (true) with check (true);

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.org_videos';
  exception when duplicate_object then null; end;
end$$;
