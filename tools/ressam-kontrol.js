// Ressam sıralaması doğrulayıcı: ekranda örnek noktalardan ışın atılır; her noktada en öndeki opak
// parça en son çizilen olmalı. Dönüş: [{ n (hatalı nokta), ust (üste çizilen), gercek (öndeki), dz }]
// Painter-order verifier: replicate Uc.ciz projection, use Uc.siraBul, ray-cast sample points.
const U = require('../js/uc.js');
const YUZ = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
function dogrula(parcalar, gorus, adim) {
  const yaw = (gorus.yaw * Math.PI) / 180, pitch = (gorus.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const don = ([x, y, z]) => { const x1 = cy * x + sy * z; const z1 = -sy * x + cy * z; return [x1, cp * y - sp * z1, sp * y + cp * z1]; };
  const bakis = [don([1, 0, 0])[2], don([0, 1, 0])[2], don([0, 0, 1])[2]];
  const og = parcalar.map((p) => {
    const v = (p.sk ? p.sk.v : p.k).map(don);
    const b = [0, 1, 2].map((k) => [Math.min(...p.k.map((q) => q[k])), Math.max(...p.k.map((q) => q[k]))]);
    let ex1 = Infinity, ex2 = -Infinity, ey1 = Infinity, ey2 = -Infinity;
    for (const q of v) { ex1 = Math.min(ex1, q[0]); ex2 = Math.max(ex2, q[0]); ey1 = Math.min(ey1, -q[1]); ey2 = Math.max(ey2, -q[1]); }
    const m = v.reduce((a, q) => a.map((c, k) => c + q[k] / v.length), [0, 0, 0]);
    // planes in view space
    const pl = [];
    for (const f of p.sk ? p.sk.f : YUZ) {
      const P = f.map((i) => v[i]);
      let n = U.newell(P);
      const l = Math.hypot(...n); if (l < 1e-9) continue; n = n.map((x) => x / l);
      const fc = P.reduce((s, q) => s.map((x, k) => x + q[k] / P.length), [0, 0, 0]);
      let d = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > d) { n = n.map((x) => -x); d = -d; }
      pl.push([n, d]);
    }
    return { p, v, b, ex1, ex2, ey1, ey2, derinlik: m[2], pl, yuzler: [1], zarf: U.zarf(v.map((q) => [q[0], q[1]])) };
  });
  const sira = U.siraBul(og, bakis);
  const rank = new Array(og.length); sira.forEach((i, r) => (rank[i] = r));
  // ray (x, y fixed in view; z from +inf toward -inf). Entry z = min over planes facing viewer of ...
  const giris = (o, X, Y) => {
    let zmax = Infinity, zmin = -Infinity;
    for (const [n, d] of o.pl) {
      // n.x X + n.y Y + n.z z <= d
      const r = d - n[0] * X - n[1] * Y;
      if (Math.abs(n[2]) < 1e-9) { if (r < -0.3) return null; continue; }
      const zz = r / n[2];
      if (n[2] > 0) zmax = Math.min(zmax, zz); else zmin = Math.max(zmin, zz);
    }
    return zmax > zmin + 0.3 ? zmax : null; // front surface depth (closest to viewer)
  };
  let minX = Math.min(...og.map((o) => o.ex1)), maxX = Math.max(...og.map((o) => o.ex2));
  let minY = Math.min(...og.map((o) => -o.ey2)), maxY = Math.max(...og.map((o) => -o.ey1));
  const hatalar = new Map();
  const st = adim || 8;
  // Örnekler kenarlara denk gelmesin diye yarım adımdan biraz kaydırılır
  for (let X = minX + st * 0.37; X <= maxX; X += st) for (let Y = minY + st * 0.41; Y <= maxY; Y += st) {
    let on = null, son = null;
    for (let i = 0; i < og.length; i++) {
      const o = og[i];
      if (X < o.ex1 || X > o.ex2 || -Y < o.ey1 || -Y > o.ey2) continue;
      if (o.p.saydam) continue;
      const z = giris(o, X, Y); if (z == null) continue;
      if (!on || z > on.z) on = { i, z };
      if (!son || rank[i] > son.r) son = { i, r: rank[i], z };
    }
    if (on && son && on.i !== son.i && on.z - son.z > 2) {
      const k = son.i + '>' + on.i;
      const h = hatalar.get(k) || { n: 0, ust: og[son.i].p, gercek: og[on.i].p, dz: on.z - son.z };
      h.n++; hatalar.set(k, h);
    }
  }
  return [...hatalar.values()].sort((a, b) => b.n - a.n);
}
module.exports = dogrula;

