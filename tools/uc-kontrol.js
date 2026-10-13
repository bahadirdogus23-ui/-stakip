/*
 * 3B model doğrulama yardımcıları (test ve denetim için).
 * - cakisma(a, b): a parçasından alınan iç örnek noktaların b'nin içine düşen oranı (dışbükey altı yüzlü).
 * - modulCakismalari(geo, secenek): aynı modüldeki iç içe geçen parça çiftleri.
 * - projeCakismalari(yerlesim): farklı modüllerin birbirine giren parçaları.
 */
'use strict';
const U = require('../js/uc.js');

const YUZ = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
const fark = (a, b) => a.map((x, i) => x - b[i]);
const capraz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nokta = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function duzlemler(p) {
  const m = p.k.reduce((a, q) => a.map((x, i) => x + q[i] / 8), [0, 0, 0]);
  return YUZ.map((f) => {
    const P = f.map((i) => p.k[i]);
    let n = capraz(fark(P[2], P[0]), fark(P[3], P[1]));
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    const d = nokta(n, P[0]);
    return nokta(n, m) > d ? [n.map((x) => -x), -d] : [n, d];
  });
}
function ornekler(p, N) {
  const K = p.k;
  const L = (a, b, t) => a.map((x, m) => x + (b[m] - x) * t);
  const o = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
    const u = 0.02 + (0.96 * i) / N, v = 0.02 + (0.96 * j) / N, w = 0.02 + (0.96 * k) / N;
    o.push(L(L(L(K[0], K[1], u), L(K[3], K[2], u), v), L(L(K[4], K[5], u), L(K[7], K[6], u), v), w));
  }
  return o;
}
const kutuSinir = (p) => [0, 1, 2].map((k) => [Math.min(...p.k.map((q) => q[k])), Math.max(...p.k.map((q) => q[k]))]);
function cakisma(a, b) {
  const pb = duzlemler(b);
  const s = ornekler(a, 5);
  let n = 0;
  for (const q of s) if (pb.every(([nn, d]) => nokta(nn, q) < d - 0.6)) n++;
  return n / s.length;
}
const ATLA = ['kulp', 'led'];
function ciftler(P, ayniModulMu) {
  const B = P.map(kutuSinir);
  const out = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if (ATLA.includes(P[i].tur) || ATLA.includes(P[j].tur)) continue;
    if (ayniModulMu !== undefined && (P[i].modul === P[j].modul) !== ayniModulMu) continue;
    if (B[i].some((x, k) => x[1] <= B[j][k][0] + 1 || B[j][k][1] <= x[0] + 1)) continue;
    const r = Math.max(cakisma(P[i], P[j]), cakisma(P[j], P[i]));
    if (r > 0.02) out.push({ a: P[i], b: P[j], oran: r });
  }
  return out;
}
const modulCakismalari = (geo, secenek) => ciftler(U.modulParcalari(geo, secenek));
const projeCakismalari = (yer, secenek) => ciftler(U.projeParcalari(yer, secenek), false);

module.exports = { cakisma, modulCakismalari, projeCakismalari };
