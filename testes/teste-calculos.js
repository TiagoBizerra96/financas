/* Testes dos cálculos e da importação (rodar com: node testes/teste-calculos.js caminho/da/planilha.xlsx)
 * Precisa do pacote "xlsx" instalado (npm install xlsx) só para rodar os testes; o sistema em si usa lib/xlsx.full.min.js. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let XLSX; try { XLSX = require('xlsx'); } catch (e) { XLSX = require(process.env.XLSX_PATH); }
const ctx = { window: {}, XLSX, console, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, isFinite, isNaN, parseFloat, Infinity };
ctx.window.XLSX = XLSX; vm.createContext(ctx);
['util.js', 'categorias.js', 'finance.js', 'importer.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx));
const App = ctx.window.App;
const state = { lancamentos: [], cartoes: [], dividas: [], simulacoes: [], categorias: App.Categorias.padrao(), meta: {} };
App.store = { state, getMeta: (k, d) => (k in state.meta ? state.meta[k] : d),
  async aplicarLote(ops) { ops.forEach((o) => { if (o.store === 'meta') { state.meta[o.item.id] = o.item.value; return; } const arr = state[o.store];
    if (o.del) { const i = arr.findIndex((x) => x.id === o.id); if (i > -1) arr.splice(i, 1); } else { const i = arr.findIndex((x) => x.id === o.item.id); if (i > -1) arr[i] = o.item; else arr.push(o.item); } }); } };
const U = App.U, F = App.F;
let falhas = 0, ok = 0;
function eq(nome, a, b) { const pass = typeof b === 'number' ? Math.abs(a - b) < 0.006 : JSON.stringify(a) === JSON.stringify(b);
  if (pass) ok++; else { falhas++; console.log('FALHOU:', nome, '→ obtido', a, 'esperado', b); } }

(async () => {
  /* ---------- Simulador de dívida (exemplo do pedido) ---------- */
  let s = F.simularDivida(5000, 5, 700);
  eq('1º mês: juros', s.linhas[0].juros, 250);
  eq('1º mês: saldo atualizado', s.linhas[0].saldoAtualizado, 5250);
  eq('1º mês: novo saldo', s.linhas[0].novoSaldo, 4550);
  eq('2º mês: juros sobre 4.550', s.linhas[1].juros, 227.5);
  eq('2º mês: novo saldo', s.linhas[1].novoSaldo, 4077.5);
  eq('quita', s.quitada, true);
  eq('total pago = inicial + juros', s.totalPago, U.round2(5000 + s.totalJuros));
  eq('último saldo zero, nunca negativo', s.linhas[s.linhas.length - 1].novoSaldo, 0);
  console.log('R$ 5.000 a 5% pagando R$ 700: ' + s.meses + ' meses, juros ' + U.brl(s.totalJuros) + ', total ' + U.brl(s.totalPago));
  // pagamento menor que os juros: dívida cresce e não quita
  s = F.simularDivida(5000, 5, 200);
  eq('pagamento < juros: não quita', s.naoQuita, true);
  eq('pagamento < juros: saldo aumentou', s.linhas[0].aumentou, true);
  // pagamento igual aos juros: não quita
  eq('pagamento = juros: não quita', F.simularDivida(5000, 5, 250).naoQuita, true);
  // extra no mês 2 reduz o prazo
  const semExtra = F.simularDivida(5000, 5, 700), comExtra = F.simularDivida(5000, 5, 700, { extras: { 1: 1000 } });
  eq('extra reduz juros', comExtra.totalJuros < semExtra.totalJuros, true);
  eq('extra reduz prazo', comExtra.meses <= semExtra.meses, true);
  // extra maior que o saldo: limitado ao saldo
  s = F.simularDivida(1000, 5, 100, { extras: { 0: 5000 } });
  eq('extra acima do saldo vira quitação', s.linhas[0].pago, 1050); eq('quitada no 1º mês', s.meses, 1);
  // taxa zero
  s = F.simularDivida(1200, 0, 100); eq('sem juros: 12 meses', s.meses, 12); eq('sem juros: juros 0', s.totalJuros, 0);
  // comparação de cenários
  const c500 = F.simularDivida(5000, 5, 500), c700 = F.simularDivida(5000, 5, 700), c1000 = F.simularDivida(5000, 5, 1000);
  eq('pagar mais gera menos juros', c1000.totalJuros < c700.totalJuros && c700.totalJuros < c500.totalJuros, true);
  console.log('Cenários 500/700/1000: ' + [c500, c700, c1000].map((x) => x.meses + ' meses, juros ' + U.brl(x.totalJuros)).join(' | '));

  /* ---------- Custo efetivo de empréstimo no cartão ---------- */
  eq('taxa efetiva: 1000 em 12x de 94,56 ≈ 2%', Math.abs(F.taxaEfetiva(1000, 94.56, 12) - 0.02) < 0.0002, true);
  eq('taxa efetiva sem juros = 0', F.taxaEfetiva(1200, 100, 12), 0);
  // Caso real da operadora: paga R$ 3.000 em 5× de R$ 600 e recebe R$ 2.772,90 (desconto de 7,57%)
  eq('operadora: desconto 7,57%', U.round2((3000 - 2772.90) / 3000 * 100), 7.57);
  eq('operadora: juros efetivos ≈ 2,68% a.m.', Math.abs(F.taxaEfetiva(2772.90, 600, 5) - 0.02683) < 0.0001, true);

  /* ---------- Parcela Price ---------- */
  eq('PMT 1000, 2%, 12x', F.pmt(1000, 0.02, 12), 94.56);
  eq('PMT sem juros', F.pmt(1200, 0, 12), 100);

  /* ---------- Dívida cadastrada com pagamentos registrados ---------- */
  const hoje = U.mesAtual(), m2 = U.mesAdd(hoje, -2), m1 = U.mesAdd(hoje, -1);
  const d = { id: 'd1', nome: 'Teste', modalidade: 'rotativo', valorInicial: 5000, taxa: 5, pagamentoMensal: 700, primeiroPagamento: m2 + '-10',
    pagamentos: [{ id: 'p1', data: m2 + '-10', valor: 700 }, { id: 'p2', data: m1 + '-10', valor: 100 }] };
  let r = F.calcularDivida(d);
  eq('registrado mês 1', r.linhas[0].novoSaldo, 4550);
  eq('pagamento parcial (100 < juros 227,50): dívida aumentou', r.linhas[1].aumentou, true);
  eq('saldo após pagamento parcial', r.linhas[1].novoSaldo, 4677.5);
  eq('saldo atual = após registrados', r.saldoAtual, 4677.5);
  d.pagamentos.push({ id: 'p3', data: hoje + '-05', valor: 20000 });
  r = F.calcularDivida(d);
  eq('quitação antecipada: zera, não fica negativo', r.linhas[2].novoSaldo, 0);
  eq('quitação antecipada: pago limitado ao saldo', r.linhas[2].pago, U.round2(4677.5 * 1.05));
  eq('quitada', r.quitada, true);
  // parcelado: parcela fixa Price
  const dp = { id: 'd2', modalidade: 'parcelado', valorInicial: 1000, taxa: 2, parcelas: 12, primeiroPagamento: hoje + '-10', pagamentos: [] };
  r = F.calcularDivida(dp);
  eq('parcelado: parcela', r.parcela, 94.56); eq('parcelado: 12 meses', r.mesesRestantes, 12);
  eq('parcelado: total pago ≈ 12 × parcela', Math.abs(r.totalPago - 94.56 * 12) < 0.1, true);
  // parcelado sem juros
  r = F.calcularDivida({ id: 'd3', modalidade: 'parcelado', valorInicial: 600, taxa: 0, parcelas: 6, primeiroPagamento: hoje + '-10', pagamentos: [] });
  eq('parcelado sem juros: parcela', r.parcela, 100); eq('parcelado sem juros: juros 0', r.totalJuros, 0);

  /* ---------- Importação da planilha real ---------- */
  const arq = process.argv[2];
  if (!arq) { console.log('(sem planilha: pulei os testes de importação)'); }
  else {
    const wb = XLSX.readFile(arq);
    let res = App.Importer.analisar(wb, {});
    console.log('\nAbas:', res.abas.map((a) => a.nome + ' [' + a.tipo + ']').join(', '));
    console.log('Meses sem ano interpretados:', res.ambiguos.map((a) => a.texto + ' → ' + a.ano).join(', '));
    res.avisos.forEach((a) => console.log('Aviso:', a));
    console.log('\nConferência com os totais da planilha:');
    res.conferencia.forEach((c) => {
      // Cada mês tem de bater com o total da planilha ou ter a diferença explicada pela fórmula do total
      c.linhas.forEach((l) => { if (l.usado) eq(c.aba + ' / ' + c.titulo + ' / ' + l.mes, Math.abs(l.calculado - l.planilha) < 0.01 || !!(l.explicacao && l.explicacao.explicada), true); });
      console.log(' - ' + c.aba + ' · ' + c.titulo + ': ' + c.linhas.filter((l) => l.usado).map((l) => U.mesLabel(l.mes) + ' ' + (Math.abs(l.calculado - l.planilha) < 0.01 ? 'ok' : 'difere ' + U.brl(l.calculado - l.planilha) + ' (explicada: ' + (l.explicacao && l.explicacao.explicada) + ')')).join(', '));
      c.linhas.filter((l) => l.explicacao).slice(0, 1).forEach((l) => console.log('   ' + l.explicacao.texto));
    });
    await App.Importer.aplicar(res, path.basename(arq));
    console.log('\nImportados:', state.lancamentos.length, 'lançamentos,', state.cartoes.length, 'cartões/empréstimos');
    // Totais por mês
    const meses = F.mesesComDados();
    console.log('Meses com dados:', meses.map(U.mesLabel).join(' '));
    const nov = F.resumoMes('2026-11');
    eq('Nov/26 receitas', nov.receitas, 6600); eq('Nov/26 gastos', nov.gastos, 15898.31); eq('Nov/26 fixas', nov.fixa, 1785.31);
    eq('Nov/26 cartões + empréstimos', U.round2(nov.cartao + nov.emprestimo), 14113);
    const dez = F.resumoMes('2026-12'); eq('Dez/26 gastos', dez.gastos, 6501.51);
    const jan = F.resumoMes('2027-01'); eq('Jan/27 gastos', jan.gastos, 2977.28);
    const abr25 = F.resumoMes('2025-04'); eq('Abr/25 gastos (CONTAS 2025, todas as linhas)', abr25.gastos, U.round2(7965.59 + 182.56)); eq('Abr/25 receitas (salários 2025)', abr25.receitas, 5750);
    const set26 = F.resumoMes('2026-09'); eq('Set/26 gastos (CONTAS 2026, todas as linhas)', set26.gastos, U.round2(1012.9 + 154.06)); eq('Set/26 receitas (salários 2026)', set26.receitas, 6700);
    console.log('Nov/26: ' + F.textoMes(nov, F.resumoMes('2026-10')));
    // Reimportar a mesma planilha não duplica nada
    const antes = state.lancamentos.length;
    res = App.Importer.analisar(wb, {});
    eq('reimportação: nenhum novo', res.diff.novos.length, 0); eq('reimportação: nenhum alterado', res.diff.alterados.length, 0); eq('reimportação: nenhum removido', res.diff.removidos.length, 0);
    await App.Importer.aplicar(res, 'de novo'); eq('reimportação: mesma quantidade', state.lancamentos.length, antes);
    // Alteração na planilha é detectada e preserva o que o usuário editou
    const alvo = state.lancamentos.find((l) => l.id.indexOf('luz-2027-01') > -1);
    alvo.situacao = 'pago'; alvo.observacoes = 'paguei pelo app';
    const ws = wb.Sheets['PLANILHA FINANCEIRA'];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const rLuz = rows.findIndex((x) => x && x[0] === 'LUZ');
    ws[XLSX.utils.encode_cell({ r: rLuz, c: 3 })] = { t: 'n', v: 380 };
    res = App.Importer.analisar(wb, {});
    eq('alteração detectada', res.diff.alterados.length, 1);
    await App.Importer.aplicar(res, 'alterada');
    const luz = state.lancamentos.find((l) => l.id === alvo.id);
    eq('valor atualizado', luz.valor, 380); eq('situação preservada', luz.situacao, 'pago'); eq('observação preservada', luz.observacoes, 'paguei pelo app');
    eq('sem duplicar', state.lancamentos.length, antes);
    // Disponível agora: recebido − pago; muda ao marcar conta paga
    const mesT = '2027-02';
    let cx = F.caixaMes(mesT);
    eq('caixa fev/27: nada pago ainda', cx.pago, 0);
    eq('caixa fev/27: previsto = saldo do mês', cx.previsto, F.resumoMes(mesT).saldo);
    const condo = state.lancamentos.find((l) => l.mesRef === mesT && /condom/i.test(l.descricao));
    condo.situacao = 'pago'; condo.situacaoPresumida = false;
    cx = F.caixaMes(mesT);
    eq('marcar conta paga desconta do disponível', cx.disponivel, U.round2(cx.recebido - 258));
    eq('…e reduz o falta pagar', cx.aPagar, U.round2(F.resumoMes(mesT).gastos - 258));
    eq('…sem mudar o saldo previsto', cx.previsto, F.resumoMes(mesT).saldo);
    // Projeção
    const proj = F.projecao({ inicio: '2026-11', meses: 12 });
    eq('projeção 12 meses', proj.length, 12);
    console.log('\nProjeção: ' + proj.map((p) => U.mesLabel(p.mes) + ' ' + U.brl0(p.saldo)).join(' | '));
    const card = state.cartoes.find((c) => c.id === 'card-cartao-nubank-iasmym');
    const rc = F.resumoCartao(card); console.log('Nubank Iasmym: parcelas restantes ' + rc.parcelasRestantes + ', saldo previsto ' + U.brl(rc.saldoPrevisto));
  }
  console.log('\n' + ok + ' verificações ok, ' + falhas + ' falha(s).');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
