(function (G) {
  'use strict';
  var I = G.input = {
    down: {}, press: {}, blocked: false,
    mouse: { x: 240, y: 135, down: false },
    view: { left: 0, top: 0, scale: 1 }
  };
  I.isDown = function (c) { return !I.blocked && !!I.down[c]; };
  I.pressed = function (c) { return !I.blocked && !!I.press[c]; };
  I.fire = function () { return !I.blocked && I.mouse.down; };
  I.endTick = function () { I.press = {}; };
  function typing(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }
  I.init = function (canvas) {
    window.addEventListener('keydown', function (e) {
      if (typing(e)) return;
      if (!e.repeat) I.press[e.code] = true;
      I.down[e.code] = true;
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0 || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { I.down[e.code] = false; });
    window.addEventListener('blur', function () { I.down = {}; I.mouse.down = false; });
    window.addEventListener('mousemove', function (e) {
      var v = I.view;
      I.mouse.x = (e.clientX - v.left) / v.scale;
      I.mouse.y = (e.clientY - v.top) / v.scale;
    });
    canvas.addEventListener('mousedown', function (e) { if (e.button === 0) I.mouse.down = true; });
    window.addEventListener('mouseup', function (e) { if (e.button === 0) I.mouse.down = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };
})(window.G);
