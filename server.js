'use strict';
/*
 * ResolveAI server. Không cần cài thêm gói nào, chỉ cần Node 18 trở lên.
 *   node server.js            chạy server (mặc định cổng 3000)
 *   Kho dữ liệu còn trống thì tự nạp dữ liệu mẫu (đặt NO_DEMO=1 để tắt)
 *   node server.js adduser <tên đăng nhập> <mật khẩu> [tên hiển thị]
 *
 * Khách:      http://localhost:3000/
 * Quản trị:   http://localhost:3000/admin
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const os = require('os');
/* Chọn thư mục lưu dữ liệu: ưu tiên DATA_DIR hoặc ./data, nếu không ghi được (lỗi EPERM) thì dùng thư mục trong tài khoản người dùng */
function pickDataDir() {
  const first = process.env.DATA_DIR || path.join(__dirname, 'data');
  for (const dir of [first, path.join(os.homedir(), 'ResolveAI-data')]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const t = path.join(dir, '.write-test');
      fs.writeFileSync(t, 'ok'); fs.unlinkSync(t);
      if (dir !== first) console.log('[!] Không ghi được vào ' + first + ', dùng thư mục dữ liệu: ' + dir);
      return dir;
    } catch (e) { /* thử thư mục tiếp theo */ }
  }
  return first;
}
const DATA_DIR = pickDataDir();
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUB = path.join(__dirname, 'public');
const SESSION_MS = 12 * 3600 * 1000;

/* ---------------------------------------------------------------- storage */
const CATS = ['dientu', 'thoitrang', 'giadung', 'lamdep'];
const CAT_NAMES = { dientu: 'Điện tử và phụ kiện', thoitrang: 'Thời trang', giadung: 'Đồ gia dụng', lamdep: 'Làm đẹp và sức khỏe' };
const TYPE_NAMES = { tuvan: 'Tư vấn', khieunai: 'Khiếu nại', doitra: 'Đổi trả', baohanh: 'Bảo hành', kythuat: 'Hỗ trợ kỹ thuật' };
const STATUSES = ['moi', 'xuly', 'xong'];
const KINDS = ['FAQ', 'Chính sách', 'Hướng dẫn'];

function defaultKb() {
  const NOW = Date.now(), DAY = 864e5;
  return [
    { id: 'd1', cat: 'chung', title: 'Chính sách đổi trả', kind: 'Chính sách', kw: 'doi tra hoan tien tra hang', updated: NOW - 9 * DAY, content: 'Đổi trả trong 7 ngày kể từ khi nhận hàng nếu sản phẩm còn nguyên tem, nhãn và bao bì. Hàng lỗi do nhà sản xuất hoặc giao sai được đổi mới miễn phí. Mỹ phẩm, đồ lót và hàng xả kho không áp dụng đổi trả trừ khi bị lỗi. Hoàn tiền trong 3 đến 5 ngày làm việc sau khi nhận lại hàng.' },
    { id: 'd2', cat: 'chung', title: 'Chính sách bảo hành', kind: 'Chính sách', kw: 'bao hanh sua chua pin dien tu gia dung', updated: NOW - 21 * DAY, content: 'Hàng điện tử và đồ gia dụng điện được bảo hành 12 tháng theo chính sách nhà sản xuất, phụ kiện và pin được bảo hành 6 tháng. Thời trang và mỹ phẩm không bảo hành, chỉ đổi trả khi bị lỗi. Bảo hành không áp dụng khi hàng vào nước, rơi vỡ hoặc tự ý sửa chữa. Thời gian xử lý bảo hành từ 5 đến 7 ngày làm việc.' },
    { id: 'd3', cat: 'chung', title: 'Hướng dẫn xử lý lỗi thiết bị điện', kind: 'Hướng dẫn', kw: 'bluetooth ket noi reset khong len nguon sac cai dat', updated: NOW - 4 * DAY, content: 'Kiểm tra thiết bị đã sạc đầy và thử cáp hoặc củ sạc khác. Nếu không bật được, giữ nút nguồn 10 giây để khởi động lại. Với thiết bị Bluetooth, xóa thiết bị cũ khỏi danh sách rồi ghép lại. Để reset về cài đặt gốc, làm theo hướng dẫn in trong hộp sản phẩm.' },
    { id: 'd4', cat: 'chung', title: 'FAQ vận chuyển và thanh toán', kind: 'FAQ', kw: 'van chuyen giao hang phi ship thanh toan', updated: NOW - 30 * DAY, content: 'Đơn nội thành Hà Nội giao trong 1 đến 2 ngày, các tỉnh khác giao trong 3 đến 5 ngày. Miễn phí vận chuyển cho đơn từ 500.000 đồng. Khách có thể theo dõi đơn bằng mã vận đơn gửi qua tin nhắn SMS. Cửa hàng hỗ trợ thanh toán khi nhận hàng, chuyển khoản và thẻ.' },
    { id: 'd5', cat: 'thoitrang', title: 'Hướng dẫn chọn size thời trang', kind: 'Hướng dẫn', kw: 'tu van chon size ao quan giay dep nen mua giat', updated: NOW - 2 * DAY, content: 'Bảng size nằm ở mục Hướng dẫn chọn size trên từng sản phẩm, nếu nằm giữa hai size nên chọn size lớn hơn. Giày nên đo chiều dài bàn chân vào buổi chiều rồi cộng thêm 0,5 cm. Đồ vải cotton có thể co nhẹ sau lần giặt đầu, nên giặt ở 30 độ. Nhân viên có thể gợi ý phối đồ theo ngân sách của bạn.' },
    { id: 'd6', cat: 'giadung', title: 'Tư vấn chọn đồ gia dụng', kind: 'FAQ', kw: 'tu van chon noi chien may xay robot hut bui cong suat gia dinh', updated: NOW - 3 * DAY, content: 'Nồi chiên không dầu 4 lít phù hợp gia đình 2 đến 3 người, loại 6 lít phù hợp 4 đến 5 người. Máy xay sinh tố nên chọn công suất từ 500W trở lên để xay được đá và hạt. Robot hút bụi nên chọn loại có cảm biến chống rơi nếu nhà có cầu thang. Đồ gia dụng điện cần dùng đúng điện áp 220V và không để vào nước.' },
    { id: 'd7', cat: 'lamdep', title: 'Tư vấn mỹ phẩm theo loại da', kind: 'FAQ', kw: 'tu van my pham da dau da kho nhay cam kem duong chon', updated: NOW - 5 * DAY, content: 'Da dầu nên chọn sản phẩm dạng gel hoặc lotion không chứa dầu. Da khô nên chọn kem dưỡng có ceramide hoặc hyaluronic acid. Da nhạy cảm nên thử trước ở vùng da nhỏ và tránh sản phẩm có cồn hoặc hương liệu mạnh. Kiểm tra hạn sử dụng và thành phần trên bao bì trước khi dùng.' },
    { id: 'd8', cat: 'dientu', title: 'Tư vấn chọn thiết bị điện tử', kind: 'FAQ', kw: 'tu van chon tai nghe chong on sac du phong cap loa', updated: NOW - 6 * DAY, content: 'Tai nghe chống ồn phù hợp đi làm và di chuyển, tai nghe thể thao nên chọn loại có chuẩn chống nước IPX4 trở lên. Sạc dự phòng 10.000 mAh sạc được điện thoại khoảng 2 lần. Khi mua cáp sạc nên chọn loại có chứng nhận chính hãng để tránh chai pin.' }
  ];
}

function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function makeUser(username, password, name) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username, name: name || username, salt, hash: hashPw(password, salt) };
}

let db = null;
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = null; }
  if (!db) {
    db = { rev: 1, convSeq: 1000, tkSeq: 1000, kb: defaultKb(), convs: [], tickets: [], users: [], secret: crypto.randomBytes(32).toString('hex') };
    const pw = process.env.ADMIN_PASSWORD || 'admin123';
    db.users.push(makeUser('admin', pw, 'Nhân viên CSKH'));
    console.log('Đã tạo tài khoản quản trị: admin / ' + pw + (process.env.ADMIN_PASSWORD ? '' : '  (mật khẩu mặc định, hãy đổi bằng "node server.js adduser admin <mật khẩu mới>")'));
    if (process.env.NO_DEMO !== '1') require('./demo-seed')(db, crypto);
    flush();
  } else if (process.env.NO_DEMO !== '1' && !db.convs.length && !db.tickets.length) {
    /* kho đang trống (chưa có hội thoại hay phiếu nào): nạp dữ liệu mẫu */
    require('./demo-seed')(db, crypto);
    flush();
  }
}
let saveTimer = null;
function save() { db.rev++; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 200); }
function flush() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

if (process.argv[2] === 'adduser') {
  const [, , , u, p, n] = process.argv;
  if (!u || !p) { console.log('Cách dùng: node server.js adduser <tên đăng nhập> <mật khẩu> [tên hiển thị]'); process.exit(1); }
  loadDb();
  db.users = db.users.filter(x => x.username !== u);
  db.users.push(makeUser(u, p, n));
  flush();
  console.log('Đã lưu tài khoản ' + u);
  process.exit(0);
}
loadDb();

/* Mật khẩu admin cố định: mỗi lần khởi động đều đặt lại tài khoản admin về mật khẩu này */
const ADMIN_FIXED_PASSWORD = 'admin123';
{
  const old = db.users.find(x => x.username === 'admin');
  db.users = db.users.filter(x => x.username !== 'admin');
  db.users.push(makeUser('admin', ADMIN_FIXED_PASSWORD, old ? old.name : 'Nhân viên CSKH'));
  flush();
  console.log('[OK] Đã đặt mật khẩu admin cố định. Đăng nhập: admin / ' + ADMIN_FIXED_PASSWORD);
}

/* ------------------------------------------------------------------ agent */
const strip = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const STOP = new Set('ban minh cho toi la co khong the nao va cua de duoc nhu gi nhe voi em anh chi xin hoi shop muon bi thi nay do tai sao a oi ah ha ma hay vay'.split(' '));
const toks = s => [...new Set(strip(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP.has(w)))];

function search(q, cat) {
  const qt = toks(q);
  if (!qt.length) return null;
  let best = null;
  db.kb.forEach(d => {
    if (cat && d.cat !== 'chung' && d.cat !== cat) return;
    const head = new Set(toks(d.title + ' ' + (d.kw || ''))), body = new Set(toks(d.content));
    let sc = 0;
    qt.forEach(w => { if (head.has(w)) sc += 2; else if (body.has(w)) sc += 1; });
    if (!best || sc > best.score) best = { doc: d, score: sc };
  });
  if (!best || best.score < 3) return null;
  const sents = best.doc.content.split(/(?<=[.!?])\s+/).map((s, i) => ({ s, i, sc: toks(s).filter(w => qt.includes(w)).length }));
  const top = sents.slice().sort((a, b) => b.sc - a.sc).slice(0, 2).filter(x => x.sc > 0).sort((a, b) => a.i - b.i);
  return { doc: best.doc, score: best.score, text: (top.length ? top : sents.slice(0, 2)).map(x => x.s).join(' ') };
}

const RULES = {
  khieunai: ['khieu nai'],
  doitra: ['doi hang', 'doi tra', 'tra hang', 'hoan tien', 'doi size', 'doi mau', 'tra lai', 'doi sang', 'muon doi'],
  baohanh: ['bao hanh', 'sua chua', 'chai pin', 'bi re', 'bi hong', 'bi loi'],
  kythuat: ['khong ket noi', 'bluetooth', 'khong len', 'khong bat', 'khong sac', 'reset', 'cai dat', 'mat tieng', 'den do', 'khong nghe']
};
function classify(s) {
  let best = 'tuvan', bs = 0;
  for (const k of Object.keys(RULES)) { const n = RULES[k].filter(w => s.includes(w)).length; if (n > bs) { bs = n; best = k; } }
  return best;
}
const ANGRY = ['phan nan', 'te qua', 'qua te', 'that vong', 'buc minh', 'lua dao', 'khong hai long', 'qua do', 'thai do te'];
const HUMAN = ['gap nhan vien', 'nhan vien', 'nguoi that', 'tu van vien', 'gap nguoi'];
const YES = /(^|\s)(co|ok|oke|vang|duoc|dong y|tao|yes|u)(\s|$)/, NO = /(^|\s)(khong|thoi|khoi|no)(\s|$)/;

function say(c, from, text, extra) { c.messages.push(Object.assign({ from, text, t: Date.now() }, extra || {})); }
function handoff(c, reason, text) {
  c.status = 'waiting'; c.handoff = true; c.reason = reason; c.waitingSince = Date.now(); c.flow = null;
  say(c, 'ai', text || 'Mình chưa đủ thông tin để giải quyết việc này. Mình đã chuyển cuộc trò chuyện cho nhân viên CSKH, bạn vui lòng chờ trong giây lát nhé.');
}
function offer(c, type, summary) {
  c.flow = { step: 'offer', type, summary };
  say(c, 'ai', 'Bạn có muốn mình tạo phiếu ' + TYPE_NAMES[type].toLowerCase() + ' để nhân viên xử lý không? Trả lời “có” hoặc “không”.');
}
function createTicket(c, data, summary) {
  const tk = {
    id: 'TK-' + (db.tkSeq++), convId: c.id, type: c.type || 'tuvan', status: 'moi',
    customer: data.name, phone: data.phone, order: data.order || '',
    summary: summary || (c.messages.find(m => m.from === 'customer') || { text: '' }).text,
    createdAt: Date.now(), notes: []
  };
  db.tickets.unshift(tk); c.ticketId = tk.id; c.customer = { name: data.name, phone: data.phone };
  return tk;
}
function flowStep(c, text, s) {
  const f = c.flow;
  if (f.step === 'offer') {
    if (YES.test(s)) { f.step = 'name'; f.data = {}; say(c, 'ai', 'Cho mình xin họ tên của bạn.'); return; }
    if (NO.test(s)) { c.flow = null; say(c, 'ai', 'Được, mình chưa tạo phiếu. Cần gì thêm bạn cứ nhắn nhé.'); return; }
    c.flow = null; return agent(c, text);
  }
  if (f.step === 'name') { f.data.name = text.trim().slice(0, 40); f.step = 'phone'; say(c, 'ai', 'Cảm ơn ' + f.data.name + '. Số điện thoại để nhân viên liên hệ là gì?'); return; }
  if (f.step === 'phone') {
    const d = text.replace(/\D/g, '');
    if (d.length < 9 || d.length > 11) { say(c, 'ai', 'Số điện thoại chưa đúng, bạn nhập lại giúp mình (9 đến 11 chữ số).'); return; }
    f.data.phone = d; f.step = 'order'; say(c, 'ai', 'Bạn cho mình mã đơn hàng nếu có, ví dụ GA20431. Nếu chưa có, gõ “bỏ qua”.'); return;
  }
  if (f.step === 'order') {
    f.data.order = /(^|\s)(bo qua|khong co|chua co)/.test(s) ? '' : text.trim().toUpperCase().slice(0, 20);
    const tk = createTicket(c, f.data, f.summary); c.flow = null;
    say(c, 'ai', 'Mình đã ghi nhận yêu cầu của bạn. Nhân viên sẽ liên hệ qua số ' + tk.phone + ' trong vòng 24 giờ làm việc.', { ticket: tk.id });
  }
}
/* Điểm gắn mô hình thật: thay thân hàm này bằng lời gọi Claude API, giữ nguyên các hàm say/handoff/offer/createTicket. */
function agent(c, text) {
  const s = strip(text);
  if (c.flow) return flowStep(c, text, s);
  if (ANGRY.some(w => s.includes(w))) { c.type = 'khieunai'; return handoff(c, 'Khách phàn nàn', 'Mình rất tiếc vì trải nghiệm chưa tốt của bạn. Mình đã chuyển cuộc trò chuyện cho nhân viên CSKH để xử lý ngay, bạn vui lòng chờ trong giây lát.'); }
  if (HUMAN.some(w => s.includes(w))) { c.type = c.type || classify(s); return handoff(c, 'Khách yêu cầu gặp nhân viên', 'Mình đã chuyển bạn cho nhân viên CSKH. Bạn vui lòng chờ trong giây lát nhé.'); }
  if (/^(xin chao|chao|hello|hi|alo)(\s|$)/.test(s) && s.split(' ').length <= 4) {
    say(c, 'ai', c.cat ? 'Chào bạn, mình là trợ lý ' + CAT_NAMES[c.cat].split(' ')[0] + ' của Chợ Gió. Bạn cần tư vấn ' + CAT_NAMES[c.cat].toLowerCase() + ', đổi trả, bảo hành hay hỗ trợ kỹ thuật?' : 'Chào bạn, mình là trợ lý ResolveAI của Chợ Gió. Bạn cần tư vấn sản phẩm, đổi trả, bảo hành hay hỗ trợ kỹ thuật?');
    return;
  }
  const type = classify(s);
  if (!c.type || c.type === 'tuvan') c.type = type;
  const hit = search(text, c.cat);
  if (type === 'tuvan') {
    if (hit) say(c, 'ai', hit.text, { src: hit.doc.title });
    else handoff(c, 'Không tìm thấy trong kho tài liệu');
    return;
  }
  if (hit) { say(c, 'ai', hit.text, { src: hit.doc.title }); offer(c, type, text); return; }
  if (type === 'khieunai') { say(c, 'ai', 'Mình rất tiếc về việc này. Mình sẽ ghi nhận khiếu nại của bạn.'); offer(c, type, text); return; }
  handoff(c, 'Không tìm thấy trong kho tài liệu');
}

/* ------------------------------------------------------------------ http */
const rates = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); const r = rates.get(key) || [];
  const recent = r.filter(t => now - t < windowMs);
  recent.push(now); rates.set(key, recent);
  return recent.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of rates) if (!v.some(t => now - t < 600000)) rates.delete(k); }, 60000).unref();

function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 200000) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}
const b64 = b => Buffer.from(b).toString('base64url');
function sign(payload) { const p = b64(JSON.stringify(payload)); return p + '.' + crypto.createHmac('sha256', db.secret).update(p).digest('base64url'); }
function verify(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [p, sig] = tok.split('.');
  const exp = crypto.createHmac('sha256', db.secret).update(p).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const v = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return v.exp > Date.now() ? v : null; } catch (e) { return null; }
}
function session(req) {
  /* KHÔNG CẦN ĐĂNG NHẬP: ai mở /admin cũng vào thẳng giao diện quản trị */
  return { u: 'admin', name: 'Quản trị viên', exp: Date.now() + SESSION_MS };
}
const ip = req => req.socket.remoteAddress || '?';

function publicConv(c) {
  return {
    id: c.id, status: c.status, cat: c.cat || null,
    messages: c.messages.map(m => {
      const o = { from: m.from, text: m.text, t: m.t };
      if (m.src) o.src = m.src;
      if (m.ticket) { const t = db.tickets.find(x => x.id === m.ticket); if (t) o.ticketInfo = { id: t.id, type: t.type, order: t.order }; }
      return o;
    })
  };
}
const idOk = s => typeof s === 'string' && /^[a-f0-9]{16,64}$/.test(s);

async function handleApi(req, res, url) {
  const method = req.method, p = url.pathname;

  /* ---- khách: không cần đăng nhập ---- */
  if (p === '/api/chat/message' && method === 'POST') {
    if (limited('msg:' + ip(req), 40, 60000)) return send(res, 429, { error: 'Bạn gửi quá nhanh, vui lòng chờ một chút.' });
    const b = await readBody(req);
    const text = typeof b.text === 'string' ? b.text.trim().slice(0, 1000) : '';
    if (!text) return send(res, 400, { error: 'Tin nhắn trống.' });
    let c = idOk(b.id) ? db.convs.find(x => x.id === b.id) : null;
    if (c && c.status === 'closed') c = null;
    if (!c) {
      if (limited('new:' + ip(req), 20, 3600000)) return send(res, 429, { error: 'Quá nhiều cuộc trò chuyện mới, vui lòng thử lại sau.' });
      c = { id: crypto.randomBytes(12).toString('hex'), num: db.convSeq++, customer: null, type: null, cat: CATS.includes(b.cat) ? b.cat : null, status: 'ai', handoff: false, createdAt: Date.now(), messages: [], flow: null, warned: false };
      db.convs.push(c);
    }
    say(c, 'customer', text);
    if (c.status === 'waiting') {
      if (!c.warned) { c.warned = true; say(c, 'system', 'Nhân viên sẽ trả lời bạn tại đây.'); }
    } else if (c.status === 'ai') {
      agent(c, text);
    }
    save();
    return send(res, 200, publicConv(c));
  }
  let m = /^\/api\/chat\/([a-f0-9]+)$/.exec(p);
  if (m && method === 'GET') {
    if (limited('poll:' + ip(req), 120, 60000)) return send(res, 429, { error: 'Quá nhiều yêu cầu.' });
    const c = idOk(m[1]) ? db.convs.find(x => x.id === m[1]) : null;
    return c ? send(res, 200, publicConv(c)) : send(res, 404, { error: 'Không tìm thấy hội thoại.' });
  }

  /* ---- đăng nhập CSKH ---- */
  if (p === '/api/admin/login' && method === 'POST') {
    if (limited('login:' + ip(req), 10, 600000)) return send(res, 429, { error: 'Thử đăng nhập quá nhiều lần, vui lòng chờ 10 phút.' });
    const b = await readBody(req);
    const u = db.users.find(x => x.username === String(b.username || ''));
    const calc = hashPw(String(b.password || ''), u ? u.salt : 'x'.repeat(32));
    const ok = u && crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(u.hash));
    if (!ok) return send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    const tok = sign({ u: u.username, name: u.name, exp: Date.now() + SESSION_MS });
    return send(res, 200, { name: u.name }, { 'Set-Cookie': 'ra_sid=' + tok + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESSION_MS / 1000 });
  }
  if (p === '/api/admin/logout' && method === 'POST') return send(res, 200, {}, { 'Set-Cookie': 'ra_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });

  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'Không tìm thấy.' });
  const me = session(req);
  if (!me) return send(res, 401, { error: 'Chưa đăng nhập.' });
  if (method !== 'GET' && (req.headers['content-type'] || '').indexOf('application/json') < 0 && method !== 'DELETE' && !/\/(take|close)$/.test(p)) return send(res, 415, { error: 'Sai định dạng.' });

  /* ---- CSKH ---- */
  if (p === '/api/admin/me') return send(res, 200, { name: me.name });
  if (p === '/api/admin/state' && method === 'GET') {
    if (String(db.rev) === url.searchParams.get('rev')) return send(res, 200, { unchanged: true });
    return send(res, 200, { rev: db.rev, name: me.name, kb: db.kb, tickets: db.tickets, convs: db.convs.slice(-1000).map(({ flow, ...c }) => c) });
  }
  m = /^\/api\/admin\/convs\/([a-f0-9]+)\/(take|close|reply|ticket)$/.exec(p);
  if (m && method === 'POST') {
    const c = db.convs.find(x => x.id === m[1]);
    if (!c) return send(res, 404, { error: 'Không tìm thấy hội thoại.' });
    const act = m[2];
    if (act === 'take') {
      if (c.status !== 'waiting') return send(res, 409, { error: 'Hội thoại này không còn ở hàng đợi.' });
      c.status = 'staff'; c.staff = me.name; say(c, 'system', me.name + ' đã tham gia hội thoại.');
    } else if (act === 'close') {
      if (c.status === 'closed') return send(res, 409, { error: 'Hội thoại đã đóng.' });
      c.status = 'closed'; say(c, 'system', 'Hội thoại đã được đóng.');
    } else if (act === 'reply') {
      if (c.status !== 'staff') return send(res, 409, { error: 'Hãy nhận hội thoại trước khi trả lời.' });
      const b = await readBody(req); const text = typeof b.text === 'string' ? b.text.trim().slice(0, 2000) : '';
      if (!text) return send(res, 400, { error: 'Tin nhắn trống.' });
      say(c, 'staff', text);
    } else if (act === 'ticket') {
      if (c.ticketId) return send(res, 409, { error: 'Hội thoại đã có phiếu ' + c.ticketId + '.' });
      const tk = createTicket(c, { name: c.customer ? c.customer.name : 'Khách #' + c.num, phone: c.customer ? c.customer.phone : 'Chưa có', order: '' });
      save(); return send(res, 200, { ticket: tk.id });
    }
    save();
    return send(res, 200, { ok: true });
  }
  m = /^\/api\/admin\/tickets\/(TK-\d+)$/.exec(p);
  if (m && method === 'PATCH') {
    const t = db.tickets.find(x => x.id === m[1]);
    if (!t) return send(res, 404, { error: 'Không tìm thấy phiếu.' });
    const b = await readBody(req);
    const status = STATUSES.includes(b.status) ? b.status : t.status;
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
    if (status === t.status && !note) return send(res, 400, { error: 'Không có thay đổi.' });
    t.status = status; t.notes.push({ t: Date.now(), status, text: note || 'Cập nhật trạng thái.', by: me.name });
    save(); return send(res, 200, { ok: true });
  }
  function readDoc(b) {
    const d = { title: String(b.title || '').trim().slice(0, 120), kind: KINDS.includes(b.kind) ? b.kind : 'FAQ', cat: b.cat === 'chung' || CATS.includes(b.cat) ? b.cat : 'chung', content: String(b.content || '').trim().slice(0, 20000) };
    return d.title && d.content ? d : null;
  }
  if (p === '/api/admin/kb' && method === 'POST') {
    const d = readDoc(await readBody(req));
    if (!d) return send(res, 400, { error: 'Cần có tên và nội dung tài liệu.' });
    const doc = Object.assign({ id: 'd' + crypto.randomBytes(5).toString('hex'), kw: '', updated: Date.now() }, d);
    db.kb.unshift(doc); save(); return send(res, 200, { id: doc.id });
  }
  if (p === '/api/admin/kb/test' && method === 'POST') {
    const b = await readBody(req);
    const r = search(String(b.q || ''), CATS.includes(b.cat) ? b.cat : null);
    return send(res, 200, r ? { title: r.doc.title, text: r.text, score: r.score } : { none: true });
  }
  m = /^\/api\/admin\/kb\/([A-Za-z0-9]+)$/.exec(p);
  if (m && (method === 'PUT' || method === 'DELETE')) {
    const i = db.kb.findIndex(x => x.id === m[1]);
    if (i < 0) return send(res, 404, { error: 'Không tìm thấy tài liệu.' });
    if (method === 'DELETE') { db.kb.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    const d = readDoc(await readBody(req));
    if (!d) return send(res, 400, { error: 'Cần có tên và nội dung tài liệu.' });
    Object.assign(db.kb[i], d, { updated: Date.now() }); save(); return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Không tìm thấy.' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGES = { '/': 'customer.html', '/admin': 'admin.html' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const page = PAGES[url.pathname];
    if (page && req.method === 'GET') {
      const f = path.join(PUB, page);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return fs.createReadStream(f).pipe(res);
    }
    send(res, 404, { error: 'Không tìm thấy trang.' });
  } catch (e) {
    if (e.message === 'bad_json' || e.message === 'too_large') return send(res, 400, { error: 'Dữ liệu gửi lên không hợp lệ.' });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Lỗi máy chủ.' });
  }
});
server.listen(PORT, HOST, () => {
  console.log('ResolveAI đang chạy.');
  console.log('  Khách hàng : http://localhost:' + PORT + '/');
  console.log('  Quản trị   : http://localhost:' + PORT + '/admin');
});
function bye() { try { flush(); } catch (e) { /* ignore */ } process.exit(0); }
process.on('SIGINT', bye); process.on('SIGTERM', bye);
