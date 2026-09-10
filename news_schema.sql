-- =====================================================================
--  MODULE TIN TỨC HOẠT ĐỘNG (trang chủ NQ57) — realtime, có editor giàu tính năng
--  Chạy 1 lần trong Supabase → SQL Editor. Dùng chung bucket 'sotay' (folder 'news').
-- =====================================================================
create table if not exists public.sotay_news(
  id            bigint generated always as identity primary key,
  title         text    not null default '',
  excerpt       text    not null default '',   -- mô tả ngắn
  content       text    not null default '',   -- HTML từ trình soạn thảo
  cover_url     text    default '',            -- ảnh đại diện
  cover_path    text    default '',
  attachments   jsonb   default '[]'::jsonb,   -- [{name,url,path,kind}] ảnh/video/file đính kèm
  tags          text    default '',
  display_order int     not null default 0,
  active        boolean not null default true,
  created_at    timestamptz default now()
);

alter table public.sotay_news enable row level security;

drop policy if exists "news anon read active" on public.sotay_news;
create policy "news anon read active" on public.sotay_news
  for select to anon using (active = true);

drop policy if exists "news auth all" on public.sotay_news;
create policy "news auth all" on public.sotay_news
  for all to authenticated using (true) with check (true);

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.sotay_news';
  exception when duplicate_object then null; end;
end$$;
