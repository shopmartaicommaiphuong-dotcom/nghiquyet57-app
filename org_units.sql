-- =====================================================================
--  2 LOẠI MODULE: 'personnel' (Nhân sự) | 'units' (Các đơn vị). Chạy 1 lần.
--  org_blocks.kind đã có sẵn (mặc định 'council' = coi như Nhân sự).
--  Thêm trường liên hệ cho từng đơn vị (org_tabs). website dùng cột 'link'.
-- =====================================================================
alter table public.org_tabs add column if not exists address text default '';
alter table public.org_tabs add column if not exists phone   text default '';
alter table public.org_tabs add column if not exists email   text default '';
-- (link = website đã có từ trước)
