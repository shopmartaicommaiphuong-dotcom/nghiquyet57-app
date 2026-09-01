-- =====================================================================
--  SỔ TAY NGHỊ QUYẾT 57 — SCHEMA SUPABASE (chạy 1 lần trong SQL Editor)
--  Đế chế ShopMartAI · PGĐ Bùi Ngọc Linh
-- =====================================================================

-- 1) BẢNG ẢNH -----------------------------------------------------------
create table if not exists public.sotay_images (
  id            bigserial primary key,
  slot          text    not null,            -- 'hero' | 'poster' | 'vientruong' | 'gallery'
  title         text    default '',          -- tiêu đề / chú thích hiển thị
  image_url     text    not null,            -- URL công khai của ảnh trong Storage
  storage_path  text    default '',          -- đường dẫn trong bucket (để xoá file)
  display_order int     default 0,           -- thứ tự hiển thị
  active        boolean default true,        -- bật/tắt hiển thị trên Sổ tay
  updated_at    timestamptz default now()
);
create index if not exists sotay_images_slot_order
  on public.sotay_images (slot, display_order, id);

-- tự cập nhật updated_at mỗi lần sửa
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch on public.sotay_images;
create trigger trg_touch before update on public.sotay_images
  for each row execute function public.touch_updated_at();

-- 2) BẢO MẬT DÒNG (RLS) -------------------------------------------------
alter table public.sotay_images enable row level security;

-- Ai cũng đọc được ảnh đang BẬT (cho Sổ tay công khai)
drop policy if exists "public read active" on public.sotay_images;
create policy "public read active" on public.sotay_images
  for select using ( active = true );

-- Admin (đã đăng nhập) toàn quyền
drop policy if exists "auth read all" on public.sotay_images;
create policy "auth read all" on public.sotay_images
  for select to authenticated using ( true );
drop policy if exists "auth insert" on public.sotay_images;
create policy "auth insert" on public.sotay_images
  for insert to authenticated with check ( true );
drop policy if exists "auth update" on public.sotay_images;
create policy "auth update" on public.sotay_images
  for update to authenticated using ( true ) with check ( true );
drop policy if exists "auth delete" on public.sotay_images;
create policy "auth delete" on public.sotay_images
  for delete to authenticated using ( true );

-- 3) REALTIME (để Sổ tay & Dashboard đồng bộ tức thì) -------------------
alter publication supabase_realtime add table public.sotay_images;

-- 4) KHO ẢNH (STORAGE BUCKET) ------------------------------------------
insert into storage.buckets (id, name, public)
  values ('sotay','sotay', true)
  on conflict (id) do nothing;

drop policy if exists "sotay public read" on storage.objects;
create policy "sotay public read" on storage.objects
  for select using ( bucket_id = 'sotay' );
drop policy if exists "sotay auth insert" on storage.objects;
create policy "sotay auth insert" on storage.objects
  for insert to authenticated with check ( bucket_id = 'sotay' );
drop policy if exists "sotay auth update" on storage.objects;
create policy "sotay auth update" on storage.objects
  for update to authenticated using ( bucket_id = 'sotay' );
drop policy if exists "sotay auth delete" on storage.objects;
create policy "sotay auth delete" on storage.objects
  for delete to authenticated using ( bucket_id = 'sotay' );

-- =====================================================================
--  XONG. Sau khi chạy: vào Authentication → Users → Add user để tạo
--  tài khoản Admin (email + mật khẩu) dùng đăng nhập Dashboard.
-- =====================================================================
