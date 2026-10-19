'use strict';

// Regras de cálculo do Consumo de Energia 2.0.
//
// Vive fora do script.js porque aqui não há DOM: são funções puras, que podem
// ser testadas sem navegador. O script.js lê os valores da tela e repassa para
// cá; nenhuma função deste arquivo conhece elemento de página.
//
// Carregado como <script src="calc.js"> no navegador, onde publica EnergyCalc
// no escopo global, e como módulo CommonJS no Node, onde é usado pelos testes.

(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.EnergyCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Faixas de classificação, em kWh por mês.
  const FAIXA_BAIXO = 50;
  const FAIXA_MODERADO = 150;

  // Limites de um aparelho válido.
  const HORAS_MAX = 24; // horas em um dia
  const DIAS_MAX = 31; // dias no maior mês

  /**
   * Consumo mensal em kWh.
   * A potência vem em watts, então divide por 1000 para chegar a quilowatts.
   */
  function calcularConsumo(potencia, horas, dias) {
    return (potencia * horas * dias) / 1000;
  }

  /** Custo mensal em reais, a partir do consumo em kWh e da tarifa por kWh. */
  function calcularCusto(consumo, tarifa) {
    return consumo * Number(tarifa || 0);
  }

  /**
   * Classifica o consumo mensal de um aparelho.
   * Os limites são inclusivos no piso: 50 kWh já é Moderado, 150 já é Alto.
   */
  function classificarConsumo(consumo) {
    if (consumo < FAIXA_BAIXO) return { texto: 'Baixo', classe: 'nivel-baixo' };
    if (consumo < FAIXA_MODERADO) return { texto: 'Moderado', classe: 'nivel-moderado' };
    return { texto: 'Alto', classe: 'nivel-alto' };
  }

  /**
   * Valida os campos de um aparelho antes de cadastrar.
   * Devolve null quando está tudo certo, ou a mensagem do primeiro problema.
   */
  function validarAparelho(aparelho) {
    const nome = String(aparelho && aparelho.nome != null ? aparelho.nome : '').trim();
    const potencia = Number(aparelho && aparelho.potencia);
    const horas = Number(aparelho && aparelho.horas);
    const dias = Number(aparelho && aparelho.dias);

    if (!nome) return 'Informe o nome do aparelho.';
    if (!Number.isFinite(potencia) || potencia <= 0) return 'A potência deve ser maior que zero.';
    if (!Number.isFinite(horas) || horas <= 0) return 'As horas de uso devem ser maiores que zero.';
    if (horas > HORAS_MAX) return 'As horas de uso não podem passar de 24 por dia.';
    if (!Number.isFinite(dias) || dias <= 0) return 'Os dias de uso devem ser maiores que zero.';
    if (dias > DIAS_MAX) return 'Os dias de uso não podem passar de 31 por mês.';
    return null;
  }

  /** Soma o consumo de uma lista de aparelhos já calculados. */
  function somarConsumo(aparelhos) {
    return aparelhos.reduce(function (total, a) { return total + Number(a.consumo || 0); }, 0);
  }

  /** Soma o custo de uma lista de aparelhos já calculados. */
  function somarCusto(aparelhos) {
    return aparelhos.reduce(function (total, a) { return total + Number(a.custo || 0); }, 0);
  }

  /** Participação de uma parte no total, em porcentagem. Total zero não divide. */
  function percentual(parte, total) {
    return total > 0 ? (parte / total) * 100 : 0;
  }

  /** O aparelho de maior consumo, ou null se a lista estiver vazia. */
  function maiorConsumidor(aparelhos) {
    if (!aparelhos.length) return null;
    return aparelhos.reduce(function (maior, a) {
      return Number(a.consumo || 0) > Number(maior.consumo || 0) ? a : maior;
    }, aparelhos[0]);
  }

  /** Número com duas casas e vírgula decimal, como se escreve em português. */
  function formatarNumero(valor) {
    return Number(valor).toFixed(2).replace('.', ',');
  }

  /** Valor em reais. */
  function formatarDinheiro(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  }

  return {
    FAIXA_BAIXO: FAIXA_BAIXO,
    FAIXA_MODERADO: FAIXA_MODERADO,
    HORAS_MAX: HORAS_MAX,
    DIAS_MAX: DIAS_MAX,
    calcularConsumo: calcularConsumo,
    calcularCusto: calcularCusto,
    classificarConsumo: classificarConsumo,
    validarAparelho: validarAparelho,
    somarConsumo: somarConsumo,
    somarCusto: somarCusto,
    percentual: percentual,
    maiorConsumidor: maiorConsumidor,
    formatarNumero: formatarNumero,
    formatarDinheiro: formatarDinheiro,
  };
});
