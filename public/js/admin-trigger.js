/**
 * 隐藏入口：连点前台 Logo 5 次唤出后台
 */
(function () {
  'use strict';
  var box = document.getElementById('logoBox');
  if (!box || !window.CHAdmin) return;

  var n = 0, timer = null;

  function hint(text) {
    var box2 = document.getElementById('toast');
    if (!box2) return;
    var el = document.createElement('div');
    el.className = 'toast-item';
    el.style.fontSize = '13px';
    el.textContent = text;
    box2.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, 1200);
  }

  function reset() { n = 0; clearTimeout(timer); }

  box.style.cursor = 'pointer';
  box.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    n++;
    clearTimeout(timer);
    timer = setTimeout(reset, 2500);
    box.style.transform = 'scale(0.88)';
    setTimeout(function () { box.style.transform = ''; }, 130);
    if (n >= 5) {
      reset();
      window.CHAdmin.open();
    } else if (n >= 3) {
      hint('再点 ' + (5 - n) + ' 次进入后台');
    }
  });
})();
