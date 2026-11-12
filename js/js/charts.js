/* Gráficos com Chart.js: cores fixas por grupo e formatação em reais. */
(function (App) {
  'use strict';
  const U = App.U;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const instancias = {};
  const C = {};
  C.cor = { receita: () => css('--c-receita'), fixa: () => css('--c-fixa'), cartao: () => css('--c-cartao'), emprestimo: () => css('--c-emprestimo'),
    variavel: () => css('--c-variavel'), reserva: () => css('--c-reserva'), good: () => css('--good'), warn: () => css('--warn'), bad: () => css('--bad'), accent: () => css('--accent'), muted: () => css('--muted') };
  C.paleta = ['#2f6aa8', '#7a58c0', '#c17a24', '#138c8e', '#1e8a5a', '#c2412d', '#5b6f82', '#b04a8c', '#8a8f2a', '#3f9ad1', '#9c6644', '#6b7280'];
  C.alpha = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };

  function base(tipo) {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: tipo === 'doughnut' ? 'nearest' : 'index', intersect: tipo === 'doughnut' },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, color: css('--muted'), font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => {
          const v = c.parsed && typeof c.parsed === 'object' ? (c.parsed.y != null ? c.parsed.y : c.parsed.x) : c.parsed;
          const lab = c.dataset.label || c.label || '';
          if (c.dataset.formato === 'pct') return lab + ': ' + U.pct(v);
          return lab + ': ' + U.brl(v);
        } } },
      },
      scales: tipo === 'doughnut' ? {} : {
        x: { grid: { display: false }, ticks: { color: css('--muted'), font: { size: 11 }, maxRotation: 0, autoSkip: true } },
        y: { grid: { color: css('--line') }, border: { display: false }, ticks: { color: css('--muted'), font: { size: 11 }, callback: (v) => U.brl0(v) } },
      },
    };
  }
  /** Desenha (ou redesenha) um gráfico num <canvas id>. */
  C.render = (id, cfg) => {
    const el = document.getElementById(id); if (!el || !window.Chart) return null;
    if (instancias[id]) { instancias[id].destroy(); delete instancias[id]; }
    const opts = base(cfg.type);
    if (cfg.options) mesclar(opts, cfg.options);
    instancias[id] = new Chart(el, { type: cfg.type, data: cfg.data, options: opts });
    return instancias[id];
  };
  C.destruirTodos = () => Object.keys(instancias).forEach((k) => { try { instancias[k].destroy(); } catch (e) { /* já removido */ } delete instancias[k]; });
  C.limpar = () => Object.keys(instancias).forEach((k) => { if (!document.getElementById(k)) { instancias[k].destroy(); delete instancias[k]; } });
  function mesclar(a, b) { Object.keys(b).forEach((k) => { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') mesclar(a[k], b[k]); else a[k] = b[k]; }); }
  App.charts = C;
})(window.App = window.App || {});
