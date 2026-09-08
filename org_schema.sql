-- =====================================================================
--  CỤM TỔ CHỨC ĐỘNG — Hồ sơ năng lực / Ban lãnh đạo / Cổng kết nối
--  Chạy 1 lần trong Supabase → SQL Editor (sau supabase_schema.sql)
--  Ảnh người dùng chung bucket 'sotay' (đã tạo trước đó).
-- =====================================================================

-- 1) MODULE TO (vd: BAN LÃNH ĐẠO VIỆN) --------------------------------
create table if not exists public.org_blocks(
  id bigserial primary key,
  kind text default 'council',
  title text not null,
  subtitle text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);
-- 2) TAB (từng Hội đồng trong Module TO) ------------------------------
create table if not exists public.org_tabs(
  id bigserial primary key,
  block_id bigint references public.org_blocks(id) on delete cascade,
  name text not null,
  intro text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);
-- 3) NGƯỜI (thẻ trong từng Tab) ---------------------------------------
create table if not exists public.org_people(
  id bigserial primary key,
  tab_id bigint references public.org_tabs(id) on delete cascade,
  name  text default '',
  title text default '',
  bio   text default '',
  link  text default '',
  photo_url text default '',
  storage_path text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);
-- 4) CỔNG KẾT NỐI (điều hướng ra ngoài) -------------------------------
create table if not exists public.org_links(
  id bigserial primary key,
  grp text default 'main',           -- 'main' | 'member'
  label text not null,
  url text not null,
  note text default '',
  emoji text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);
-- 5) HỒ SƠ NĂNG LỰC / CƠ CẤU TỔ CHỨC ----------------------------------
create table if not exists public.org_profile(
  id bigserial primary key,
  title text not null,
  body text default '',
  display_order int default 0,
  active boolean default true,
  updated_at timestamptz default now()
);

-- TRIGGER updated_at (dùng lại hàm touch_updated_at đã có) -------------
do $$ begin
  if not exists (select 1 from pg_proc where proname='touch_updated_at') then
    create function public.touch_updated_at() returns trigger language plpgsql as
    $f$ begin new.updated_at = now(); return new; end $f$;
  end if;
end $$;
drop trigger if exists t_ob on public.org_blocks;  create trigger t_ob before update on public.org_blocks  for each row execute function public.touch_updated_at();
drop trigger if exists t_ot on public.org_tabs;    create trigger t_ot before update on public.org_tabs    for each row execute function public.touch_updated_at();
drop trigger if exists t_op on public.org_people;  create trigger t_op before update on public.org_people  for each row execute function public.touch_updated_at();
drop trigger if exists t_ol on public.org_links;   create trigger t_ol before update on public.org_links   for each row execute function public.touch_updated_at();
drop trigger if exists t_opr on public.org_profile;create trigger t_opr before update on public.org_profile for each row execute function public.touch_updated_at();

-- RLS: ai cũng đọc active; authenticated toàn quyền -------------------
do $$
declare t text;
begin
  foreach t in array array['org_blocks','org_tabs','org_people','org_links','org_profile'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "pub read %1$s" on public.%1$I;', t);
    execute format('create policy "pub read %1$s" on public.%1$I for select using (active = true);', t);
    execute format('drop policy if exists "auth all %1$s" on public.%1$I;', t);
    execute format('create policy "auth all %1$s" on public.%1$I for all to authenticated using (true) with check (true);', t);
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
end $$;

-- =====================================================================
--  SEED DỮ LIỆU BAN ĐẦU (Super Admin có thể sửa/thêm/xóa sau)
-- =====================================================================
insert into public.org_profile(title,body,display_order) values
 ('Viện Nghiên cứu Đào tạo Công nghệ và Chuyển đổi số AVG',
  'Viện AVG (MST 0111458719) là tổ chức khoa học & công nghệ trực thuộc Hội Doanh nghiệp Nhỏ và Vừa Việt – Đức (VGEA), hoạt động trong nghiên cứu, đào tạo công nghệ và chuyển đổi số. Trụ sở: Tầng 6, ICON4, 243A Đê La Thành, phường Láng, Hà Nội.',1),
 ('Trung tâm Truyền thông Công nghệ số VGEA',
  'Đơn vị trực thuộc Viện AVG, vận hành nền tảng truyền thông số Danbiet.vn "Của Dân · Do Dân · Vì Dân"; cung cấp giải pháp truyền thông, chuyển đổi số và đào tạo cho chính quyền cấp xã/phường, doanh nghiệp và nhà trường.',2),
 ('Đơn vị thành viên & đối tác',
  'Hệ sinh thái gồm các đơn vị thành viên, đối tác công nghệ và mạng lưới cộng tác viên trên toàn quốc. (Super Admin cập nhật chi tiết tại đây.)',3)
on conflict do nothing;

insert into public.org_links(grp,label,url,note,emoji,display_order) values
 ('main','Viện AVG','https://vienavg.org','Cổng thông tin chính thức của Viện','🏛️',1),
 ('main','Danbiet.vn','https://danbiet.vn','Nền tảng truyền thông số VGEA','📡',2),
 ('member','Trung tâm Truyền thông Công nghệ số VGEA','https://danbiet.vn','Đơn vị vận hành Danbiet.vn','🛰️',3)
on conflict do nothing;

do $$
declare bid bigint; t1 bigint; t2 bigint;
begin
  insert into public.org_blocks(kind,title,subtitle,display_order)
    values('council','BAN LÃNH ĐẠO VIỆN','Cơ cấu tổ chức & đội ngũ lãnh đạo Viện AVG – Trung tâm VGEA',1)
    returning id into bid;
  insert into public.org_tabs(block_id,name,intro,display_order)
    values(bid,'Lãnh đạo Viện AVG','Ban lãnh đạo Viện Nghiên cứu Đào tạo Công nghệ và Chuyển đổi số AVG.',1)
    returning id into t1;
  insert into public.org_tabs(block_id,name,intro,display_order)
    values(bid,'Lãnh đạo Trung tâm VGEA','Ban lãnh đạo Trung tâm Truyền thông Công nghệ số VGEA.',2)
    returning id into t2;
  insert into public.org_people(tab_id,name,title,bio,display_order) values
    (t1,'ThS. Phạm Quốc Đông','Viện trưởng Viện AVG','Cử nhân Luật, Cử nhân Kinh tế, Cao cấp lý luận chính trị; Chứng chỉ Nghiệp vụ Báo chí. Đại diện pháp luật Viện AVG.',1);
  insert into public.org_people(tab_id,name,title,bio,display_order) values
    (t2,'TS. Nguyễn Văn Phú','Giám đốc Trung tâm VGEA','Phụ trách điều hành chung Trung tâm Truyền thông Công nghệ số VGEA.',1),
    (t2,'Dương Ngọc Ảnh','Phó Giám đốc (Chủ nhiệm đề tài)','Phụ trách nghiên cứu – phát triển sản phẩm và đề tài khoa học.',2),
    (t2,'KS. Bùi Ngọc Linh','Phó Giám đốc (phụ trách Kinh doanh)','Phụ trách kinh doanh, phát triển thị trường xã/phường, doanh nghiệp và nhà trường; mở rộng nền tảng Danbiet.vn.',3);
end $$;

-- =====================================================================
--  XONG. Mở admin-org.html để quản lý toàn bộ cụm Tổ chức.
-- =====================================================================
