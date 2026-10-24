'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const calc = require('../calc.js');

describe('calcularConsumo', () => {
  test('converte watts em kWh por mês', () => {
    // 100 W ligados 5 h/dia por 30 dias = 15.000 Wh = 15 kWh
    assert.equal(calc.calcularConsumo(100, 5, 30), 15);
  });

  test('uma geladeira de 150 W ligada o dia inteiro', () => {
    assert.equal(calc.calcularConsumo(150, 24, 30), 108);
  });

  test('potência zero não consome nada', () => {
    assert.equal(calc.calcularConsumo(0, 24, 30), 0);
  });

  test('não arredonda o resultado', () => {
    // 1 W por 1 h em 1 dia = 0,001 kWh; arredondar aqui zeraria o valor
    assert.equal(calc.calcularConsumo(1, 1, 1), 0.001);
  });
});

describe('calcularCusto', () => {
  test('multiplica o consumo pela tarifa', () => {
    assert.equal(calc.calcularCusto(15, 0.8), 12);
  });

  test('tarifa ausente vale zero em vez de virar NaN', () => {
    assert.equal(calc.calcularCusto(15, undefined), 0);
    assert.equal(calc.calcularCusto(15, ''), 0);
    assert.equal(calc.calcularCusto(15, null), 0);
  });

  test('aceita a tarifa como texto, que é como ela chega do formulário', () => {
    assert.equal(calc.calcularCusto(10, '0.75'), 7.5);
  });
});

describe('classificarConsumo', () => {
  test('abaixo de 50 kWh é baixo', () => {
    assert.equal(calc.classificarConsumo(49.99).texto, 'Baixo');
    assert.equal(calc.classificarConsumo(0).texto, 'Baixo');
  });

  test('50 kWh exatos já é moderado', () => {
    // O limite é inclusivo no piso; fixado aqui para não mudar sem querer.
    assert.equal(calc.classificarConsumo(50).texto, 'Moderado');
  });

  test('entre 50 e 150 é moderado', () => {
    assert.equal(calc.classificarConsumo(149.99).texto, 'Moderado');
  });

  test('150 kWh exatos já é alto', () => {
    assert.equal(calc.classificarConsumo(150).texto, 'Alto');
  });

  test('acima de 150 é alto', () => {
    assert.equal(calc.classificarConsumo(500).texto, 'Alto');
  });

  test('devolve a classe de estilo junto com o texto', () => {
    assert.deepEqual(calc.classificarConsumo(10), { texto: 'Baixo', classe: 'nivel-baixo' });
    assert.deepEqual(calc.classificarConsumo(100), { texto: 'Moderado', classe: 'nivel-moderado' });
    assert.deepEqual(calc.classificarConsumo(200), { texto: 'Alto', classe: 'nivel-alto' });
  });
});

describe('validarAparelho', () => {
  const valido = { nome: 'Geladeira', potencia: 150, horas: 24, dias: 30 };

  test('aceita um aparelho preenchido corretamente', () => {
    assert.equal(calc.validarAparelho(valido), null);
  });

  test('recusa nome vazio ou só com espaços', () => {
    assert.ok(calc.validarAparelho({ ...valido, nome: '' }));
    assert.ok(calc.validarAparelho({ ...valido, nome: '   ' }));
  });

  test('recusa potência zero ou negativa', () => {
    assert.ok(calc.validarAparelho({ ...valido, potencia: 0 }));
    assert.ok(calc.validarAparelho({ ...valido, potencia: -5 }));
  });

  test('aceita 24 horas por dia, recusa 25', () => {
    assert.equal(calc.validarAparelho({ ...valido, horas: 24 }), null);
    assert.ok(calc.validarAparelho({ ...valido, horas: 25 }));
  });

  test('aceita 31 dias por mês, recusa 32', () => {
    assert.equal(calc.validarAparelho({ ...valido, dias: 31 }), null);
    assert.ok(calc.validarAparelho({ ...valido, dias: 32 }));
  });

  test('recusa campos que não são número', () => {
    assert.ok(calc.validarAparelho({ ...valido, potencia: 'abc' }));
    assert.ok(calc.validarAparelho({ ...valido, horas: NaN }));
  });

  test('a mensagem diz qual campo está errado', () => {
    assert.match(calc.validarAparelho({ ...valido, potencia: 0 }), /pot[êe]ncia/i);
    assert.match(calc.validarAparelho({ ...valido, horas: 25 }), /horas/i);
    assert.match(calc.validarAparelho({ ...valido, dias: 32 }), /dias/i);
  });
});

describe('somas e participação', () => {
  const aparelhos = [
    { nome: 'Geladeira', consumo: 108, custo: 86.4 },
    { nome: 'Chuveiro', consumo: 90, custo: 72 },
    { nome: 'Notebook', consumo: 9, custo: 7.2 },
  ];

  test('soma o consumo da lista', () => {
    assert.equal(calc.somarConsumo(aparelhos), 207);
  });

  test('soma o custo da lista', () => {
    assert.equal(calc.somarCusto(aparelhos), 165.6);
  });

  test('lista vazia soma zero', () => {
    assert.equal(calc.somarConsumo([]), 0);
    assert.equal(calc.somarCusto([]), 0);
  });

  test('encontra o maior consumidor', () => {
    assert.equal(calc.maiorConsumidor(aparelhos).nome, 'Geladeira');
  });

  test('lista vazia não tem maior consumidor', () => {
    assert.equal(calc.maiorConsumidor([]), null);
  });

  test('calcula a participação de um aparelho no total', () => {
    assert.equal(calc.percentual(50, 200), 25);
  });

  test('total zero devolve zero em vez de dividir por zero', () => {
    // Era o caso de todos os aparelhos com potência mínima: sem a guarda,
    // o resumo mostraria NaN%.
    assert.equal(calc.percentual(0, 0), 0);
  });
});

describe('formatação', () => {
  test('número usa duas casas e vírgula decimal', () => {
    assert.equal(calc.formatarNumero(15), '15,00');
    assert.equal(calc.formatarNumero(1.005), '1,00');
    assert.equal(calc.formatarNumero(0), '0,00');
  });
});

describe('fluxo completo de um aparelho', () => {
  test('da entrada do formulário até a linha da tabela', () => {
    const entrada = { nome: 'Chuveiro elétrico', potencia: 5500, horas: 0.5, dias: 30 };
    assert.equal(calc.validarAparelho(entrada), null);

    const consumo = calc.calcularConsumo(entrada.potencia, entrada.horas, entrada.dias);
    assert.equal(consumo, 82.5);

    const custo = calc.calcularCusto(consumo, '0.95');
    assert.equal(custo.toFixed(2), '78.38');

    assert.equal(calc.classificarConsumo(consumo).texto, 'Moderado');
  });
});
