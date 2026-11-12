/* Utilitários gerais: formatação brasileira, datas, normalização de textos. */
(function (App) {
  'use strict';
  const U = {};

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  U.brl = (v) => brl.format(U.round2(v || 0));
  U.brl0 = (v) => brl0.format(Math.round(v || 0));
  U.pct = (v) => (isFinite(v) ? pct.format(v) : '—');
  U.num2 = (v) => num2.format(v || 0);

  /** Arredonda para centavos (evita 0,1 + 0,2 = 0,30000000000000004). */
  U.round2 = (v) => Math.round((+v + Number.EPSILON) * 100) / 100;

  /** Lê um valor digitado em formato brasileiro ("1.234,56", "R$ 50", "50.5"). */
  U.parseValor = (s) => {
    if (typeof s === 'number') return s;
    s = String(s == null ? '' : s).trim();
    if (!s) return NaN;
    const neg = /^-|\(.*\)/.test(s);
    let v = s.replace(/[^\d.,]/g, '');
    const lc = v.lastIndexOf(','), ld = v.lastIndexOf('.');
    if (lc > -1 && ld > -1) v = lc > ld ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    else if (lc > -1) v = v.replace(/\./g, '').replace(',', '.');
    else if ((v.match(/\./g) || []).length > 1) v = v.replace(/\./g, '');
    const n = parseFloat(v);
    return isNaN(n) ? NaN : (neg ? -n : n);
  };

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  U.MESES = MESES;

  /* Mês de referência no formato "AAAA-MM". */
  U.mesKey = (y, m) => y + '-' + String(m + 1).padStart(2, '0');           // m: 0..11
  U.mesParts = (k) => { const [y, m] = k.split('-').map(Number); return { y, m: m - 1 }; };
  U.mesAdd = (k, n) => { const p = U.mesParts(k); const t = p.y * 12 + p.m + n; return U.mesKey(Math.floor(t / 12), ((t % 12) + 12) % 12); };
  U.mesDiff = (a, b) => { const pa = U.mesParts(a), pb = U.mesParts(b); return (pb.y * 12 + pb.m) - (pa.y * 12 + pa.m); };
  U.mesLabel = (k) => { const p = U.mesParts(k); return MESES_CURTOS[p.m] + '/' + String(p.y).slice(2); };
  U.mesLongo = (k) => { const p = U.mesParts(k); return MESES[p.m] + ' de ' + p.y; };
  U.mesAtual = () => { const d = new Date(); return U.mesKey(d.getFullYear(), d.getMonth()); };
  U.mesRange = (a, b) => { const out = []; for (let k = a; U.mesDiff(k, b) >= 0; k = U.mesAdd(k, 1)) out.push(k); return out; };
  U.mesDeData = (iso) => (iso ? iso.slice(0, 7) : '');

  /** Data ISO "AAAA-MM-DD" → "DD/MM/AAAA". */
  U.dataBR = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; };
  U.hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  /** Monta uma data válida para o dia de vencimento dentro do mês (dia 31 em fevereiro vira o último dia). */
  U.dataNoMes = (mesK, dia) => {
    const p = U.mesParts(mesK);
    const ult = new Date(p.y, p.m + 1, 0).getDate();
    const d = Math.min(Math.max(1, dia || 1), ult);
    return mesK + '-' + String(d).padStart(2, '0');
  };
  U.dataHoraBR = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /** Remove acentos, deixa em maiúsculas e sem espaços repetidos (para comparar nomes). */
  U.norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  U.slug = (s) => U.norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /** "CARTÃO NUBANK THAIS" → "Cartão Nubank Thais". */
  U.titulo = (s) => {
    const peq = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'pelo', 'pela']);
    return String(s || '').toLowerCase().split(/(\s+|-)/).map((w, i) => (i > 0 && peq.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('')
      .replace(/\bIfinty\b/i, 'Infinity');
  };

  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** Escapa texto para uso seguro em HTML. */
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.sum = (arr, f) => U.round2(arr.reduce((a, x) => a + (f ? f(x) : x), 0));
  U.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.clone = (o) => JSON.parse(JSON.stringify(o));

  App.U = U;
})(window.App = window.App || {});
