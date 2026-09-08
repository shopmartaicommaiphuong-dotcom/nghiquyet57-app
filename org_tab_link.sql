-- Thêm link truy cập đích cho từng Hội đồng (org_tabs). Chạy 1 lần.
alter table public.org_tabs add column if not exists link text default '';
