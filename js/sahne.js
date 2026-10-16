/*
 * WebGL2 3B görüntüleyici (etkileşimli 3B sekmesi için). Uc.modulParcalari / Uc.projeParcalari'nın
 * parça listesini çizer: derinlik tamponu (üst üste binme hatası olmaz), gölge haritası, LED şeritlerin
 * yüzeylere sıcak ışık vurması, zemin ve duvar, keskin kenar çizgileri, saydam cam, tıklayarak seçim.
 * WebGL2 yoksa olustur() null döner; uygulama SVG çizimine (Uc.ciz) geri düşer. Baskı/PDF SVG ile kalır.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sahne = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const YUZLER = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const RENK = {
    govde: '#efe6d6', ic: '#e4d9c4', panel: '#d6c3a3', kapak: '#e7cfa8', cekmece: '#dcc19a',
    cam: '#9cc8e6', ayna: '#cfdbe3', arkalik: '#cfc6b8', ayak: '#555555', kulp: '#6f6658', led: '#ffd27a', baza: '#c9bba3', nesne: '#cccccc',
  };
  const LED_MAX = 64;

  const hexRgb = (h) => {
    const x = /^#[0-9a-f]{3}$/i.test(h) ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
    return [1, 3, 5].map((i) => (parseInt(String(x).slice(i, i + 2), 16) || 0) / 255);
  };
  const alt = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const capraz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nokta = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const birim = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function newell(pts) {
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }

  // ---------- 4×4 matris (sütun öncelikli) ----------
  const carp = (a, b) => {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  };
  const orto = (l, r, b, t, n, f) => new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
  const perspektif = (fy, asp, n, f) => { const t = 1 / Math.tan(fy / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]); };
  /** Satırları x, y, z eksenleri olan dönüş + öteleme (dünya → göz). */
  const bakisMatrisi = (X, Y, Z, goz) => new Float32Array([
    X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0,
    -nokta(X, goz), -nokta(Y, goz), -nokta(Z, goz), 1,
  ]);

  // ---------- Gölgelendiriciler ----------
  const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec4 aRenk; in vec4 aDoku;
uniform mat4 uVP; uniform mat4 uIsikVP;
out vec3 vPos; out vec3 vNor; out vec4 vRenk; out vec4 vIsik; out vec4 vDoku;
void main() { vPos = aPos; vNor = aNor; vRenk = aRenk; vDoku = aDoku; vIsik = uIsikVP * vec4(aPos, 1.0); gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vPos; in vec3 vNor; in vec4 vRenk; in vec4 vIsik; in vec4 vDoku;
uniform sampler2DShadow uGolge; uniform float uGolgeVar; uniform vec2 uGolgeAdim;
uniform vec3 uIsikYon; uniform vec3 uGoz; uniform float uOrto; uniform vec3 uBakis;
uniform int uLedN; uniform vec3 uLedA[${LED_MAX}]; uniform vec3 uLedB[${LED_MAX}]; uniform vec2 uLedG[${LED_MAX}];
uniform vec4 uVurgu; uniform float uAlfaCarpan;
out vec4 renk;
// Değer gürültüsü (doku için)
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gurultu(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * gurultu(p); p *= 2.03; a *= 0.5; } return s; }
vec3 dokuUygula(vec3 c, vec3 n) {
  if (vDoku.w > 1.5) {
    // Mermer: kıvrımlı koyu damarlar + ince ikincil damarlar
    float v = dot(vPos, vec3(0.0042, 0.0026, 0.0031)) + fbm(vPos * 0.0028) * 2.4;
    float ana = smoothstep(0.0, 0.09, abs(sin(v * 3.1416)));
    float ince = smoothstep(0.0, 0.03, abs(sin(v * 7.0 + fbm(vPos * 0.01) * 3.0)));
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    vec3 damar = lum < 0.35 ? mix(c, vec3(0.86, 0.84, 0.8), 0.55) : c * 0.58 + vec3(0.06, 0.045, 0.02);
    c = mix(damar, c, ana * 0.85 + 0.15);
    c = mix(c * 0.86, c, ince * 0.55 + 0.45);
    return c * (0.97 + 0.05 * fbm(vPos * 0.02));
  }
  if (vDoku.w > 0.5) {
    // Ahşap: eksen boyunca uzayan damar çizgileri ve lif gürültüsü
    vec3 ax = normalize(vDoku.xyz);
    vec3 pa = cross(ax, n);
    if (dot(pa, pa) < 1e-4) pa = cross(ax, vec3(0.0, 0.0, 1.0));
    pa = normalize(pa);
    float u = dot(vPos, ax);
    float t = dot(vPos, pa);
    float bukul = fbm(vec3(u * 0.0018, t * 0.012, 0.5)) * 9.0;
    float halka = 0.5 + 0.5 * sin(t * 0.21 + bukul);
    float lif = gurultu(vec3(u * 0.012, t * 0.9, 1.7));
    return c * (0.92 + 0.06 * halka + 0.04 * lif);
  }
  return c;
}
void main() {
  vec3 n = normalize(vNor);
  vec3 v = uOrto > 0.5 ? uBakis : normalize(uGoz - vPos);
  if (dot(n, v) < 0.0) n = -n;
  if (vRenk.a > 1.5) { renk = vec4(mix(vRenk.rgb * 1.15, uVurgu.rgb, uVurgu.a), 1.0); return; } // LED: kendinden ışıklı
  float g = 1.0;
  if (uGolgeVar > 0.5) {
    vec3 p = vIsik.xyz / vIsik.w * 0.5 + 0.5;
    if (p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0 && p.z < 1.0) {
      float s = 0.0;
      for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(uGolge, vec3(p.xy + vec2(float(i), float(j)) * uGolgeAdim, p.z - 0.0015));
      g = s / 9.0;
    }
  }
  float d = max(dot(n, uIsikYon), 0.0);
  vec3 gok = mix(vec3(0.80, 0.79, 0.77), vec3(1.0, 0.995, 0.98), n.y * 0.5 + 0.5);
  // Gölge tam karanlık değil (oda ışığı): doğrudan ışığın %35'i kalır
  vec3 taban = dokuUygula(vRenk.rgb, n);
  vec3 c = taban * (0.64 * gok + 0.50 * d * mix(0.35, 1.0, g) * vec3(1.0, 0.97, 0.92));
  vec3 h = normalize(uIsikYon + v);
  c += vec3(vDoku.w > 1.5 ? 0.22 : 0.10) * pow(max(dot(n, h), 0.0), vDoku.w > 1.5 ? 90.0 : 48.0) * g;
  // LED şeritler: en yakın şerit noktasından sıcak ışık
  for (int i = 0; i < ${LED_MAX}; i++) {
    if (i >= uLedN) break;
    vec3 a = uLedA[i]; vec3 b = uLedB[i]; vec3 ab = b - a;
    float t = clamp(dot(vPos - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    vec3 l = a + ab * t - vPos;
    float r = length(l);
    float menzil = uLedG[i].y;
    float k = max(dot(n, l / max(r, 1e-3)), 0.0) / (1.0 + (r / menzil) * (r / menzil));
    c += taban * vec3(1.0, 0.72, 0.38) * k * 0.95 * uLedG[i].x;
  }
  c = mix(c, uVurgu.rgb, uVurgu.a);
  renk = vec4(c, min(vRenk.a, 1.0) * uAlfaCarpan);
}`;
  const VS_DUZ = `#version 300 es
in vec3 aPos; uniform mat4 uVP;
void main() { gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS_DUZ = `#version 300 es
precision highp float; uniform vec4 uRenk; out vec4 renk;
void main() { renk = uRenk; }`;

  function program(gl, vs, fs) {
    const yap = (tur, kaynak) => {
      const s = gl.createShader(tur);
      gl.shaderSource(s, kaynak);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, yap(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, yap(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); const ad = a.name.replace(/\[0\]$/, ''); u[ad] = gl.getUniformLocation(p, a.name); }
    return { p, u, a: (ad) => gl.getAttribLocation(p, ad) };
  }

  /** Parça listesinden üçgen, kenar ve LED verisi. */
  function agOlustur(P) {
    const opak = [];
    const saydam = [];
    P.forEach((p, i) => { if (p.saydam && p.tur !== 'led') saydam.push(i); else opak.push(i); });
    const sira = opak.concat(saydam);
    const V = [];
    const C = [];
    const N = [];
    const T = [];
    const K = [];
    const araliklar = new Array(P.length);
    const kenarAraliklari = new Array(P.length);
    const merkezler = new Array(P.length);
    const ledler = [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const i of sira) {
      const p = P[i];
      const v = p.sk ? p.sk.v : p.k;
      const F = p.sk ? p.sk.f : YUZLER;
      const m = [0, 1, 2].map((k) => v.reduce((s, q) => s + q[k], 0) / v.length);
      merkezler[i] = m;
      for (const q of v) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
      const rgb = hexRgb(p.renk || RENK[p.tur] || RENK.govde);
      const a = p.tur === 'led' ? 2 : p.saydam || 1;
      const bas = V.length / 3;
      // Doku: tür (1 ahşap, 2 mermer) ve damar ekseni (parçanın en uzun kenarı)
      const sb = [0, 1, 2].map((k) => Math.max(...v.map((q) => q[k])) - Math.min(...v.map((q) => q[k])));
      const ax = [0, 1, 2].reduce((e, k) => (sb[k] > sb[e] ? k : e), 0);
      const dk = [ax === 0 ? 1 : 0, ax === 1 ? 1 : 0, ax === 2 ? 1 : 0, p.doku === 'mermer' ? 2 : p.doku === 'ahsap' ? 1 : 0];
      // Yüz normalleri: sarım yönü güvenilir ağlarda (sk.yon) olduğu gibi, diğerlerinde dışa çevrilir
      const yuzN = (p.gizli ? [] : F).map((f) => {
        const pts = f.map((j) => v[j]);
        let n = newell(pts);
        if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return null;
        n = birim(n);
        const fm = [0, 1, 2].map((k) => pts.reduce((s, q) => s + q[k], 0) / pts.length);
        if (!(p.sk && p.sk.yon) && nokta(n, alt(fm, m)) < 0) n = n.map((x) => -x);
        return n;
      });
      // Yumuşak parçalarda köşe normali: aynı köşeyi paylaşan, 50°'den yakın yüzlerin ortalaması
      let kose = null;
      if (p.yumusak) {
        kose = new Map();
        F.forEach((f, fi) => { if (yuzN[fi]) for (const j of f) { if (!kose.has(j)) kose.set(j, []); kose.get(j).push(yuzN[fi]); } });
      }
      const koseN = (j, n) => {
        if (!kose) return n;
        const t = [0, 0, 0];
        for (const q of kose.get(j)) if (nokta(q, n) > 0.64) { t[0] += q[0]; t[1] += q[1]; t[2] += q[2]; }
        return birim(t);
      };
      F.forEach((f, fi) => {
        const n = yuzN[fi];
        if (!n) return;
        for (let t = 1; t + 1 < f.length; t++) {
          for (const j of [f[0], f[t], f[t + 1]]) {
            const q = v[j];
            const nn = koseN(j, n);
            V.push(q[0], q[1], q[2]); N.push(nn[0], nn[1], nn[2]); C.push(rgb[0], rgb[1], rgb[2], a); T.push(dk[0], dk[1], dk[2], dk[3]);
          }
        }
      });
      araliklar[i] = [bas, V.length / 3 - bas];
      // Keskin kenarlar: tek yüze ait ya da yüz normalleri 30°'den fazla ayrılan kenarlar
      const kBas = K.length / 3;
      if (p.tur !== 'led' && !p.kenarsiz) {
        const kenar = new Map();
        F.forEach((f, fi) => {
          if (!yuzN[fi]) return;
          for (let j = 0; j < f.length; j++) {
            const a1 = f[j];
            const b1 = f[(j + 1) % f.length];
            const key = a1 < b1 ? a1 + ',' + b1 : b1 + ',' + a1;
            if (!kenar.has(key)) kenar.set(key, { a: a1, b: b1, n: [] });
            kenar.get(key).n.push(yuzN[fi]);
          }
        });
        for (const e of kenar.values()) {
          if (e.n.length === 2 && Math.abs(nokta(e.n[0], e.n[1])) > 0.8) continue;
          const q1 = v[e.a];
          const q2 = v[e.b];
          K.push(q1[0], q1[1], q1[2], q2[0], q2[1], q2[2]);
        }
      } else if (p.tur === 'led') {
        // LED şeridi: kutunun en uzun ekseni boyunca bir doğru parçası
        const b = [0, 1, 2].map((k) => [Math.min(...v.map((q) => q[k])), Math.max(...v.map((q) => q[k]))]);
        const ax = [0, 1, 2].reduce((e, k) => (b[k][1] - b[k][0] > b[e][1] - b[e][0] ? k : e), 0);
        const A = m.slice();
        const B = m.slice();
        A[ax] = b[ax][0];
        B[ax] = b[ax][1];
        A[1] -= 8; B[1] -= 8; // şeridin hemen altından yayılır
        ledler.push(p.ledA && p.ledB ? [p.ledA, p.ledB, p.ledGuc || 1, p.ledMenzil || 160] : [A, B, p.ledGuc || 1, p.ledMenzil || 160]);
      }
      kenarAraliklari[i] = [kBas, K.length / 3 - kBas];
    }
    return { V: new Float32Array(V), N: new Float32Array(N), C: new Float32Array(C), T: new Float32Array(T), K: new Float32Array(K), araliklar, kenarAraliklari, merkezler, opakSayi: opak.length, opak, saydam, ledler, min, max };
  }

  function olustur(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    let pr, prDuz;
    try {
      pr = program(gl, VS, FS);
      prDuz = program(gl, VS_DUZ, FS_DUZ);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('3B gölgelendirici derlenemedi:', e.message);
      return null;
    }
    const tampon = () => gl.createBuffer();
    const b = { V: tampon(), N: tampon(), C: tampon(), T: tampon(), K: tampon(), O: tampon() };
    // Gölge haritası
    const GB = 2048;
    const golgeTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, golgeTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, GB, GB);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const golgeFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, golgeFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, golgeTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Seçim tamponu (parça kimliği renk olarak)
    const secFB = gl.createFramebuffer();
    const secRenk = gl.createRenderbuffer();
    const secDerin = gl.createRenderbuffer();
    let secBoyut = [0, 0];

    let ag = null;
    let ortam = null; // zemin + duvarlar: [baslangic, sayi]
    let P = [];
    let golgeGuncel = false;
    let isikVP = null;
    const IS = birim([-0.32, 1, 0.78]); // ışık yönü (yüzeyden ışığa)
    const S = {
      gorus: { yaw: -35, pitch: 22, yakin: 1, kx: 0, ky: 0, perspektif: true },
      vurgular: new Map(), // parça indisi → [r, g, b, a]
    };

    function boyutla() {
      const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    /**
     * Parçaları yükler. secenek: { zemin, arkaDuvar, solDuvar, tavan, golge }
     */
    function yukle(parcalar, secenek) {
      const o = secenek || {};
      P = parcalar || [];
      ag = agOlustur(P);
      // Ortam: zemin ve duvarlar (tek yüzlü; arkadan bakınca görünmez)
      const E = [];
      const EN = [];
      const EC = [];
      if (P.length) {
        const [x1, y1, z1] = ag.min;
        const [x2, y2, z2] = ag.max;
        const pay = Math.max(600, (x2 - x1) * 0.35, (z2 - z1) * 0.8);
        const zy = Math.min(0, y1) - 0.5;
        const dortgen = (q, n, renk) => {
          for (const j of [0, 1, 2, 0, 2, 3]) { E.push(...q[j]); EN.push(...n); EC.push(...renk, 1); }
        };
        const zRenk = hexRgb(o.zeminRenk || '#e9e3d8');
        const dRenk = hexRgb(o.duvarRenk || '#f3efe8');
        const zx1 = o.solDuvar ? x1 : x1 - pay;
        const zz1 = o.arkaDuvar ? z1 : z1 - pay;
        if (o.zemin !== false) dortgen([[zx1, zy, z2 + pay], [x2 + pay, zy, z2 + pay], [x2 + pay, zy, zz1], [zx1, zy, zz1]], [0, 1, 0], zRenk);
        const dh = Math.max(o.tavan || 0, y2 + 350);
        if (o.arkaDuvar) dortgen([[zx1, zy, z1 - 0.5], [x2 + pay, zy, z1 - 0.5], [x2 + pay, dh, z1 - 0.5], [zx1, dh, z1 - 0.5]], [0, 0, 1], dRenk);
        if (o.solDuvar) dortgen([[x1 - 0.5, zy, z2 + pay], [x1 - 0.5, zy, zz1], [x1 - 0.5, dh, zz1], [x1 - 0.5, dh, z2 + pay]], [1, 0, 0], dRenk.map((c) => c * 0.97));
      }
      const tum = (a, e) => { const o2 = new Float32Array(a.length + e.length); o2.set(a); o2.set(e, a.length); return o2; };
      const n0 = ag.V.length / 3;
      ortam = [n0, E.length / 3];
      gl.bindBuffer(gl.ARRAY_BUFFER, b.V); gl.bufferData(gl.ARRAY_BUFFER, tum(ag.V, E), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.N); gl.bufferData(gl.ARRAY_BUFFER, tum(ag.N, EN), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.C); gl.bufferData(gl.ARRAY_BUFFER, tum(ag.C, EC), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.T); gl.bufferData(gl.ARRAY_BUFFER, tum(ag.T, new Float32Array((E.length / 3) * 4)), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.K); gl.bufferData(gl.ARRAY_BUFFER, ag.K, gl.STATIC_DRAW);
      S.golgeVar = o.golge !== false;
      golgeGuncel = false;
    }

    /** Görünüşe göre kamera: { VP, goz, bakis, orto } */
    function kamera() {
      boyutla();
      const g = S.gorus;
      const yaw = (g.yaw * Math.PI) / 180;
      const pitch = (g.pitch * Math.PI) / 180;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      // Uc.ciz ile aynı dönüş: göz eksenleri dünya koordinatında
      const X = [cy, 0, sy];
      const Y = [sp * sy, cp, -sp * cy];
      const Z = [-cp * sy, sp, cp * cy];
      const asp = canvas.width / canvas.height;
      const mn = ag ? ag.min : [-500, 0, -500];
      const mx = ag ? ag.max : [500, 1000, 500];
      const M = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      // Sınır kutusu köşelerinin göz eksenlerindeki yayılımı
      let ax1 = Infinity, ax2 = -Infinity, ay1 = Infinity, ay2 = -Infinity, az1 = Infinity, az2 = -Infinity;
      for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) {
        const q = [x - M[0], y - M[1], z - M[2]];
        const a = nokta(q, X), bb = nokta(q, Y), c = nokta(q, Z);
        ax1 = Math.min(ax1, a); ax2 = Math.max(ax2, a); ay1 = Math.min(ay1, bb); ay2 = Math.max(ay2, bb); az1 = Math.min(az1, c); az2 = Math.max(az2, c);
      }
      const yarimY = Math.max((ay2 - ay1) / 2, (ax2 - ax1) / 2 / asp) * 1.08 / Math.max(0.2, g.yakin || 1);
      const merkez = [M[0] + X[0] * ((ax1 + ax2) / 2 + g.kx) + Y[0] * ((ay1 + ay2) / 2 + g.ky), M[1] + X[1] * ((ax1 + ax2) / 2 + g.kx) + Y[1] * ((ay1 + ay2) / 2 + g.ky), M[2] + X[2] * ((ax1 + ax2) / 2 + g.kx) + Y[2] * ((ay1 + ay2) / 2 + g.ky)];
      const R = Math.max(1, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]));
      let VP, goz;
      if (g.perspektif) {
        const fov = (34 * Math.PI) / 180;
        const uzak = yarimY / Math.tan(fov / 2) + az2;
        goz = merkez.map((c, k) => c + Z[k] * uzak);
        VP = carp(perspektif(fov, asp, Math.max(10, uzak - R * 1.5), uzak + R * 3), bakisMatrisi(X, Y, Z, goz));
      } else {
        goz = merkez.map((c, k) => c + Z[k] * R * 2);
        VP = carp(orto(-yarimY * asp, yarimY * asp, -yarimY, yarimY, R * 0.2, R * 5), bakisMatrisi(X, Y, Z, goz));
      }
      return { VP, goz, bakis: Z, orto: !g.perspektif, X, Y, yarimY };
    }

    function golgeCiz() {
      if (!ag || !ag.opakSayi) return;
      const [x1, y1, z1] = ag.min;
      const [x2, y2, z2] = ag.max;
      const M = [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2];
      const R = Math.max(1, Math.hypot(x2 - x1, y2 - y1, z2 - z1)) * 0.75;
      const Z = IS;
      const X = birim(capraz([0, 1, 0], Z));
      const Y = capraz(Z, X);
      const goz = M.map((c, k) => c + Z[k] * R * 2);
      isikVP = carp(orto(-R, R, -R, R, R * 0.5, R * 3.5), bakisMatrisi(X, Y, Z, goz));
      gl.bindFramebuffer(gl.FRAMEBUFFER, golgeFB);
      gl.viewport(0, 0, GB, GB);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(prDuz.p);
      gl.uniformMatrix4fv(prDuz.u.uVP, false, isikVP);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
      baglaKonum(prDuz);
      // Opak parçalar (LED hariç) gölge düşürür
      for (const i of ag.opak) if (P[i].tur !== 'led') gl.drawArrays(gl.TRIANGLES, ag.araliklar[i][0], ag.araliklar[i][1]);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      golgeGuncel = true;
    }

    function baglaKonum(pg) {
      const a = pg.a('aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, b.V);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    }
    function baglaHepsi() {
      for (const [ad, buf, n] of [['aPos', b.V, 3], ['aNor', b.N, 3], ['aRenk', b.C, 4], ['aDoku', b.T, 4]]) {
        const a = pr.a(ad);
        if (a < 0) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, n, gl.FLOAT, false, 0, 0);
      }
    }

    function ciz() {
      boyutla();
      const arka = hexRgb('#f6f3ee');
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(arka[0], arka[1], arka[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!ag || !P.length) return;
      if (S.golgeVar && !golgeGuncel) golgeCiz();
      gl.viewport(0, 0, canvas.width, canvas.height);
      const k = kamera();
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.useProgram(pr.p);
      baglaHepsi();
      const u = pr.u;
      gl.uniformMatrix4fv(u.uVP, false, k.VP);
      gl.uniformMatrix4fv(u.uIsikVP, false, isikVP || new Float32Array(16));
      gl.uniform3fv(u.uIsikYon, IS);
      gl.uniform3fv(u.uGoz, k.goz);
      gl.uniform3fv(u.uBakis, k.bakis);
      gl.uniform1f(u.uOrto, k.orto ? 1 : 0);
      gl.uniform1f(u.uGolgeVar, S.golgeVar && isikVP ? 1 : 0);
      gl.uniform2f(u.uGolgeAdim, 1 / GB, 1 / GB);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, golgeTex);
      gl.uniform1i(u.uGolge, 0);
      const L = ag.ledler.slice(0, LED_MAX);
      gl.uniform1i(u.uLedN, L.length);
      if (L.length) {
        const A = new Float32Array(LED_MAX * 3);
        const B = new Float32Array(LED_MAX * 3);
        const G = new Float32Array(LED_MAX * 2);
        L.forEach(([a, bb, gg, mz], i) => { A.set(a, i * 3); B.set(bb, i * 3); G[i * 2] = gg; G[i * 2 + 1] = mz; });
        gl.uniform3fv(u.uLedA, A);
        gl.uniform3fv(u.uLedB, B);
        gl.uniform2fv(u.uLedG, G);
      }
      gl.uniform1f(u.uAlfaCarpan, 1);
      const vurgusuz = () => gl.uniform4f(u.uVurgu, 0, 0, 0, 0);
      vurgusuz();
      // Ortam (tek yüzlü)
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      if (ortam[1]) gl.drawArrays(gl.TRIANGLES, ortam[0], ortam[1]);
      gl.disable(gl.CULL_FACE);
      // Opak parçalar (kenar çizgileri üste çıksın diye biraz geride)
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      if (ag.opakSayi) {
        const ilk = ag.araliklar[ag.opak[0]][0];
        const son = ag.araliklar[ag.opak[ag.opak.length - 1]];
        gl.drawArrays(gl.TRIANGLES, ilk, son[0] + son[1] - ilk);
      }
      for (const [i, r] of S.vurgular) {
        if (!ag.araliklar[i] || P[i].saydam) continue;
        gl.uniform4f(u.uVurgu, r[0], r[1], r[2], r[3]);
        gl.drawArrays(gl.TRIANGLES, ag.araliklar[i][0], ag.araliklar[i][1]);
      }
      vurgusuz();
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // Kenar çizgileri
      gl.useProgram(prDuz.p);
      gl.uniformMatrix4fv(prDuz.u.uVP, false, k.VP);
      gl.uniform4f(prDuz.u.uRenk, 0.16, 0.13, 0.09, 0.55);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disableVertexAttribArray(pr.a('aNor'));
      gl.disableVertexAttribArray(pr.a('aRenk'));
      if (pr.a('aDoku') >= 0) gl.disableVertexAttribArray(pr.a('aDoku'));
      const ka = prDuz.a('aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, b.K);
      gl.enableVertexAttribArray(ka);
      gl.vertexAttribPointer(ka, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, ag.K.length / 3);
      // Seçili parçaların kenarları turuncu
      if (S.vurgular.size) {
        gl.depthFunc(gl.ALWAYS);
        for (const [i, r] of S.vurgular) {
          const a = ag.kenarAraliklari[i];
          if (!a || !a[1]) continue;
          gl.uniform4f(prDuz.u.uRenk, 0.93, 0.45, 0.08, r[3] > 0.2 ? 0.95 : 0.45);
          gl.drawArrays(gl.LINES, a[0], a[1]);
        }
        gl.depthFunc(gl.LEQUAL);
      }
      // Saydam parçalar: arkadan öne, derinlik yazmadan
      gl.useProgram(pr.p);
      baglaHepsi();
      gl.depthMask(false);
      const sirali = ag.saydam.slice().sort((a, c) => nokta(ag.merkezler[a], k.bakis) - nokta(ag.merkezler[c], k.bakis));
      for (const i of sirali) {
        const r = S.vurgular.get(i);
        if (r) gl.uniform4f(u.uVurgu, r[0], r[1], r[2], r[3]); else vurgusuz();
        gl.drawArrays(gl.TRIANGLES, ag.araliklar[i][0], ag.araliklar[i][1]);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /** Ekran noktasındaki (canvas'a göre CSS piksel) parçanın indisi; yoksa -1. */
    function sec(x, y) {
      if (!ag || !P.length) return -1;
      boyutla();
      const w = canvas.width;
      const h = canvas.height;
      if (secBoyut[0] !== w || secBoyut[1] !== h) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, secRenk);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
        gl.bindRenderbuffer(gl.RENDERBUFFER, secDerin);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, secFB);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, secRenk);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, secDerin);
        secBoyut = [w, h];
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, secFB);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      const k = kamera();
      gl.useProgram(prDuz.p);
      gl.uniformMatrix4fv(prDuz.u.uVP, false, k.VP);
      baglaKonum(prDuz);
      // Saydam parçalar da seçilebilir (önce opaklar, sonra camlar en önde olanı kazanır)
      P.forEach((p, i) => {
        const id = i + 1;
        gl.uniform4f(prDuz.u.uRenk, (id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, 1);
        gl.drawArrays(gl.TRIANGLES, ag.araliklar[i][0], ag.araliklar[i][1]);
      });
      const dpr = w / Math.max(1, canvas.clientWidth);
      const px = new Uint8Array(4);
      gl.readPixels(Math.round(x * dpr), Math.round(h - y * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const id = px[0] + (px[1] << 8) + (px[2] << 16);
      return id ? id - 1 : -1;
    }

    /** Ekranda sürükleme miktarını (CSS piksel) kaydırma birimine çevirir. */
    function pikselOlcek() {
      const k = kamera();
      return (2 * k.yarimY) / Math.max(1, canvas.clientHeight);
    }

    return Object.assign(S, { yukle, ciz, sec, boyutla, pikselOlcek, canvas, parcalar: () => P });
  }

  const destekli = () => {
    try { const c = typeof document !== 'undefined' && document.createElement('canvas'); return !!(c && c.getContext('webgl2')); } catch (e) { return false; }
  };

  return { olustur, destekli, agOlustur, newell };
});
