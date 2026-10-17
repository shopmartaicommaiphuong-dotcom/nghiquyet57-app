// =====================================================================
//  API QUẢN LÝ TÀI KHOẢN BIÊN TẬP VIÊN — chạy trên Vercel Serverless Function
//  Dùng khóa SERVICE_ROLE (bí mật, chỉ nằm trên máy chủ, KHÔNG BAO GIỜ lộ
//  ra trình duyệt) để tạo/đổi mật khẩu/xóa tài khoản Supabase Auth.
//  Chỉ Super Admin (role="admin") mới gọi được — được xác thực bằng
//  access token của chính phiên đăng nhập admin.html gửi lên.
// =====================================================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kvqnxylovwlijrmghorf.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cW54eWxvdndsaWpybWdob3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjU1NzAsImV4cCI6MjEwMzg0MTU3MH0.gBfcXFuDs5yHKFh-38Wq1JcJGS06aY0KGkCIrJh9SXQ';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Thiếu SUPABASE_SERVICE_ROLE_KEY — vào Vercel → Settings → Environment Variables để khai báo, rồi deploy lại.' });
    return;
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const action = body.action;

    // 1) Xác thực người gọi: phải là access token hợp lệ, role = 'admin'
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) { res.status(401).json({ error: 'Thiếu token đăng nhập.' }); return; }

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const who = await anon.auth.getUser(token);
    if (who.error || !who.data || !who.data.user) { res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' }); return; }
    const callerRole = (who.data.user.user_metadata || {}).role || '';
    if (callerRole !== 'admin') { res.status(403).json({ error: 'Chỉ Super Admin mới được thao tác.' }); return; }

    // 2) Dùng service_role để thao tác Auth Admin API
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    if (action === 'list') {
      const out = [];
      let page = 1;
      while (true) {
        const r = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (r.error) throw r.error;
        const users = (r.data && r.data.users) || [];
        users.forEach((u) => {
          const role = (u.user_metadata || {}).role || '';
          if (role === 'editor') {
            out.push({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at });
          }
        });
        if (users.length < 200) break;
        page++;
        if (page > 20) break; // chặn vòng lặp vô hạn, thừa đủ cho quy mô dự án này
      }
      res.status(200).json({ ok: true, users: out });
      return;
    }

    if (action === 'create') {
      const email = (body.email || '').trim();
      const password = body.password || '';
      if (!email || !password || password.length < 6) {
        res.status(400).json({ error: 'Email hoặc mật khẩu không hợp lệ (mật khẩu tối thiểu 6 ký tự).' });
        return;
      }
      // Luôn gắn cứng role='editor' — tài khoản tạo qua API này KHÔNG BAO GIỜ có quyền admin
      const cr = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { role: 'editor' },
      });
      if (cr.error) throw cr.error;
      res.status(200).json({ ok: true, user: { id: cr.data.user.id, email: cr.data.user.email } });
      return;
    }

    if (action === 'update') {
      const id = body.id;
      if (!id) { res.status(400).json({ error: 'Thiếu id tài khoản.' }); return; }
      const patch = {};
      if (body.password) {
        if (body.password.length < 6) { res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' }); return; }
        patch.password = body.password;
      }
      if (body.email) patch.email = String(body.email).trim();
      if (!Object.keys(patch).length) { res.status(400).json({ error: 'Không có gì để cập nhật.' }); return; }
      // Không nhận role từ client — chặn mọi khả năng leo quyền qua API này
      const up = await admin.auth.admin.updateUserById(id, patch);
      if (up.error) throw up.error;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'delete') {
      const id = body.id;
      if (!id) { res.status(400).json({ error: 'Thiếu id tài khoản.' }); return; }
      const de = await admin.auth.admin.deleteUser(id);
      if (de.error) throw de.error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'action không hợp lệ.' });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || String(e) });
  }
};
