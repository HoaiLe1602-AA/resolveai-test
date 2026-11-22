(function () {
  "use strict";
  var P = [
    ["Áo sơ mi Oxford nam", 349000, 249000, "#cfd8e3", "#2f4a6b", "Mới"],
    ["Áo polo cotton nam", 299000, 96000, "#e6ddd0", "#7a5c3a", "96K"],
    ["Áo khoác bomber nam", 599000, 449000, "#d4d9cf", "#44523a", ""],
    ["Quần tây slim-fit nam", 449000, 349000, "#d9d9db", "#3b3b40", ""],
    ["Áo len cardigan nữ kẻ sọc", 429000, 329000, "#ecd0d4", "#8a1f2f", "Mới"],
    ["Đầm midi cổ vuông", 499000, 399000, "#e8e0ec", "#5a3f7a", ""],
    ["Chân váy chữ A", 299000, 96000, "#f0e3cf", "#a2692a", "96K"],
    ["Áo thun trẻ em in hình", 159000, 119000, "#d3e6e0", "#2a7a66", ""]
  ];
  var tee = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 14l-22 14 8 16 12-6v44h44V38l12 6 8-16-22-14c-3 8-11 12-20 12s-17-4-20-12z" fill="C" stroke="D" stroke-width="2" stroke-linejoin="round"/></svg>';
  var money = function (n) { return n.toLocaleString("vi-VN") + "đ"; };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  var grid = document.getElementById("grid"), cartN = document.getElementById("cartN"), n = 0;
  P.forEach(function (p) {
    var card = el("article", "card"), img = el("div", "img");
    img.style.background = p[3]; img.innerHTML = tee.replace("C", p[4]).replace("D", "#fff");
    if (p[5]) img.appendChild(el("span", "tag", p[5]));
    card.appendChild(img); card.appendChild(el("h3", null, p[0]));
    var pr = el("div", "price"); pr.appendChild(el("b", null, money(p[2]))); pr.appendChild(el("s", null, money(p[1]))); card.appendChild(pr);
    var sz = el("div", "sizes");
    ["S", "M", "L", "XL"].forEach(function (s, i) {
      var b = el("button", null, s); b.type = "button"; b.setAttribute("aria-pressed", i === 1 ? "true" : "false");
      b.addEventListener("click", function () { Array.prototype.forEach.call(sz.children, function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); });
      sz.appendChild(b);
    });
    card.appendChild(sz);
    var add = el("button", "add", "Thêm vào giỏ"); add.type = "button";
    add.addEventListener("click", function () { cartN.textContent = ++n; });
    card.appendChild(add); grid.appendChild(card);
  });
})();
