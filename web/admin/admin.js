// Nội dung động chỉ gắn bằng textContent (chống XSS). Không dùng innerHTML.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var cur = { queue: null, ticket: null, history: null, kb: null }, tab = "queue", timer = null;
  var ROLE = { customer: "Khách", ai: "AI", staff: "Nhân viên", system: "" };
  var NEXT = { "Mới": "Đang xử lý", "Đang xử lý": "Đã hoàn thành" };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function toast(t, ok) { var b = $("toast"); b.textContent = t; b.className = "toast" + (ok ? " ok" : ""); b.hidden = false; setTimeout(function () { b.hidden = true; }, 4000); }

  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && url.indexOf("/login") < 0) { showLogin(); throw new Error("401"); }
          if (!r.ok) { var e = new Error((j.error && j.error.message) || "Lỗi"); e.status = r.status; e.code = j.error && j.error.code; throw e; }
          return j;
        });
      });
  }
  function fail(e) { if (e.message !== "401") toast(e.message); }

  function showLogin() { $("app").hidden = true; $("login").hidden = false; stop(); }
  function showApp() { $("login").hidden = true; $("app").hidden = false; setTab("queue"); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("loginErr").textContent = "";
    api("POST", "/api/admin/login", { username: $("u").value, password: $("p").value })
      .then(function () { $("p").value = ""; showApp(); })
      .catch(function (er) { $("loginErr").textContent = er.message; });
  });
  $("logout").addEventListener("click", function () { api("POST", "/api/admin/logout").then(showLogin).catch(showLogin); });
  $("tabs").addEventListener("click", function (e) { if (e.target.dataset.tab) setTab(e.target.dataset.tab); });

  function setTab(t) {
    tab = t;
    ["queue", "tickets", "history", "dash", "kb"].forEach(function (n) { $("tab-" + n).hidden = n !== t; });
    Array.prototype.forEach.call($("tabs").children, function (b) { b.classList.toggle("on", b.dataset.tab === t); });
    if (t === "kb") loadKb();
    refresh(); stop(); timer = setInterval(refresh, 5000);
  }
  function refresh() {
    if (tab === "queue") { loadQueue(); if (cur.queue) loadConv(cur.queue, $("conv"), true); }
    else if (tab === "tickets") loadTickets();
    else if (tab === "history") loadHistory();
    else if (tab === "dash") loadDash();
  }

  // ---- Hàng đợi + hội thoại
  function loadQueue() {
    api("GET", "/api/admin/queue").then(function (d) {
      var box = $("queueList"); clear(box);
      if (!d.items.length) box.appendChild(el("p", "muted", "Hàng đợi trống."));
      d.items.forEach(function (it) {
        var n = el("div", "item" + (it.session_id === cur.queue ? " sel" : ""));
        n.appendChild(el("div", null, (it.intent || "Chưa phân loại") + " · " + it.handoff_reason));
        n.appendChild(el("small", null, (it.last_customer_message || "") + " — " + it.handoff_at));
        n.addEventListener("click", function () { cur.queue = it.session_id; loadQueue(); loadConv(it.session_id, $("conv"), true); });
        box.appendChild(n);
      });
    }).catch(fail);
  }
  function renderMsgs(list) {
    var box = el("div", "msgs");
    list.forEach(function (m) {
      var d = el("div", "m " + m.role);
      if (ROLE[m.role]) d.appendChild(el("b", null, ROLE[m.role]));
      d.appendChild(document.createTextNode(m.text));
      box.appendChild(d);
    });
    return box;
  }
  function loadConv(id, target, actions) {
    api("GET", "/api/admin/sessions/" + encodeURIComponent(id)).then(function (d) {
      var prev = target.querySelector("input.reply"), draft = prev ? prev.value : "", focus = prev && document.activeElement === prev;
      clear(target);
      var head = el("div", "row");
      head.appendChild(el("span", "pill", d.status)); head.appendChild(el("span", null, (d.intent || "Chưa phân loại") + (d.handoff_reason ? " · " + d.handoff_reason : "")));
      target.appendChild(head);
      if (d.tickets.length) target.appendChild(el("div", "muted", "Ticket liên quan: " + d.tickets.map(function (t) { return t.id + " (" + t.status + ")"; }).join(", ")));
      if (d.sources.length) target.appendChild(el("div", "muted", "Nguồn đã dùng: " + d.sources.map(function (s) { return s.title; }).join("; ")));
      var msgs = renderMsgs(d.messages); target.appendChild(msgs); msgs.scrollTop = msgs.scrollHeight;
      if (!actions) return;
      var row = el("div", "row");
      if (d.status === "Waiting_Agent") {
        var b = el("button", "primary", "Tiếp nhận"); b.addEventListener("click", function () { b.disabled = true; api("POST", "/api/admin/sessions/" + id + "/claim").then(function () { loadQueue(); loadConv(id, target, true); }).catch(function (e) { fail(e); loadQueue(); loadConv(id, target, true); }); });
        row.appendChild(b);
      } else if (d.status === "Agent_Handling") {
        var inp = el("input", "reply"); inp.placeholder = "Nhập phản hồi..."; inp.maxLength = 1000; inp.value = draft;
        var send = el("button", "primary", "Gửi"), end = el("button", null, "Kết thúc");
        function go() { var t = inp.value.trim(); if (!t) return; send.disabled = true; api("POST", "/api/admin/sessions/" + id + "/messages", { text: t }).then(function () { loadConv(id, target, true); }).catch(function (e) { fail(e); send.disabled = false; }); }
        send.addEventListener("click", go); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
        end.addEventListener("click", function () { api("POST", "/api/admin/sessions/" + id + "/close").then(function () { cur.queue = null; clear(target); target.appendChild(el("p", "muted", "Đã kết thúc phiên.")); loadQueue(); }).catch(fail); });
        row.appendChild(inp); row.appendChild(send); row.appendChild(end);
        if (focus) setTimeout(function () { inp.focus(); }, 0);
      }
      target.appendChild(row);
    }).catch(fail);
  }

  // ---- Ticket
  function loadTickets() {
    var q = []; if ($("fStatus").value) q.push("status=" + encodeURIComponent($("fStatus").value)); if ($("fType").value) q.push("type=" + encodeURIComponent($("fType").value));
    api("GET", "/api/admin/tickets?" + q.join("&")).then(function (d) {
      var box = $("ticketList"); clear(box);
      if (!d.items.length) box.appendChild(el("p", "muted", "Không có Ticket."));
      d.items.forEach(function (t) {
        var n = el("div", "item" + (t.id === cur.ticket ? " sel" : ""));
        n.appendChild(el("div", null, t.id + " · " + t.type)); n.appendChild(el("small", null, t.status + " — " + (t.customer_name || "")));
        n.addEventListener("click", function () { cur.ticket = t.id; showTicket(t.id); loadTickets(); });
        box.appendChild(n);
      });
    }).catch(fail);
  }
  $("fStatus").addEventListener("change", loadTickets); $("fType").addEventListener("change", loadTickets);
  function showTicket(id) {
    api("GET", "/api/admin/tickets/" + encodeURIComponent(id)).then(function (t) {
      var box = $("ticketDetail"); clear(box);
      box.appendChild(el("h3", null, t.id + " · " + t.type + " · " + t.status));
      var kv = el("dl", "kv");
      [["Khách", t.customer_name], ["Liên hệ", t.contact], ["Mã đơn", t.order_id], ["Sản phẩm", t.product], ["Mô tả", t.description], ["Tạo lúc", t.created_at]].forEach(function (p) {
        if (p[1]) { kv.appendChild(el("dt", null, p[0])); kv.appendChild(el("dd", null, p[1])); }
      });
      box.appendChild(kv);
      box.appendChild(el("h4", null, "Lịch sử"));
      t.history.forEach(function (h) { box.appendChild(el("div", "muted", h.created_at + " · " + (h.old_status || "—") + " → " + h.new_status + (h.note ? " · " + h.note : ""))); });
      var nx = NEXT[t.status];
      if (nx) {
        var row = el("div", "row"), note = el("input"); note.placeholder = nx === "Đã hoàn thành" ? "Ghi chú kết quả (bắt buộc)" : "Ghi chú (không bắt buộc)";
        var b = el("button", "primary", "Chuyển sang: " + nx);
        b.addEventListener("click", function () { api("PATCH", "/api/admin/tickets/" + encodeURIComponent(id) + "/status", { status: nx, note: note.value }).then(function () { showTicket(id); loadTickets(); }).catch(fail); });
        row.appendChild(note); row.appendChild(b); box.appendChild(row);
      }
    }).catch(fail);
  }

  // ---- Lịch sử
  function loadHistory() {
    var s = $("hStatus").value;
    api("GET", "/api/admin/sessions" + (s ? "?status=" + encodeURIComponent(s) : "")).then(function (d) {
      var box = $("historyList"); clear(box);
      if (!d.items.length) box.appendChild(el("p", "muted", "Chưa có phiên."));
      d.items.forEach(function (it) {
        var n = el("div", "item" + (it.session_id === cur.history ? " sel" : ""));
        n.appendChild(el("div", null, it.status + " · " + (it.intent || "Chưa phân loại"))); n.appendChild(el("small", null, it.updated_at));
        n.addEventListener("click", function () { cur.history = it.session_id; loadConv(it.session_id, $("historyDetail"), false); loadHistory(); });
        box.appendChild(n);
      });
    }).catch(fail);
  }
  $("hStatus").addEventListener("change", loadHistory);

  // ---- Chính sách (kho tri thức của chatbot)
  function kbForm(d) {
    cur.kb = d ? d.id : null;
    $("kbTitle").value = d ? d.title : ""; $("kbContent").value = d ? d.content : "";
    $("kbHead").textContent = d ? "Sửa chính sách" : "Thêm chính sách mới"; $("kbDel").hidden = !d;
  }
  function loadKb() {
    api("GET", "/api/admin/kb/docs").then(function (d) {
      var box = $("kbList"); clear(box);
      if (!d.items.length) box.appendChild(el("p", "muted", "Chưa có chính sách nào."));
      d.items.forEach(function (it) {
        var n = el("div", "item" + (it.id === cur.kb ? " sel" : ""));
        n.appendChild(el("div", null, it.title)); n.appendChild(el("small", "snip", it.content));
        n.addEventListener("click", function () { kbForm(it); loadKb(); });
        box.appendChild(n);
      });
    }).catch(fail);
  }
  $("kbNew").addEventListener("click", function () { kbForm(null); loadKb(); });
  $("kbSave").addEventListener("click", function () {
    var body = { title: $("kbTitle").value, content: $("kbContent").value }, id = cur.kb;
    api(id ? "PUT" : "POST", "/api/admin/kb/docs" + (id ? "/" + id : ""), body)
      .then(function (r) { toast("Đã lưu chính sách.", true); cur.kb = r.id; $("kbHead").textContent = "Sửa chính sách"; $("kbDel").hidden = false; loadKb(); }).catch(fail);
  });
  $("kbDel").addEventListener("click", function () {
    if (!cur.kb || !confirm("Xóa chính sách này? Chatbot sẽ không còn trả lời theo nội dung đó.")) return;
    api("DELETE", "/api/admin/kb/docs/" + cur.kb).then(function () { toast("Đã xóa.", true); kbForm(null); loadKb(); }).catch(fail);
  });

  // ---- Thống kê
  function loadDash() {
    api("GET", "/api/admin/dashboard").then(function (d) {
      var box = $("dash"); clear(box);
      function card(label, value) { var c = el("div", "card"); c.appendChild(el("div", "muted", label)); c.appendChild(el("div", "n", String(value))); box.appendChild(c); }
      card("Tổng số phiên", d.total_sessions);
      card("Tỷ lệ AI tự giải quyết", d.ai_self_resolved_rate == null ? "—" : Math.round(d.ai_self_resolved_rate * 100) + "%");
      card("Độ trễ TB của AI (ms)", d.avg_latency_ms == null ? "—" : d.avg_latency_ms);
      Object.keys(d.tickets_by_status).forEach(function (k) { card("Ticket: " + k, d.tickets_by_status[k]); });
      Object.keys(d.intent_distribution).forEach(function (k) { card("Intent: " + k, d.intent_distribution[k]); });
    }).catch(fail);
  }

  api("GET", "/api/admin/me").then(function (me) { $("logout").hidden = !me.auth_required; showApp(); }).catch(function () { showLogin(); });
})();
