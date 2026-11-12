/* Service worker: deixa o app abrir rápido e funcionar sem internet (os dados ficam no aparelho).
 * Chamadas ao Google (login e Drive) nunca passam pelo cache.
 * Ao publicar uma versão nova, mude o número abaixo para os aparelhos baixarem tudo de novo. */
const VERSAO = 'financas-v4';
const ARQUIVOS = ['./', './css/style.css', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './index.html', './js/app.js', './js/categorias.js', './js/charts.js', './js/config-online.js', './js/db.js', './js/finance.js', './js/google.js', './js/importer.js', './js/nuvem.js', './js/openfinance.js', './js/sync.js', './js/ui.js', './js/util.js', './js/views/cartoes.js', './js/views/config.js', './js/views/contas.js', './js/views/dashboard.js', './js/views/dividas.js', './js/views/lancamentos.js', './js/views/mensal.js', './js/views/projecao.js', './js/views/simcartao.js', './js/views/simulador.js', './js/writer.js', './lib/chart.umd.min.js', './lib/jszip.min.js', './lib/xlsx.full.min.js', './manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Google e outros: direto pela rede
  // rede primeiro (pega a versão nova logo), cache se estiver sem internet
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
