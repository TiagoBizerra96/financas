/* Categorias e regras para classificar as linhas da planilha.
 * "grupo" decide em qual indicador o valor entra:
 *   receita · fixa (despesas fixas) · cartao · emprestimo (empréstimos, acordos e parcelamentos) · variavel · reserva (dinheiro guardado) */
(function (App) {
  'use strict';
  const U = App.U;
  const GRUPOS = {
    receita: 'Receita', fixa: 'Despesa fixa', cartao: 'Cartão de crédito', emprestimo: 'Empréstimo / acordo',
    variavel: 'Despesa variável', reserva: 'Reserva / poupança',
  };

  const PADRAO = [
    ['Salário', 'receita'], ['Renda extra', 'receita'], ['Outras receitas', 'receita'], ['Empréstimo recebido', 'receita'],
    ['Moradia', 'fixa'], ['Contas da casa', 'fixa'], ['Telefone e internet', 'fixa'], ['Educação e filhos', 'fixa'], ['Outras despesas fixas', 'fixa'],
    ['Cartão de crédito', 'cartao'], ['Empréstimos e acordos', 'emprestimo'],
    ['Alimentação', 'variavel'], ['Transporte', 'variavel'], ['Saúde', 'variavel'], ['Lazer', 'variavel'], ['Compras', 'variavel'], ['Outras despesas', 'variavel'],
    ['Reserva / poupança', 'reserva'],
  ];

  const Categorias = {
    GRUPOS,
    padrao() { return PADRAO.map(([nome, grupo]) => ({ id: 'cat-' + U.slug(nome), nome, grupo, padrao: true })); },
    /** Categoria e grupo de uma linha de despesa da planilha, pelo nome. */
    classificar(label) {
      const n = U.norm(label);
      if (/EMPRESTIMO|NEGOCIA|DESENROLA|SERASA|ACORDO|FINANCIAMENTO/.test(n)) return { categoria: 'Empréstimos e acordos', grupo: 'emprestimo', tipoConta: 'emprestimo' };
      if (/^CARTAO|CARTAO |NUBANK|NEON|AMERICANAS|SHOPPE|SHOPEE|IFINTY|INFINITY|BANCO PAN|MERCADO PAGO|INTER\b|DUQUINHA|DI SANTINI/.test(n)) return { categoria: 'Cartão de crédito', grupo: 'cartao', tipoConta: 'cartao' };
      if (/CONDOMIN|HABITACAO|TENDA|CAIXA DA TORRE|ALUGUEL|IPTU/.test(n)) return { categoria: 'Moradia', grupo: 'fixa' };
      if (/^LUZ|ENERGIA|^GAS|AGUA/.test(n)) return { categoria: 'Contas da casa', grupo: 'fixa' };
      if (/CELULAR|INTERNET|TELEFONE/.test(n)) return { categoria: 'Telefone e internet', grupo: 'fixa' };
      if (/CRECHE|ESCOLA|MENTORIA|CURSO|FACULDADE/.test(n)) return { categoria: 'Educação e filhos', grupo: 'fixa' };
      if (/POUPANCA|RESERVA|INVESTIMENTO/.test(n)) return { categoria: 'Reserva / poupança', grupo: 'reserva' };
      return { categoria: 'Outras despesas fixas', grupo: 'fixa' };
    },
    classificarReceita(label) {
      const n = U.norm(label);
      if (/SALARIO|QUINZENA/.test(n)) return 'Salário';
      if (/EXTRA/.test(n)) return 'Renda extra';
      return 'Outras receitas';
    },
    /** Grupo efetivo de um lançamento (a categoria cadastrada manda). */
    grupoDe(l) {
      if (l.tipo === 'receita') return 'receita';
      const c = App.store.state.categorias.find((x) => x.nome === l.categoria);
      return (c && c.grupo !== 'receita') ? c.grupo : (l.grupo || 'variavel');
    },
  };
  App.Categorias = Categorias;
})(window.App = window.App || {});
