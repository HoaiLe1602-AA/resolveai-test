'use strict';
/* Nạp dữ liệu mẫu để trang quản trị có số liệu. Chỉ chạy với: node server.js --demo (khi kho dữ liệu còn trống). */
module.exports = function seedDemo(db, crypto) {
  const NOW = Date.now(), DAY = 864e5;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const id = () => crypto.randomBytes(12).toString('hex');
  const NAMES = ['Nguyễn Thu Hà', 'Trần Minh Quân', 'Lê Hoàng Yến', 'Phạm Đức Long', 'Vũ Ngọc Lan', 'Đặng Quốc Bảo', 'Bùi Thanh Tâm', 'Hoàng Gia Hân'];
  const PHONES = NAMES.map(() => '09' + String(Math.floor(rnd() * 1e8)).padStart(8, '0'));
  const CK = ['dientu', 'thoitrang', 'giadung', 'lamdep'];
  const SAMPLE = {
    tuvan: ['Chọn size áo thế nào nếu mình nằm giữa hai size?', 'Nồi chiên không dầu loại nào cho gia đình 3 người?'],
    khieunai: ['Mình muốn khiếu nại vì đơn giao thiếu một món.', 'Mình muốn khiếu nại vì sản phẩm khác với mô tả.'],
    doitra: ['Mình muốn đổi áo sang size lớn hơn được không?', 'Cho mình trả hàng và hoàn tiền đơn tuần trước.'],
    baohanh: ['Nồi chiên bị hỏng nút bấm, còn bảo hành không?', 'Pin sạc dự phòng chai nhanh, cho mình bảo hành.'],
    kythuat: ['Tai nghe không kết nối được Bluetooth.', 'Máy hút bụi không lên nguồn.']
  };
  const closed = [];
  for (let i = 0; i < 70; i++) {
    const day = Math.floor(rnd() * 14), r = rnd();
    const type = r < .34 ? 'tuvan' : r < .54 ? 'kythuat' : r < .70 ? 'doitra' : r < .86 ? 'baohanh' : 'khieunai';
    const handoff = rnd() < (type === 'khieunai' ? .8 : .22);
    const ni = rnd() < .6 ? Math.floor(rnd() * NAMES.length) : -1;
    const t = sod(NOW) - day * DAY + (8 + Math.floor(rnd() * 11)) * 36e5 + Math.floor(rnd() * 36e5);
    const cat = CK[Math.floor(rnd() * 4)];
    const samp = SAMPLE[type][Math.floor(rnd() * 2)];
    if (t > NOW - 6e4) continue;
    const c = {
      id: id(), num: db.convSeq++, customer: ni >= 0 ? { name: NAMES[ni], phone: PHONES[ni] } : null, type, cat, status: 'closed', handoff, createdAt: t,
      messages: [{ from: 'customer', text: samp, t }, { from: handoff ? 'staff' : 'ai', text: handoff ? 'Chào bạn, mình đã nhận thông tin và xử lý giúp bạn ngay.' : 'Mình đã trả lời theo tài liệu của cửa hàng. Bạn cần hỗ trợ thêm gì không?', t: t + 9e4 }]
    };
    db.convs.push(c); closed.push(c);
  }
  const STS = ['xong', 'xong', 'xuly', 'moi', 'xuly', 'moi', 'xong'];
  const pool = closed.filter(c => c.type !== 'tuvan' && !c.handoff).slice(-7);
  pool.forEach((c, i) => {
    if (!c.customer) c.customer = { name: NAMES[i % NAMES.length], phone: PHONES[i % NAMES.length] };
    const tk = { id: 'TK-' + (db.tkSeq++), convId: c.id, type: c.type, status: STS[i], customer: c.customer.name, phone: c.customer.phone, order: rnd() < .7 ? 'GA' + (20000 + Math.floor(rnd() * 9000)) : '', summary: c.messages[0].text, createdAt: c.createdAt + 12e4, notes: [] };
    if (tk.status !== 'moi') tk.notes.push({ t: tk.createdAt + 36e5, status: 'xuly', text: 'Đã liên hệ khách để xác nhận thông tin.', by: 'Nhân viên CSKH' });
    if (tk.status === 'xong') tk.notes.push({ t: tk.createdAt + 30 * 36e5, status: 'xong', text: 'Đã xử lý xong, khách xác nhận hài lòng.', by: 'Nhân viên CSKH' });
    c.ticketId = tk.id; db.tickets.unshift(tk);
  });
  db.tickets.sort((a, b) => b.createdAt - a.createdAt);
  [
    { type: 'baohanh', cat: 'giadung', who: 3, min: 14, reason: 'Ngoài phạm vi tài liệu', m: [['customer', 'Máy xay sinh tố mình mua cách đây 14 tháng bị cháy motor, giờ xử lý sao?'], ['ai', 'Mình chưa tìm thấy chính sách cho trường hợp đã quá 12 tháng bảo hành. Mình chuyển cho nhân viên CSKH hỗ trợ bạn nhé.']] },
    { type: 'khieunai', cat: null, who: 5, min: 6, reason: 'Khách phàn nàn', m: [['customer', 'Đơn của mình giao trễ 5 ngày mà không ai báo, quá tệ.'], ['ai', 'Mình rất tiếc về trải nghiệm này. Mình đã chuyển cuộc trò chuyện cho nhân viên để xử lý ngay.']] },
    { type: 'kythuat', cat: 'giadung', who: -1, min: 2, reason: 'Không tìm thấy trong kho tài liệu', m: [['customer', 'Robot hút bụi báo lỗi E07 liên tục, phải làm sao?'], ['ai', 'Mình chưa có hướng dẫn về mã lỗi E07 của robot hút bụi. Mình chuyển cho nhân viên kỹ thuật nhé.']] }
  ].forEach(s => {
    const t = NOW - s.min * 6e4;
    db.convs.push({ id: id(), num: db.convSeq++, customer: s.who >= 0 ? { name: NAMES[s.who], phone: PHONES[s.who] } : null, type: s.type, cat: s.cat, status: 'waiting', handoff: true, reason: s.reason, waitingSince: t, createdAt: t - 6e4, messages: s.m.map((x, i) => ({ from: x[0], text: x[1], t: t - 6e4 + i * 3e4 })) });
  });
};
