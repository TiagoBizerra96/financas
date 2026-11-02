// Versão online: Google falso (login + Drive) compartilhado entre dois navegadores (Tiago e Iasmym).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const XLSX = require(process.env.XLSX_PATH || '/home/claude/build/node_modules/xlsx');
const RAIZ = process.env.RAIZ || '/home/claude/financas';
const PORTA = 8765, BASE = 'http://localhost:' + PORTA + '/';
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(RAIZ, f); if (!p.startsWith(RAIZ) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': tipos[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
}).listen(PORTA);

// ---- Drive falso ----
const XMIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const drive = { pl: { id: 'pl', name: 'PLANILHA FINANCEIRA - IASMYM E TIAGO.xlsx', mimeType: XMIME, bytes: fs.readFileSync('planilha.xlsx'), version: 1, parents: ['pasta1'], modifiedTime: new Date().toISOString() } };
let seq = 0; const perms = []; const log = [];
const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, version: String(f.version), parents: f.parents, modifiedTime: f.modifiedTime, capabilities: { canEdit: true } });
const GIS = `window.google = { accounts: { oauth2: {
  initTokenClient(c) { return { callback: c.callback, requestAccessToken() { const self = this; setTimeout(() => self.callback({ access_token: 'tok:' + (window.__email || 'x'), expires_in: 3600 }), 20); } }; },
  revoke(t, cb) { cb && cb(); } } } };`;
async function rotear(ctx) {
  await ctx.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: GIS }));
  await ctx.route('https://www.googleapis.com/**', async (r) => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), auth = (req.headers().authorization || '').replace('Bearer tok:', '');
    const json = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    log.push(m + ' ' + u.pathname);
    if (u.pathname === '/oauth2/v3/userinfo') return json({ email: auth, name: auth });
    let mt;
    if (m === 'GET' && u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q'); let fs_ = Object.values(drive);
      const eq = /name = '([^']+)'/.exec(q); if (eq) fs_ = fs_.filter((f) => f.name === eq[1].replace(/\\'/g, "'"));
      if (/PLANILHA FINANCEIRA|mimeType = /.test(q)) fs_ = fs_.filter((f) => f.mimeType === XMIME);
      return json({ files: fs_.map(meta) });
    }
    if ((mt = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)) && m === 'GET') {
      const f = drive[mt[1]]; if (!f) return json({ error: { message: 'not found' } }, 404);
      if (u.searchParams.get('alt') === 'media') return r.fulfill({ status: 200, body: f.bytes });
      return json(meta(f));
    }
    if ((mt = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)) && m === 'PATCH') {
      const f = drive[mt[1]]; f.bytes = req.postDataBuffer(); f.version++; f.modifiedTime = new Date().toISOString(); return json(meta(f));
    }
    if (u.pathname === '/upload/drive/v3/files' && m === 'POST') {
      const corpo = req.postDataBuffer().toString('utf8'); const partes = corpo.split(/--financas\d+/);
      const md = JSON.parse(partes[1].split('\r\n\r\n')[1].trim()); const conteudo = partes[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const id = 'f' + (++seq); drive[id] = { id, name: md.name, mimeType: md.mimeType, parents: md.parents || ['raiz'], bytes: Buffer.from(conteudo, 'utf8'), version: 1, modifiedTime: new Date().toISOString() };
      return json(meta(drive[id]));
    }
    if ((mt = /^\/drive\/v3\/files\/([^/]+)\/permissions$/.exec(u.pathname)) && m === 'POST') { perms.push({ id: mt[1], ...JSON.parse(req.postData()) }); return json({ id: 'p' + perms.length }); }
    return json({ error: { message: 'rota não simulada ' + m + ' ' + u.pathname } }, 500);
  });
}
const ok = (n, c) => console.log((c ? 'OK   ' : 'FALHA') + ' ' + n);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch(); const erros = [];
  async function abrir(email, vp) {
    const ctx = await b.newContext({ viewport: vp || { width: 1360, height: 900 } }); await rotear(ctx);
    await ctx.addInitScript((e) => { window.__email = e; localStorage.setItem('financas.googleClientId', '123-teste.apps.googleusercontent.com'); }, email);
    const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(email + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(email + ': ' + m.text()); });
    await p.goto(BASE + '#dashboard'); await p.waitForTimeout(500); return p;
  }
  const T = async (p, s) => (await p.textContent(s)).replace(/ /g, ' ');

  // ---------- Tiago ----------
  const t = await abrir('tiago@exemplo.com');
  ok('pede login com Google (banner + botão)', /Entre com sua conta Google/i.test(await T(t, '#view')) && await t.$('[data-entrar-google]'));
  await t.click('[data-entrar-google]'); await t.waitForSelector('.modal', { timeout: 8000 });
  ok('primeira vez: mostra a prévia da planilha do Drive', /PLANILHA FINANCEIRA/.test(await T(t, '.modal')));
  await t.click('.modal-foot .btn.primary'); await t.waitForTimeout(4500);
  const nT = await t.evaluate(() => App.store.state.lancamentos.length);
  ok('importou ' + nT + ' lançamentos da planilha do Drive', nT > 100);
  const dados = Object.values(drive).find((f) => /dados do painel/.test(f.name));
  ok('criou o arquivo de dados do painel na pasta da planilha', dados && dados.parents[0] === 'pasta1');
  ok('rodapé mostra "online como tiago@…"', /online como tiago@exemplo\.com/.test(await T(t, '#syncInfo')));
  const v0 = drive.pl.version;
  ok('planilha no Drive recebeu a aba de controle', (() => { const wb = XLSX.read(drive.pl.bytes); return wb.SheetNames.includes('CONTROLE DO DASHBOARD'); })());

  // Tiago marca Americanas como paga
  const mes = await t.evaluate(() => App.U.mesAtual());
  const amId = await t.evaluate((m) => App.store.state.lancamentos.find((l) => l.mesRef === m && /americanas/i.test(l.descricao)).id, mes);
  await t.goto(BASE + '#contas'); await t.waitForTimeout(500);
  await t.click('[data-c="l:' + amId + '"]'); await espera(5000);
  const js1 = JSON.parse(drive[dados.id].bytes.toString('utf8'));
  ok('arquivo de dados recebeu "Americanas paga"', js1.lancamentos.find((l) => l.id === amId).situacao === 'pago');
  ok('planilha no Drive foi regravada (versão ' + v0 + ' → ' + drive.pl.version + ')', drive.pl.version > v0);
  const ctrl = XLSX.utils.sheet_to_json(XLSX.read(drive.pl.bytes).Sheets['CONTROLE DO DASHBOARD'], { header: 1 });
  ok('aba de controle no Drive marca a Americanas como Pago', ctrl.some((r) => r.join('|').match(/americanas/i) && r.join('|').includes('Pago')));
  // Tiago cria um lançamento manual (para testar exclusão depois)
  await t.evaluate(async (m) => { await App.store.put('lancamentos', { id: 'man-teste', descricao: 'Farmácia teste', valor: 37.5, tipo: 'despesa', categoria: 'Outros', mesRef: m, data: App.U.dataNoMes(m, 5), situacao: 'pago', origem: 'manual' }); }, mes);
  await espera(4500);

  // ---------- Iasmym (outro aparelho) ----------
  const ia = await abrir('iasmym@exemplo.com', { width: 390, height: 844 });
  await ia.click('[data-entrar-google]'); await ia.waitForTimeout(5000);
  ok('Iasmym: não precisou importar de novo (sem prévia)', !(await ia.$('.modal')));
  const sIa = await ia.evaluate((id) => ({ n: App.store.state.lancamentos.length, am: App.store.state.lancamentos.find((l) => l.id === id).situacao, man: !!App.store.state.lancamentos.find((l) => l.id === 'man-teste') }), amId);
  ok('Iasmym vê os mesmos ' + sIa.n + ' lançamentos', Math.abs(sIa.n - (nT + 1)) <= 0);
  ok('Iasmym vê a Americanas paga', sIa.am === 'pago');
  ok('Iasmym vê o lançamento manual do Tiago', sIa.man);
  const cxT = await t.evaluate((m) => App.F.caixaMes(m).disponivel, mes), cxI = await ia.evaluate((m) => App.F.caixaMes(m).disponivel, mes);
  ok('"Disponível agora" igual nos dois (' + cxT.toFixed(2) + ')', Math.abs(cxT - cxI) < 0.01);

  // Iasmym paga parte da luz no celular
  const luzId = await ia.evaluate((m) => App.store.state.lancamentos.find((l) => l.mesRef === m && /^luz$/i.test(l.descricao)).id, mes);
  await ia.goto(BASE + '#contas'); await ia.waitForTimeout(500);
  await ia.screenshot({ path: 'online-celular-contas.png' });
  await ia.click('[data-p="l:' + luzId + '"]'); await ia.waitForSelector('.modal'); await ia.fill('.modal [name=valor]', '120,00'); await ia.click('.modal-foot .btn.primary'); await espera(5000);
  await t.evaluate(() => App.nuvem.sincronizar()); await t.waitForTimeout(800);
  const luzT = await t.evaluate((id) => { const l = App.store.state.lancamentos.find((x) => x.id === id); return { s: App.F.situacaoDe(l), vp: App.F.valorPago(l) }; }, luzId);
  ok('Tiago recebe o pagamento parcial da Iasmym (120)', luzT.s === 'parcial' && Math.abs(luzT.vp - 120) < 0.01);

  // Tiago apaga o lançamento manual → some na Iasmym
  await t.evaluate(() => App.store.remove('lancamentos', 'man-teste')); await espera(4500);
  await ia.evaluate(() => App.nuvem.sincronizar()); await ia.waitForTimeout(800);
  ok('exclusão do Tiago chega na Iasmym', !(await ia.evaluate(() => !!App.store.state.lancamentos.find((l) => l.id === 'man-teste'))));

  // Conflito: os dois mexem em itens diferentes antes de sincronizar
  const gasId = await t.evaluate((m) => App.store.state.lancamentos.find((l) => l.mesRef === m && /^g[aá]s$/i.test(l.descricao)).id, mes);
  const creId = await t.evaluate((m) => App.store.state.lancamentos.find((l) => l.mesRef === m && /creche/i.test(l.descricao)).id, mes);
  await Promise.all([
    t.evaluate((id) => { const l = App.store.state.lancamentos.find((x) => x.id === id); return App.store.put('lancamentos', Object.assign({}, l, { situacao: 'pago' })); }, gasId),
    ia.evaluate((id) => { const l = App.store.state.lancamentos.find((x) => x.id === id); return App.store.put('lancamentos', Object.assign({}, l, { situacao: 'pago' })); }, creId),
  ]);
  await espera(6000);
  await t.evaluate(() => App.nuvem.sincronizar()); await ia.evaluate(() => App.nuvem.sincronizar()); await t.evaluate(() => App.nuvem.sincronizar()); await t.waitForTimeout(500);
  const sit = (p) => p.evaluate(([a, c]) => { const L = App.store.state.lancamentos; return L.find((l) => l.id === a).situacao + '/' + L.find((l) => l.id === c).situacao; }, [gasId, creId]);
  const st1 = await sit(t), st2 = await sit(ia);
  ok('mudanças simultâneas dos dois se juntam (gás e creche pagos nos dois): ' + st1 + ' | ' + st2, st1 === 'pago/pago' && st2 === 'pago/pago');

  // alteração feita direto na planilha do Drive (outra pessoa abriu no Excel/Drive)
  const wb = XLSX.read(drive.pl.bytes, { cellStyles: true });
  const abaPF = wb.Sheets[wb.SheetNames.find((n) => /PLANILHA FINANCEIRA/i.test(n))];
  let alvo = null; const rng = XLSX.utils.decode_range(abaPF['!ref']);
  for (let R = rng.s.r; R <= rng.e.r && !alvo; R++) { const c = abaPF[XLSX.utils.encode_cell({ r: R, c: 0 })] || abaPF[XLSX.utils.encode_cell({ r: R, c: 1 })]; if (c && /^g[aá]s$/i.test(String(c.v).trim())) alvo = R; }
  ok('achei a linha do Gás na planilha para editar', alvo !== null);

  // compartilhar
  await t.goto(BASE + '#config'); await t.waitForTimeout(500);
  ok('Configurações mostra a seção Online conectada', /Conectado como tiago@exemplo\.com/.test(await T(t, '#view')));
  await t.click('#btnCompartilhar'); await t.fill('#emailComp', 'iasmym@exemplo.com'); await t.click('.modal-foot .btn.primary'); await t.waitForTimeout(600);
  ok('compartilhou planilha e dados com a Iasmym (writer)', perms.length === 2 && perms.every((x) => x.role === 'writer' && x.emailAddress === 'iasmym@exemplo.com'));
  await t.screenshot({ path: 'online-config.png', clip: { x: 260, y: 60, width: 1100, height: 420 } });

  // PWA
  const man = await t.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
  ok('manifest com ícones 192/512 e display standalone', man.display === 'standalone' && man.icons.length >= 3);
  const sw = await t.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!(r && (r.active || r.installing || r.waiting))));
  ok('service worker registrado', sw);
  await t.reload(); await t.waitForTimeout(800);
  ok('página controlada pelo service worker após recarregar', await t.evaluate(() => !!navigator.serviceWorker.controller));
  ok('sem erros de JavaScript' + (erros.length ? ': ' + erros.slice(0, 4).join(' | ') : ''), !erros.length);
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
