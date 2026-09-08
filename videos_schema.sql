-- =====================================================================
--  BẢNG VIDEO cho tab "Video" trên trang chủ (realtime, đồng bộ Dashboard)
--  Chạy 1 lần trong Supabase → SQL Editor. Dùng chung bucket 'sotay'.
-- =====================================================================
create table if not exists public.sotay_videos (
  id            bigint generated always as identity primary key,
  title         text    not null default '',
  kind          text    not null default 'file',   -- 'file' (tải lên) | 'youtube' (dán link)
  video_url     text    not null default '',        -- URL công khai (file) hoặc link YouTube
  storage_path  text    default '',                 -- đường dẫn trong bucket (để xoá file)
  display_order int     not null default 0,
  active        boolean not null default true,
  created_at    timestamptz default now()
);

alter table public.sotay_videos enable row level security;

drop policy if exists "videos anon read active" on public.sotay_videos;
create policy "videos anon read active" on public.sotay_videos
  for select to anon using (active = true);

drop policy if exists "videos auth all" on public.sotay_videos;
create policy "videos auth all" on public.sotay_videos
  for all to authenticated using (true) with check (true);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.sotay_videos';
  exception when duplicate_object then null;
  end;
end$$;
