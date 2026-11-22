/* Nút chatbot nhúng: chèn 1 dòng vào bất kỳ trang web nào
 *   <script src="https://<máy-chủ-resolveai>/widget/widget.js" defer></script>
 * Khung chat chạy trong iframe từ chính máy chủ ResolveAI nên không dính CORS và không đụng CSS của trang chủ.
 */
(function () {
  "use strict";
  if (window.__savaniChat) return; window.__savaniChat = true;
  var cs = document.currentScript, base = "";
  try { base = new URL(cs.src).origin; } catch (e) { base = location.origin; }
  if (base === "null" || base.indexOf("http") !== 0) base = "http://localhost:8000";

  var css = [
    ".svn-w{position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".svn-fab{width:64px;height:64px;border-radius:50%;border:0;padding:0;cursor:pointer;background:#c8102e;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;transition:transform .15s}",
    ".svn-fab:hover{transform:scale(1.06)}",
    ".svn-fab:focus-visible{outline:3px solid #111;outline-offset:3px}",
    ".svn-fab svg{width:38px;height:38px}",
    ".svn-dot{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff}",
    ".svn-tip{position:absolute;right:76px;bottom:10px;background:#fff;color:#111;padding:10px 14px;border-radius:14px 14px 4px 14px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:14px;line-height:1.35;width:210px;cursor:pointer}",
    ".svn-tip button{position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;border:0;background:#111;color:#fff;font-size:12px;line-height:20px;padding:0;cursor:pointer}",
    ".svn-panel{position:absolute;right:0;bottom:80px;width:380px;height:min(600px,calc(100vh - 120px));background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden;transform-origin:bottom right;animation:svnIn .18s ease-out}",
    ".svn-panel iframe{width:100%;height:100%;border:0;display:block}",
    "@keyframes svnIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}",
    "@media (max-width:520px){.svn-panel{position:fixed;inset:0;width:auto;height:auto;border-radius:0}.svn-w{right:14px;bottom:14px}.svn-tip{display:none}}",
    "@media (prefers-reduced-motion:reduce){.svn-panel{animation:none}.svn-fab{transition:none}}"
  ].join("");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var NS = "http://www.w3.org/2000/svg";
  function botIcon() {
    var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 48 48"); s.setAttribute("aria-hidden", "true");
    s.innerHTML = '<line x1="24" y1="5" x2="24" y2="11" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="4.5" r="2.5" fill="#fff"/>' +
      '<rect x="7" y="11" width="34" height="27" rx="11" fill="#fff"/><rect x="2" y="20" width="4" height="9" rx="2" fill="#fff"/><rect x="42" y="20" width="4" height="9" rx="2" fill="#fff"/>' +
      '<circle cx="17" cy="24" r="3.6" fill="#c8102e"/><circle cx="31" cy="24" r="3.6" fill="#c8102e"/>' +
      '<path d="M17.5 31.5c2 2 11 2 13 0" fill="none" stroke="#c8102e" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M14 38l-3 6 9-5z" fill="#fff"/>';
    return s;
  }
  function closeIcon() {
    var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    s.innerHTML = '<path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>';
    return s;
  }

  var root = document.createElement("div"); root.className = "svn-w";
  var fab = document.createElement("button"); fab.type = "button"; fab.className = "svn-fab";
  fab.setAttribute("aria-label", "Mở chat tư vấn Savani"); fab.setAttribute("aria-expanded", "false");
  var dot = document.createElement("span"); dot.className = "svn-dot";
  var panel = null, tip = null, open = false;

  function setIcon(isOpen) {
    while (fab.firstChild) fab.removeChild(fab.firstChild);
    fab.appendChild(isOpen ? closeIcon() : botIcon());
    if (!isOpen) fab.appendChild(dot);
    fab.setAttribute("aria-expanded", String(isOpen));
    fab.setAttribute("aria-label", isOpen ? "Đóng chat" : "Mở chat tư vấn Savani");
  }
  function hideTip() { if (tip) { tip.remove(); tip = null; } try { sessionStorage.setItem("svn_tip", "1"); } catch (e) {} }
  function toggle(force) {
    open = typeof force === "boolean" ? force : !open;
    hideTip();
    if (open && !panel) {
      panel = document.createElement("div"); panel.className = "svn-panel";
      var f = document.createElement("iframe"); f.src = base + "/chat/?embed=1"; f.title = "Chat tư vấn Savani"; f.allow = "clipboard-write";
      panel.appendChild(f); root.insertBefore(panel, fab);
    } else if (panel) panel.hidden = !open;
    setIcon(open);
  }
  fab.addEventListener("click", function () { toggle(); });
  window.addEventListener("message", function (e) {
    if (e.origin === base && e.data === "svn:close") toggle(false);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) toggle(false); });

  root.appendChild(fab); setIcon(false);
  function mount() { document.body.appendChild(root); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  var seen = false; try { seen = sessionStorage.getItem("svn_tip") === "1"; } catch (e) {}
  if (!seen) setTimeout(function () {
    if (open) return;
    tip = document.createElement("div"); tip.className = "svn-tip"; tip.textContent = "Cần tư vấn size, đổi trả? Chat với mình nhé!";
    var x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Ẩn lời chào");
    x.addEventListener("click", function (e) { e.stopPropagation(); hideTip(); });
    tip.appendChild(x); tip.addEventListener("click", function () { toggle(true); });
    root.insertBefore(tip, fab);
  }, 2500);
})();
