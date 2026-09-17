// Original winning-card pixel rasterizer, extracted from Certa's design editor.
// Pure canvas painting: no DOM, URL parameters, scripts, or network requests.
import {createCanvas} from '@napi-rs/canvas';
export function paintWinning(g,fields) {
 const state={brand:fields.brand,title:fields.title,trader:fields.handle,symbol:fields.symbol,pnl:fields.pnl,contracts:fields.contracts,timeHeld:fields.held,entryTime:fields.entry,sign:[fields.sign1,fields.sign2].filter(Boolean).join('|'),url:fields.site,symbolLabel:fields.symbolLabel,pnlLabel:fields.pnlLabel,contractsLabel:fields.contractsLabel,timeHeldLabel:fields.heldLabel,entryTimeLabel:fields.entryLabel};
 const canvas=createCanvas(1,1),ctx=canvas.getContext('2d');
 function cssVar(name,fallback){return fallback;}
  var UI = '"Chakra Petch"', PIXF = '"Saira Condensed"', SIGNF = '"VT323"';
  var UI_BASE = 0.842;                                   // baseline offset (× size) in a line-height:1 box, Chakra Petch
  var PIX = { cap: 0.688, asc: 1.135, desc: 0.439 };     // Saira Condensed metrics
  var CAP_H = 136, BASELINE = 422;                       // big-text geometry (card px)
  var SYMBOL_CENTER = 450, SYMBOL_MAX = 340, PNL_CENTER = 993, PNL_MAX = 671;

  function snap(v, c) { return Math.max(c, Math.round(v / c) * c); }
  function snapUp(v, c) { return Math.ceil(v / c) * c; }
  function up(s) { return String(s == null ? '' : s).toUpperCase(); }

  /* --- colour helpers (pixel-art bevel) --- */
  function toRgb(h) {
    var m = /rgba?\(([^)]+)\)/.exec(h);
    if (m) return m[1].split(',').slice(0, 3).map(function (v) { return parseFloat(v); });
    h = h.replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbToHex(r) { return '#' + r.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function shade(col, amt) { return rgbToHex(toRgb(col).map(function (v) { return amt >= 0 ? v + (255 - v) * amt : v * (1 + amt); })); }

  /* --- P&L formatting --- */
  function formatPnl(v) {
    if (typeof v === 'string' && /[^\d\s.,$+\-]/.test(v)) return { text: v, neg: /^\s*-/.test(v) };
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return { text: String(v), neg: false };
    var neg = n < 0, s = Math.abs(n).toFixed(2).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return { text: (neg ? '-' : '+') + '$' + s.join('.'), neg: neg };
  }

  /* --- pixel-text rasteriser: text → cell grid → runs of cells --- */
  function rasterize(o) {
    var text = up(o.text), cell = o.cell || 4, stretch = o.stretch || 1;
    var F = CAP_H / PIX.cap, sign = '', body = text;
    if (/^[+\-\u2212]/.test(text)) { sign = text.charAt(0) === '+' ? '+' : '-'; body = text.slice(1).replace(/^\s+/, ''); }

    function measure(F) {
      ctx.font = o.weight + ' ' + F + 'px ' + PIXF;
      var bw = ctx.measureText(body).width, len = sign ? snap(0.28 * F, cell) : 0, gap = sign ? 0.05 * F : 0;
      return { bw: bw, len: len, gap: gap, total: len + gap + bw * stretch };
    }
    var m = measure(F);
    if (o.maxWidth && m.total > o.maxWidth) { F = F * o.maxWidth / m.total; m = measure(F); }

    var asc = snapUp(PIX.asc * F, cell), desc = snapUp(PIX.desc * F, cell);
    var W = snapUp(m.total + 3 * cell, cell), H = asc + desc;
    canvas.width = W; canvas.height = H;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

    var x = cell;
    if (sign) {                                          // hand-drawn +/- so it matches the artwork
      var thick = snap(0.085 * F, cell), len = m.len, cy = asc - PIX.cap * F / 2;
      ctx.fillRect(x, Math.round((cy - thick / 2) / cell) * cell, len, thick);
      if (sign === '+') ctx.fillRect(x + Math.round((len / 2 - thick / 2) / cell) * cell, Math.round((cy - len / 2) / cell) * cell, thick, len);
      x += len + m.gap;
    }
    ctx.save(); ctx.scale(stretch, 1);
    ctx.font = o.weight + ' ' + F + 'px ' + PIXF;
    ctx.fillText(body, x / stretch, asc);
    var di = body.indexOf('$');
    if (di >= 0) {                                       // full vertical bar through the $
      var x0 = x / stretch + ctx.measureText(body.slice(0, di)).width, gw = ctx.measureText('$').width, barW = 0.06 * F;
      ctx.fillRect(x0 + gw / 2 - barW / 2, asc - PIX.cap * F + 2, barW, PIX.cap * F - 4);
    }
    ctx.restore();

    var data = ctx.getImageData(0, 0, W, H).data, cols = W / cell, rows = H / cell, on = [], r, c, py, px, sum, thr = cell * cell * 255 * 0.5;
    for (r = 0; r < rows; r++) { on.push([]); for (c = 0; c < cols; c++) {
      sum = 0;
      for (py = 0; py < cell; py++) for (px = 0; px < cell; px++) sum += data[((r * cell + py) * W + c * cell + px) * 4 + 3];
      on[r].push(sum >= thr);
    } }
    var c0 = cols, c1 = 0;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (on[r][c]) { if (c < c0) c0 = c; if (c + 1 > c1) c1 = c + 1; }
    if (c1 <= c0) { c0 = 0; c1 = 1; }

    var runs = [];                                       // {x,y,w,k} relative to ink-left / grid-top; k: 0 base, 1 highlight, 2 shadow
    for (r = 0; r < rows; r++) {
      var run = -1, cls = 0;
      for (c = 0; c <= cols; c++) {
        var k = -1;
        if (c < cols && on[r][c]) {
          k = 0;
          if (o.bevel) {
            var u = r > 0 && on[r - 1][c], d = r < rows - 1 && on[r + 1][c], l = c > 0 && on[r][c - 1], rt = c < cols - 1 && on[r][c + 1];
            if (!u || !l) k = 1;
            if (!d || !rt) k = 2;
          }
        }
        if (run >= 0 && k !== cls) { runs.push({ x: (run - c0) * cell, y: r * cell, w: (c - run) * cell, k: cls }); run = -1; }
        if (k >= 0 && run < 0) { run = c; cls = k; }
      }
    }
    return { runs: runs, cell: cell, H: H, asc: asc, inkW: (c1 - c0) * cell, fills: [o.color, shade(o.color, 0.1), shade(o.color, -0.15)] };
  }

  function paintPixel(g, res, centerX) {
    var left = Math.round(centerX - res.inkW / 2), top = BASELINE - res.asc;
    res.runs.forEach(function (q) { g.fillStyle = res.fills[q.k]; g.fillRect(left + q.x, top + q.y, q.w, res.cell); });
  }

  function derive() {
    var pnl = formatPnl(state.pnl), sign = String(state.sign || '').trim();
    if (!sign) sign = (pnl.neg ? 'RED' : 'GREEN') + '|TRADE';
    var colors = {
      navy: cssVar('--navy', '#0d1b36'), green: cssVar('--green', '#255622'), red: cssVar('--red', '#8e2a26'),
      gold: cssVar('--gold', '#7d5d29'), brand: cssVar('--brand', '#1d5a22'), white: cssVar('--white', '#f4f4f2'),
      signText: cssVar('--sign-text', '#eeeeec'), signOutline: cssVar('--sign-outline', '#432911')
    };
    var cell = +state.pixelCell || 4;
    return {
      pnl: pnl, colors: colors,
      signLines: sign.replace(/\s*\|\s*|\\n/g, '\n').split('\n'),
      symbol: rasterize({ text: state.symbol, weight: 700, stretch: +state.symbolStretch || 1.1, color: colors.navy, cell: cell, maxWidth: SYMBOL_MAX }),
      pnlPix: rasterize({ text: pnl.text, weight: 800, stretch: +state.pnlStretch || 0.91, color: pnl.neg ? colors.red : colors.green, cell: cell, bevel: true, maxWidth: PNL_MAX })
    };
  }

  function textWidth(g, cs, font, sp, ampFont) {
    var w = 0;
    for (var i = 0; i < cs.length; i++) { g.font = (cs[i] === '&' && ampFont) ? ampFont : font; w += g.measureText(cs[i]).width + sp; }
    return w;                                            // includes trailing spacing, like a CSS inline box
  }
  function drawText(g, text, o) {
    var cs = up(text).split(''), font = o.weight + ' ' + o.size + 'px ' + (o.family || UI);
    var amp = o.amp ? ('700 ' + o.size + 'px ' + PIXF) : null, sp = o.spacing || 0;
    var w = textWidth(g, cs, font, sp, amp), x = o.align === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x;
    g.fillStyle = o.color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    for (var i = 0; i < cs.length; i++) { g.font = (cs[i] === '&' && amp) ? amp : font; g.fillText(cs[i], x, o.y); x += g.measureText(cs[i]).width + sp; }
    return w;
  }
  function paint(g) {
    var s = state, dv = derive(), C = dv.colors;
    drawText(g, s.brand,  { x: 167, y: 65 + UI_BASE * 16, size: 16, weight: 700, spacing: 0.08 * 16, color: C.brand });
    drawText(g, s.title,  { x: 167, y: 88 + UI_BASE * 39, size: 39, weight: 700, spacing: 0.02 * 39, color: C.navy });
    if (String(s.trader || '').trim()) {
      drawText(g, s.trader, { x: 30, y: 933.5 + UI_BASE * 18, size: 18, weight: 700, spacing: 0.04 * 18, color: C.white, align: 'left' });
    }

    g.fillStyle = C.navy; g.fillRect(635, 259, 3, 197);
    paintPixel(g, dv.symbol, SYMBOL_CENTER);
    paintPixel(g, dv.pnlPix, PNL_CENTER);
    drawText(g, s.symbolLabel, { x: 449,   y: 442 + UI_BASE * 23, size: 23, weight: 700, spacing: 0.1 * 23, color: C.gold, align: 'center' });
    drawText(g, s.pnlLabel,    { x: 974.5, y: 442 + UI_BASE * 23, size: 23, weight: 700, spacing: 0.1 * 23, color: C.gold, align: 'center', amp: true });

    var cols = [[s.contracts, s.contractsLabel], [s.timeHeld, s.timeHeldLabel], [s.entryTime, s.entryTimeLabel]];
    var widths = cols.map(function (c) {
      return Math.max(textWidth(g, up(c[0]).split(''), '700 49px ' + UI, -0.02 * 49), textWidth(g, up(c[1]).split(''), '700 21px ' + UI, 0.1 * 21));
    });
    var x = 22 + (1514 - (widths[0] + widths[1] + widths[2] + 2 * 122)) / 2;
    cols.forEach(function (c, i) {
      var cx = x + widths[i] / 2;
      drawText(g, c[0], { x: cx, y: 632 + UI_BASE * 49, size: 49, weight: 700, spacing: -0.02 * 49, color: C.navy, align: 'center' });
      drawText(g, c[1], { x: cx, y: 690 + UI_BASE * 21, size: 21, weight: 700, spacing: 0.1 * 21,  color: C.gold, align: 'center' });
      x += widths[i];
      if (i < 2) { g.fillStyle = C.navy; g.fillRect(x + 60, 635, 2, 73); x += 122; }
    });

    g.save();                                            // sign: VT323, outline, scaleX(1.25) about the block centre
    g.translate(1348, 0); g.scale(1.25, 1); g.translate(-1348, 0);
    var offs = [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]];
    dv.signLines.forEach(function (ln, i) {
      var w = textWidth(g, up(ln).split(''), '400 30px ' + SIGNF, 4), lx = 1290 + (120 - w) / 2, ly = 566 + 22.5 + i * 27;
      offs.forEach(function (o) { drawText(g, ln, { x: lx + o[0], y: ly + o[1], size: 30, weight: 400, family: SIGNF, spacing: 4, color: C.signOutline }); });
      drawText(g, ln, { x: lx, y: ly, size: 30, weight: 400, family: SIGNF, spacing: 4, color: C.signText });
    });
    g.restore();

    var uw = drawText(g, s.url, { x: 1506, y: 933.5 + UI_BASE * 19, size: 19, weight: 600, spacing: 0.1 * 19, color: C.white, align: 'right' });
    var gx = 1506 - uw - 41, gy = 928;                   // globe icon, 30×30
    g.save(); g.strokeStyle = C.white; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath();
    g.arc(gx + 15, gy + 15, 13, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    if (g.ellipse) g.ellipse(gx + 15, gy + 15, 5.6, 13, 0, 0, Math.PI * 2);
    else { g.save(); g.translate(gx + 15, gy + 15); g.scale(5.6 / 13, 1); g.arc(0, 0, 13, 0, Math.PI * 2); g.restore(); }
    g.stroke();
    g.beginPath(); g.moveTo(gx + 2, gy + 15); g.lineTo(gx + 28, gy + 15); g.moveTo(gx + 4.6, gy + 9); g.lineTo(gx + 25.4, gy + 9);
    g.moveTo(gx + 4.6, gy + 21); g.lineTo(gx + 25.4, gy + 21); g.stroke();
    g.restore();
  }


 paint(g);
}
