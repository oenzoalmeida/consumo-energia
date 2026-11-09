import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUserData } from './validate-user-data.js';

const valido = { aparelhos: [{ nome: 'Geladeira', potencia: 150, horas: 24, dias: 30, consumo: 108, custo: 86.4 }], tarifa: '0.80' };

test('accepts a well-formed payload', () => {
  assert.equal(validateUserData(valido), null);
  assert.equal(validateUserData({}), null);
});

test('rejects HTML in numeric fields (CE-3)', () => {
  const payload = { aparelhos: [{ nome: 'X', potencia: '<img src=x onerror=alert(1)>', horas: 2, dias: 30 }] };
  assert.equal(validateUserData(payload), 'Potência inválida.');
});

test('rejects out-of-range values and bad shapes', () => {
  assert.equal(validateUserData({ aparelhos: [{ nome: 'X', potencia: 100, horas: 25, dias: 30 }] }), 'Horas de uso inválidas.');
  assert.equal(validateUserData({ aparelhos: [{ nome: 'X', potencia: 100, horas: 2, dias: 32 }] }), 'Dias de uso inválidos.');
  assert.equal(validateUserData({ aparelhos: [{ nome: '', potencia: 100, horas: 2, dias: 30 }] }), 'Nome de aparelho inválido.');
  assert.equal(validateUserData({ aparelhos: 'nao-lista' }), 'Lista de aparelhos inválida.');
  assert.equal(validateUserData({ aparelhos: [{ nome: 'X', potencia: -5, horas: 2, dias: 30 }] }), 'Potência inválida.');
  assert.equal(validateUserData({ tarifa: 'abc' }), 'Tarifa inválida.');
  assert.equal(validateUserData('texto'), 'Formato de dados inválido.');
});
