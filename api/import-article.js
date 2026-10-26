// =====================================================================
//  API LẤY BÀI TỪ LINK — "Dán link là có bài"
//  - Nhận 1 đường link bài viết bất kỳ (báo, cổng TTĐT, blog...)
//  - Tự bóc: tiêu đề, mô tả ngắn, ảnh đại diện, nội dung chữ + ảnh
//  - Tải TOÀN BỘ ảnh về kho Supabase của mình (thư mục news/) để ảnh không
//    bao giờ bị die / bị chặn hotlink, người đọc xem ngay trên trang mình
//  - Chỉ Super Admin (role=admin) và Biên tập viên (role=editor) gọi được
//  Chạy trên Vercel Serverless Function (Node 18+).
// =====================================================================
const { createClient } = require('@supabase/supabase-js');
const { parseHTML } = require('linkedom');
const { Readability } = require('@mozilla/readability');
const dns = require('dns').promises;
const net = require('net');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kvqnxylovwlijrmghorf.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cW54eWxvdndsaWpybWdob3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjU1NzAsImV4cCI6MjEwMzg0MTU3MH0.gBfcXFuDs5yHKFh-38Wq1JcJGS06aY0KGkCIrJh9SXQ';
const BUCKET = 'sotay';
const FOLDER = 'news';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const MAX_PAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMG_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 40;

// ---------------------------------------------------------------- tiện ích
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') ||
    (v.startsWith('::ffff:') && isPrivateIp(v.slice(7)));
}
async function assertPublicUrl(u) {
  let url;
  try { url = new URL(u); } catch (e) { throw new Error('Link không hợp lệ.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Chỉ nhận link http/https.');
  const host = url.hostname;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('Link không được phép.');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('Không tìm thấy tên miền ' + host + '.');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Link không được phép.');
  return url;
}
async function fetchWithLimit(u, opts, maxBytes, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(u, Object.assign({}, opts, { signal: ctrl.signal, redirect: 'follow' }));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const len = +r.headers.get('content-length') || 0;
    if (len && len > maxBytes) throw new Error('Tệp quá lớn');
    const reader = r.body.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { ctrl.abort(); throw new Error('Tệp quá lớn'); }
      chunks.push(value);
    }
    return { res: r, buf: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
  } finally { clearTimeout(t); }
}
function decodeHtml(buf, contentType) {
  let cs = (/charset=([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!cs) {
    const head = buf.slice(0, 4096).toString('latin1');
    cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  cs = (cs || 'utf-8').toLowerCase();
  try { return new TextDecoder(cs).decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}
function abs(u, base) {
  if (!u) return '';
  u = String(u).trim();
  if (!u || /^(data|blob|javascript|about):/i.test(u)) return '';
  try { return new URL(u, base).href; } catch (e) { return ''; }
}
function bestFromSrcset(ss) {
  if (!ss) return '';
  let best = '', bw = -1;
  ss.split(/,\s+(?=\S)/).forEach((part) => {
    const [url, d] = part.trim().split(/\s+/);
    const w = d ? parseFloat(d) * (/x$/i.test(d) ? 1000 : 1) : 1;
    if (url && w > bw) { bw = w; best = url; }
  });
  return best;
}
function meta(doc, names) {
  for (const n of names) {
    const el = doc.querySelector('meta[property="' + n + '"]') || doc.querySelector('meta[name="' + n + '"]') ||
      doc.querySelector('meta[itemprop="' + n + '"]');
    const v = el && (el.getAttribute('content') || '').trim();
    if (v) return v;
  }
  return '';
}
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// ------------------------------------------------- chuẩn hoá ảnh lười (lazy)
function fixImages(doc, base) {
  // Ảnh thật nằm trong <noscript> (nhiều trang dùng) → bung ra
  doc.querySelectorAll('noscript').forEach((ns) => {
    const html = ns.innerHTML || ns.textContent || '';
    if (/<img/i.test(html)) {
      const wrap = doc.createElement('span');
      wrap.innerHTML = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const prev = ns.previousElementSibling;
      if (prev && prev.tagName === 'IMG') prev.remove();
      ns.replaceWith(wrap);
    } else ns.remove();
  });
  doc.querySelectorAll('picture source').forEach((s) => s.remove());
  doc.querySelectorAll('img').forEach((img) => {
    const cands = [
      img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy-src'),
      img.getAttribute('data-lazy'), img.getAttribute('data-url'), img.getAttribute('data-full-src'),
      bestFromSrcset(img.getAttribute('data-srcset')), bestFromSrcset(img.getAttribute('srcset')),
      img.getAttribute('src'),
    ];
    let src = '';
    for (const c of cands) { const a = abs(c, base); if (a) { src = a; break; } }
    if (!src) { img.remove(); return; }
    img.setAttribute('src', src);
    img.removeAttribute('srcset'); img.removeAttribute('data-srcset');
  });
}

// ------------------------------------------- làm sạch HTML cho trình soạn thảo
const KEEP = new Set(['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
  'blockquote', 'img', 'iframe', 'pre', 'code', 'sub', 'sup']);
const DROP = new Set(['script', 'style', 'noscript', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'canvas',
  'nav', 'footer', 'aside', 'object', 'embed', 'template', 'link', 'meta']);
const BLOCKS = 'p,div,section,article,ul,ol,li,h1,h2,h3,h4,h5,h6,blockquote,figure,table,pre,header,main';

function videoEmbed(src) {
  let m = /youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)([\w-]{6,})/.exec(src) || /youtu\.be\/([\w-]{6,})/.exec(src);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = /player\.vimeo\.com\/video\/(\d+)/.exec(src) || /vimeo\.com\/(\d+)/.exec(src);
  if (m) return 'https://player.vimeo.com/video/' + m[1];
  return '';
}

function sanitize(doc, root, base) {
  const walk = (node) => {
    Array.from(node.childNodes).forEach((ch) => {
      if (ch.nodeType === 8) { ch.remove(); return; } // comment
      if (ch.nodeType !== 1) return;
      let tag = ch.tagName.toLowerCase();
      if (DROP.has(tag)) { ch.remove(); return; }
      walk(ch);
      if (tag === 'h1') { const h = doc.createElement('h2'); while (ch.firstChild) h.appendChild(ch.firstChild); ch.replaceWith(h); return; }
      if (tag === 'h5' || tag === 'h6') { const h = doc.createElement('h4'); while (ch.firstChild) h.appendChild(ch.firstChild); ch.replaceWith(h); return; }
      if (tag === 'figcaption') {
        ch.querySelectorAll('p,div,h2,h3,h4,blockquote').forEach((b) => b.replaceWith(...Array.from(b.childNodes), doc.createTextNode(' ')));
        const p = doc.createElement('p'); const em = doc.createElement('em');
        while (ch.firstChild) em.appendChild(ch.firstChild); p.appendChild(em); ch.replaceWith(p); return;
      }
      if (tag === 'iframe') {
        const v = videoEmbed(abs(ch.getAttribute('src') || ch.getAttribute('data-src'), base));
        if (!v) { ch.remove(); return; }
        Array.from(ch.attributes).forEach((a) => ch.removeAttribute(a.name));
        ch.setAttribute('class', 'ql-video'); ch.setAttribute('frameborder', '0');
        ch.setAttribute('allowfullscreen', 'true'); ch.setAttribute('src', v); return;
      }
      if (!KEEP.has(tag)) {
        // div/section/ô bảng chỉ chứa chữ → thành đoạn văn; còn lại thì bóc vỏ, giữ ruột
        if (/^(div|section|article|dd|dt|address|center|td|th|caption)$/.test(tag) && !ch.querySelector(BLOCKS) && clean(ch.textContent)) {
          const p = doc.createElement('p'); while (ch.firstChild) p.appendChild(ch.firstChild); ch.replaceWith(p); return;
        }
        ch.replaceWith(...Array.from(ch.childNodes)); return;
      }
      // giữ thẻ, lọc thuộc tính
      Array.from(ch.attributes).forEach((a) => {
        const n = a.name.toLowerCase();
        if (tag === 'a' && n === 'href') return;
        if (tag === 'img' && (n === 'src' || n === 'alt')) return;
        ch.removeAttribute(a.name);
      });
      if (tag === 'a') {
        const h = abs(ch.getAttribute('href'), base);
        if (!h || /^#/.test(ch.getAttribute('href') || '')) { ch.replaceWith(...Array.from(ch.childNodes)); return; }
        ch.setAttribute('href', h); ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener');
      }
      if (tag === 'img') {
        const w = +(ch.getAttribute('width') || 0);
        if (!ch.getAttribute('src')) ch.remove();
        else if (w && w < 40) ch.remove();
      }
    });
  };
  walk(root);
  // Gom chữ/ảnh "trôi nổi" ở cấp ngoài cùng vào đoạn văn <p>
  const BLOCK_TOP = /^(p|h2|h3|h4|ul|ol|blockquote|pre|iframe)$/;
  let cur = null;
  Array.from(root.childNodes).forEach((n) => {
    const isBlock = n.nodeType === 1 && BLOCK_TOP.test(n.tagName.toLowerCase());
    if (isBlock) { cur = null; return; }
    if (n.nodeType === 3 && !clean(n.textContent)) { if (!cur) n.remove(); else cur.appendChild(n); return; }
    if (n.nodeType === 1 && n.tagName.toLowerCase() === 'br' && !cur) { n.remove(); return; }
    if (!cur) { cur = doc.createElement('p'); root.insertBefore(cur, n); }
    cur.appendChild(n);
  });
  // iframe video luôn đứng riêng (Quill coi video là khối)
  root.querySelectorAll('p > iframe.ql-video').forEach((f) => { const p = f.parentElement; p.parentElement.insertBefore(f, p); if (!clean(p.textContent) && !p.querySelector('img,iframe')) p.remove(); });
  // Bỏ đoạn rỗng
  root.querySelectorAll('p,h2,h3,h4,li,blockquote,strong,em,b,i').forEach((el) => {
    if (!clean(el.textContent) && !el.querySelector('img,iframe,br')) el.remove();
  });
}

// -------------------------------------------------- tải ảnh về kho của mình
async function rehost(sbUser, src, referer) {
  await assertPublicUrl(src);
  const { res, buf } = await fetchWithLimit(src, {
    headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
  }, MAX_IMG_BYTES, 15000);
  let type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^image\//.test(type)) {
    const ext0 = (/\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i.exec(src) || [])[1];
    if (!ext0) throw new Error('Không phải ảnh');
    type = 'image/' + (ext0.toLowerCase() === 'jpg' ? 'jpeg' : ext0.toLowerCase() === 'svg' ? 'svg+xml' : ext0.toLowerCase());
  }
  if (buf.length < 600) throw new Error('Ảnh quá nhỏ');
  const ext = ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' })[type] || type.split('/')[1].replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = FOLDER + '/imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const up = await sbUser.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true, cacheControl: '31536000' });
  if (up.error) throw up.error;
  return { path, url: sbUser.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } }
  }));
  return out;
}

// -------------------------------------------------- bóc bài từ HTML
function extract(html, pageUrl) {
  const { document: doc } = parseHTML(html);
  const base = abs((doc.querySelector('base[href]') || { getAttribute: () => '' }).getAttribute('href'), pageUrl) || pageUrl;

  const title = clean(meta(doc, ['og:title', 'twitter:title']) || (doc.querySelector('h1') || {}).textContent ||
    (doc.querySelector('title') || {}).textContent);
  let excerpt = clean(meta(doc, ['og:description', 'description', 'twitter:description']));
  const cover = abs(meta(doc, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image']), base);
  const siteName = clean(meta(doc, ['og:site_name', 'application-name'])) || new URL(pageUrl).hostname.replace(/^www\./, '');
  const published = meta(doc, ['article:published_time', 'pubdate', 'datePublished', 'date']);

  fixImages(doc, base);

  // Readability (bộ máy "chế độ đọc" của Firefox)
  let contentHtml = '';
  try {
    const { document: d2 } = parseHTML(doc.documentElement.outerHTML);
    const art = new Readability(d2, { charThreshold: 200, keepClasses: false }).parse();
    if (art && art.content && clean(art.textContent).length > 150) {
      contentHtml = art.content;
      if (!excerpt && art.excerpt) excerpt = clean(art.excerpt);
    }
  } catch (e) { /* rơi xuống phương án dự phòng */ }

  // Dự phòng: chọn khối nhiều chữ nhất trong các vùng nội dung quen thuộc
  if (!contentHtml) {
    const sels = ['[itemprop="articleBody"]', 'article', '.fck_detail', '.detail-content', '.detail__content', '.article-content',
      '.article__body', '.content-detail', '.news-content', '.entry-content', '.post-content', '#content', 'main', 'body'];
    let best = null, bl = 0;
    sels.forEach((s) => doc.querySelectorAll(s).forEach((el) => {
      const l = clean(el.textContent).length; if (l > bl) { bl = l; best = el; }
    }));
    contentHtml = best ? best.innerHTML : '';
  }

  const { document: d3 } = parseHTML('<!doctype html><html><body><div id="__root">' + contentHtml + '</div></body></html>');
  const root = d3.getElementById('__root');
  sanitize(d3, root, base);
  // Bỏ tiêu đề lặp lại ở đầu bài
  const first = root.querySelector('h2');
  if (first && clean(first.textContent) === title) first.remove();

  if (excerpt.length > 320) excerpt = excerpt.slice(0, 317).replace(/\s+\S*$/, '') + '…';
  if (!excerpt) {
    const p = Array.from(root.querySelectorAll('p')).map((x) => clean(x.textContent)).find((t) => t.length > 60) || '';
    excerpt = p.length > 320 ? p.slice(0, 317).replace(/\s+\S*$/, '') + '…' : p;
  }
  return { doc: d3, root, title, excerpt, cover, siteName, published };
}

// ================================================================== HANDLER
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    // 1) Xác thực: phải đăng nhập, role admin hoặc editor
    const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!token) { res.status(401).json({ error: 'Phiên đăng nhập đã hết — vui lòng đăng nhập lại.' }); return; }
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const who = await anon.auth.getUser(token);
    const user = who && who.data && who.data.user;
    if (!user) { res.status(401).json({ error: 'Phiên đăng nhập đã hết — vui lòng đăng nhập lại.' }); return; }
    const role = (user.user_metadata || {}).role || '';
    if (role !== 'admin' && role !== 'editor') { res.status(403).json({ error: 'Tài khoản chưa được cấp quyền đăng bài.' }); return; }
    // Client mang đúng quyền của người gọi → RLS cho phép ghi vào thư mục news/
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    });

    // 2) Tải trang gốc
    const raw = String(body.url || '').trim();
    const pageUrl = (await assertPublicUrl(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw)).href;
    let page;
    try {
      page = await fetchWithLimit(pageUrl, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
      }, MAX_PAGE_BYTES, 20000);
    } catch (e) {
      res.status(422).json({ error: 'Không mở được trang gốc (' + (e.message || e) + '). Trang có thể chặn truy cập tự động hoặc yêu cầu đăng nhập.' });
      return;
    }
    const finalUrl = page.res.url || pageUrl;
    const html = decodeHtml(page.buf, page.res.headers.get('content-type'));

    // 3) Bóc bài
    const a = extract(html, finalUrl);
    if (!a.title && !a.root.textContent.trim()) {
      res.status(422).json({ error: 'Không tìm thấy nội dung bài viết ở link này (trang có thể dựng bằng JavaScript hoặc cần đăng nhập, ví dụ Facebook/Zalo).' });
      return;
    }

    // 4) Tải ảnh về kho của mình
    const rehostImages = body.rehost !== false;
    const imgs = Array.from(a.root.querySelectorAll('img'));
    const srcs = [...new Set(imgs.map((i) => i.getAttribute('src')).filter(Boolean))].slice(0, MAX_IMAGES);
    let coverSrc = a.cover || srcs[0] || '';
    const all = [...new Set([coverSrc, ...srcs].filter(Boolean))];
    const map = {};
    let ok = 0, fail = 0;
    if (rehostImages && all.length) {
      const out = await pool(all, 6, (s) => rehost(sbUser, s, finalUrl));
      all.forEach((s, k) => { if (out[k]) { map[s] = out[k]; ok++; } else fail++; });
    }
    imgs.forEach((im) => { const m = map[im.getAttribute('src')]; if (m) im.setAttribute('src', m.url); });
    // Ảnh đại diện trùng ảnh đầu bài → bỏ bớt ảnh đầu bài cho đỡ lặp
    const firstImg = a.root.querySelector('img');
    if (firstImg && coverSrc && map[coverSrc] && firstImg.getAttribute('src') === map[coverSrc].url) {
      const par = firstImg.parentElement;
      firstImg.remove();
      if (par && par !== a.root && !clean(par.textContent) && !par.querySelector('img,iframe')) par.remove();
    }

    // 5) Dòng ghi nguồn (biên tập viên có thể xoá nếu muốn)
    const host = new URL(finalUrl).hostname.replace(/^www\./, '');
    const src = a.doc.createElement('p');
    src.innerHTML = '<em>Nguồn: <a href="' + finalUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener">' +
      (a.siteName || host).replace(/[<>&]/g, '') + '</a></em>';
    if (body.credit !== false) a.root.appendChild(src);

    const cover = coverSrc ? (map[coverSrc] || { url: coverSrc, path: '' }) : null;
    res.status(200).json({
      ok: true,
      source_url: finalUrl,
      site: a.siteName || host,
      published: a.published || '',
      title: a.title,
      excerpt: a.excerpt,
      cover_url: cover ? cover.url : '',
      cover_path: cover ? cover.path : '',
      content: a.root.innerHTML.trim(),
      images: { total: all.length, saved: ok, failed: fail },
    });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || String(e) });
  }
};

// Xuất riêng phần bóc bài để kiểm thử cục bộ
module.exports._extract = extract;
