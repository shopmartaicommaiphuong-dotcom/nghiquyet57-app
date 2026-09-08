-- =====================================================================
--  SLIDER ẢNH cho từng Module TO & từng Hội đồng (chạy 1 lần)
--  (sau org_schema.sql). Ảnh dùng chung bucket 'sotay' (folder 'slides').
-- =====================================================================

-- Ô "số giây trượt" cho mỗi module & hội đồng (nhỏ = trượt nhanh)
alter table public.org_blocks add column if not exists slide_secs int default 30;
alter table public.org_tabs   add column if not exists slide_secs int default 30;

-- Bảng ảnh slide: owner_type 'block' | 'tab', owner_id = id tương ứng
create table if not exists public.org_slides(
  id bigserial primary key,
  owner_type text not null,          -- 'block' | 'tab'
  owner_id   bigint not null,
  image_url text default '',
  storage_path text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);
create index if not exists org_slides_owner on public.org_slides(owner_type,owner_id,display_order,id);

drop trigger if exists t_osl on public.org_slides;
create trigger t_osl before update on public.org_slides for each row execute function public.touch_updated_at();

alter table public.org_slides enable row level security;
drop policy if exists "pub read org_slides" on public.org_slides;
create policy "pub read org_slides" on public.org_slides for select using (active = true);
drop policy if exists "auth all org_slides" on public.org_slides;
create policy "auth all org_slides" on public.org_slides for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.org_slides;

-- =====================================================================
--  XONG. Vào Dashboard → Ban lãnh đạo: mỗi Module & Hội đồng có khu
--  "Slide ảnh" để up ảnh + ô số giây trượt.
-- =====================================================================
