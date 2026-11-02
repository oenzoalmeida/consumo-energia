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

  /** Arredonda para duas casas (horas simuladas podem virar fração). */
  function arredondar2(valor) {
    return Math.round(Number(valor) * 100) / 100;
  }

  /**
   * Cenário econômico: mesma lista de aparelhos com as horas de uso reduzidas
   * pelo percentual informado (1 a 99). O consumo de cada item já sai
   * recalculado. É uma simulação sobre premissas, não previsão de fatura.
   */
  function simularCenarioEconomico(aparelhos, percentualReducao) {
    const p = Number(percentualReducao);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) {
      throw new RangeError('O percentual de redução deve ficar entre 1 e 99.');
    }
    return aparelhos.map(function (a) {
      const horas = arredondar2(Number(a.horas) * (1 - p / 100));
      return Object.assign({}, a, {
        horas: horas,
        consumo: calcularConsumo(Number(a.potencia), horas, Number(a.dias)),
      });
    });
  }

  /** Resumo de um cenário: consumo mensal, custo mensal e custo anual. */
  function resumoCenario(aparelhos, tarifa) {
    const consumoKwh = somarConsumo(aparelhos);
    const custoMes = calcularCusto(consumoKwh, tarifa);
    return { consumoKwh: consumoKwh, custoMes: custoMes, custoAno: custoMes * 12 };
  }

  /** Escapa um valor para CSV separado por ponto e vírgula. */
  function csvValor(valor) {
    const texto = String(valor);
    return /[;"\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  }

  /**
   * CSV da estimativa comparativa: premissas no cabeçalho (com o aviso de que
   * não é previsão da fatura), uma linha por aparelho e os totais dos dois
   * cenários. Separador ';' e decimais com vírgula, como se lê em pt-BR.
   */
  function gerarCsvEstimativa(opcoes) {
    const aparelhos = opcoes.aparelhos || [];
    const tarifa = Number(opcoes.tarifa || 0);
    const percentual = Number(opcoes.percentualReducao);
    const geradoEm = opcoes.geradoEm || new Date().toISOString();
    const economico = simularCenarioEconomico(aparelhos, percentual);
    const atual = resumoCenario(aparelhos, tarifa);
    const eco = resumoCenario(economico, tarifa);
    const linhas = [
      '# Estimativa de consumo de energia - simulação sobre premissas informadas',
      '# Gerado em: ' + geradoEm,
      '# Premissas: tarifa de R$ ' + formatarNumero(tarifa) + ' por kWh; usos cadastrados pelo usuário; redução simulada de ' + formatarNumero(percentual) + '% nas horas de uso',
      '# Estes valores são estimativas calculadas a partir das premissas acima, não a previsão exata da fatura.',
      'aparelho;potencia_w;horas_dia_atual;dias_mes;kwh_mes_atual;kwh_mes_economico;custo_mes_atual;custo_mes_economico',
    ];
    aparelhos.forEach(function (a, i) {
      const e = economico[i];
      linhas.push([
        csvValor(a.nome), Number(a.potencia), formatarNumero(a.horas), Number(a.dias),
        formatarNumero(a.consumo), formatarNumero(e.consumo),
        formatarNumero(calcularCusto(a.consumo, tarifa)), formatarNumero(calcularCusto(e.consumo, tarifa)),
      ].join(';'));
    });
    linhas.push('TOTAL;;;;' + formatarNumero(atual.consumoKwh) + ';' + formatarNumero(eco.consumoKwh) + ';' + formatarNumero(atual.custoMes) + ';' + formatarNumero(eco.custoMes));
    linhas.push('# Custo anual estimado: atual R$ ' + formatarNumero(atual.custoAno) + '; cenário econômico R$ ' + formatarNumero(eco.custoAno) + '; economia estimada R$ ' + formatarNumero(atual.custoAno - eco.custoAno));
    return linhas.join('\n') + '\n';
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
    arredondar2: arredondar2,
    simularCenarioEconomico: simularCenarioEconomico,
    resumoCenario: resumoCenario,
    gerarCsvEstimativa: gerarCsvEstimativa,
  };
});
