/* Componentes de interface: ícones, avisos, janelas, indicadores e utilidades de formulário. */
(function (App) {
  'use strict';
  const U = App.U;
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    debt: '<path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>', down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3z"/><path d="M3 7l12-4v4"/><circle cx="16.5" cy="13.5" r="1"/>',
    house: '<path d="M4 10l8-6 8 6v10H4z"/><path d="M10 20v-6h4v6"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    piggy: '<path d="M5 11a7 6 0 0 1 13-2h2v4l-2 1-1 3h-3v-2h-4v2H7l-1-3a5 5 0 0 1-1-3z"/><circle cx="15" cy="10" r=".8"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h0"/>',
    check: '<path d="M4 12l5 5L20 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>', download: '<path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h0"/>', link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/>', left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  };
  const ui = {};
  ui.icon = (n) => '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICONS[n] || '') + '</svg></span>';
  ui.hydrateIcons = (root) => (root || document).querySelectorAll('[data-ico]').forEach((el) => { if (!el.firstChild) el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[el.dataset.ico] || '') + '</svg>'; });

  ui.toast = (msg, tipo, ms) => {
    const t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), ms || 4200);
  };

  /** Janela modal. corpo: HTML. botoes: [{texto, classe, acao(modal) → false mantém aberto}] */
  ui.modal = ({ titulo, corpo, botoes, largo, aoAbrir }) => {
    const root = document.getElementById('modalRoot');
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = '<div class="modal' + (largo ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + U.esc(titulo) + '">' +
      '<div class="modal-head"><h3>' + U.esc(titulo) + '</h3><button class="icon-btn" data-close type="button" aria-label="Fechar">' + ui.icon('x') + '</button></div>' +
      '<div class="modal-body">' + corpo + '</div><div class="modal-foot"></div></div>';
    const foot = back.querySelector('.modal-foot');
    const m = { el: back, body: back.querySelector('.modal-body'), fechar: () => { back.remove(); document.removeEventListener('keydown', esc); } };
    const esc = (e) => { if (e.key === 'Escape') m.fechar(); };
    document.addEventListener('keydown', esc);
    (botoes || [{ texto: 'Fechar' }]).forEach((b) => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn ' + (b.classe || ''); btn.textContent = b.texto;
      btn.addEventListener('click', async () => {
        if (!b.acao) { m.fechar(); return; }
        btn.disabled = true;
        try { const r = await b.acao(m); if (r !== false) m.fechar(); } catch (e) { console.error(e); ui.toast(e.message || String(e), 'bad'); }
        btn.disabled = false;
      });
      foot.appendChild(btn);
    });
    back.querySelector('[data-close]').addEventListener('click', m.fechar);
    back.addEventListener('mousedown', (e) => { if (e.target === back) m.fechar(); });
    root.appendChild(back);
    if (aoAbrir) aoAbrir(m);
    const f = back.querySelector('input, select, textarea'); if (f) setTimeout(() => f.focus(), 30);
    return m;
  };
  ui.confirmar = (titulo, texto, rotulo, perigo) => new Promise((resolve) => {
    let ok = false;
    const m = ui.modal({ titulo, corpo: '<div class="prose">' + texto + '</div>', botoes: [
      { texto: 'Cancelar' }, { texto: rotulo || 'Confirmar', classe: perigo ? 'danger solid' : 'primary', acao: () => { ok = true; } }] });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); resolve(ok); } });
    obs.observe(document.getElementById('modalRoot'), { childList: true });
  });

  /** Card de indicador. */
  ui.kpi = ({ rotulo, valor, sub, nivel, icone, barra, titulo }) =>
    '<div class="kpi ' + (nivel || '') + '"' + (titulo ? ' title="' + U.esc(titulo) + '"' : '') + '><div class="k-top">' + (icone ? ui.icon(icone) : '') + '<span>' + U.esc(rotulo) + '</span></div>' +
    '<div class="k-val">' + valor + '</div>' + (barra != null ? '<div class="bar ' + (nivel || '') + '"><span style="width:' + Math.max(0, Math.min(100, barra * 100)).toFixed(1) + '%"></span></div>' : '') +
    (sub ? '<div class="k-sub">' + sub + '</div>' : '') + '</div>';

  ui.nivelPct = (p) => (p > 0.9 ? 'bad' : p > 0.7 ? 'warn' : 'good');
  ui.delta = (atual, anterior, menorMelhor) => {
    const v = App.F.variacao(atual, anterior); if (v == null) return '<span class="muted">sem mês anterior para comparar</span>';
    const sobe = v > 0; const bom = menorMelhor ? !sobe : sobe;
    return '<span class="' + (v === 0 ? 'muted' : bom ? 'pos' : 'neg') + '">' + (sobe ? '▲ ' : v < 0 ? '▼ ' : '') + U.pct(Math.abs(v)) + '</span> vs. mês anterior';
  };

  /** Seletor de mês (select) com os meses disponíveis. */
  ui.selectMes = (id, meses, atual, extra) =>
    '<select id="' + id + '" class="inp" aria-label="Mês">' + (extra || '') + meses.map((m) => '<option value="' + m + '"' + (m === atual ? ' selected' : '') + '>' + U.mesLongo(m) + '</option>').join('') + '</select>';

  /** Lê os campos de um formulário pelo atributo name. */
  ui.lerForm = (root) => {
    const o = {};
    root.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value;
    });
    return o;
  };
  ui.erro = (root, nome, msg) => {
    const el = root.querySelector('[name="' + nome + '"]'); if (!el) return;
    const f = el.closest('.field'); if (!f) return;
    f.classList.add('err'); let s = f.querySelector('.msg-err'); if (!s) { s = document.createElement('span'); s.className = 'msg-err'; f.appendChild(s); } s.textContent = msg;
  };
  ui.limparErros = (root) => root.querySelectorAll('.field.err').forEach((f) => { f.classList.remove('err'); const s = f.querySelector('.msg-err'); if (s) s.remove(); });

  /** Baixa um arquivo gerado no navegador. */
  ui.baixar = (nome, blob) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  ui.field = (rotulo, input, dica, cls) => '<label class="field ' + (cls || '') + '"><span>' + U.esc(rotulo) + '</span>' + input + (dica ? '<small>' + dica + '</small>' : '') + '</label>';
  ui.input = (name, valor, attrs) => '<input name="' + name + '" value="' + U.esc(valor == null ? '' : valor) + '" ' + (attrs || '') + '>';
  ui.moneyInput = (name, valor, attrs) => '<input name="' + name + '" inputmode="decimal" placeholder="0,00" value="' + (valor == null || valor === '' ? '' : U.num2(valor)) + '" ' + (attrs || '') + '>';
  ui.select = (name, opcoes, atual, attrs) => '<select name="' + name + '" ' + (attrs || '') + '>' + opcoes.map((o) => { const v = typeof o === 'object' ? o.v : o, t = typeof o === 'object' ? o.t : o;
    return '<option value="' + U.esc(v) + '"' + (String(v) === String(atual) ? ' selected' : '') + '>' + U.esc(t) + '</option>'; }).join('') + '</select>';

  ui.vazio = (titulo, texto, botao) => '<div class="panel empty"><h2>' + titulo + '</h2><p>' + texto + '</p>' + (botao || '') + '</div>';
  ui.semDados = () => (App.nuvem && App.nuvem.configurado() && !App.nuvem.ativa())
    ? ui.vazio('Entre com sua conta Google', 'O painel busca a planilha e os dados no Google Drive. Entre para sincronizar.', '<button class="btn primary" data-entrar-google>' + ui.icon('link') + 'Entrar com Google</button>')
    : ui.vazio('Nenhum dado ainda', 'Importe a planilha Excel para começar. Os lançamentos, cartões e totais são lidos dela.',
    '<a class="btn primary" href="#config">' + ui.icon('upload') + 'Importar planilha</a>');

  App.ui = ui;
  App.views = App.views || {};
})(window.App = window.App || {});
