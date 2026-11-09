// Server-side validation of the PUT /api/data payload (CE-3). The client
// validates with calc.js validarAparelho, but the route accepted any JSON,
// letting a crafted client store HTML in numeric fields. Rules mirror the
// form's: same ranges, same limits.
const NOME_MAX = 80;
const POTENCIA_MAX = 100000; // watts
const HORAS_MAX = 24;
const DIAS_MAX = 31;
const TARIFA_MAX = 10000; // R$/kWh
const APARELHOS_MAX = 200;

function numeroNoIntervalo(valor, minExclusivo, max) {
  const n = Number(valor);
  return Number.isFinite(n) && n > minExclusivo && n <= max;
}

// Returns null when valid, or an error message for a 400 response.
export function validateUserData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Formato de dados inválido.';
  if (data.aparelhos !== undefined) {
    if (!Array.isArray(data.aparelhos)) return 'Lista de aparelhos inválida.';
    if (data.aparelhos.length > APARELHOS_MAX) return 'Limite de aparelhos excedido.';
    for (const a of data.aparelhos) {
      if (!a || typeof a !== 'object' || Array.isArray(a)) return 'Aparelho inválido.';
      const nome = typeof a.nome === 'string' ? a.nome.trim() : '';
      if (!nome || nome.length > NOME_MAX) return 'Nome de aparelho inválido.';
      if (!numeroNoIntervalo(a.potencia, 0, POTENCIA_MAX)) return 'Potência inválida.';
      if (!numeroNoIntervalo(a.horas, 0, HORAS_MAX)) return 'Horas de uso inválidas.';
      if (!numeroNoIntervalo(a.dias, 0, DIAS_MAX)) return 'Dias de uso inválidos.';
      for (const campo of ['consumo', 'custo']) {
        if (a[campo] !== undefined) {
          const n = Number(a[campo]);
          if (!Number.isFinite(n) || n < 0) return `Campo ${campo} inválido.`;
        }
      }
    }
  }
  if (data.tarifa !== undefined) {
    const n = Number(data.tarifa);
    if (!Number.isFinite(n) || n < 0 || n > TARIFA_MAX) return 'Tarifa inválida.';
  }
  return null;
}
