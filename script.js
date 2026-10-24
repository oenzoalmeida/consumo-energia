'use strict';

const authScript=document.createElement('script');
authScript.src='auth.js';
authScript.onload=()=>EnergyCloud.ready.then(initApp);
authScript.onerror=()=>alert('Não foi possível carregar a autenticação. Tente novamente.');
document.head.appendChild(authScript);

async function initApp(){
const form=document.getElementById('form-aparelho');
const nomeInput=document.getElementById('nome');
const potenciaInput=document.getElementById('potencia');
const horasInput=document.getElementById('horas');
const diasInput=document.getElementById('dias');
const tarifaInput=document.getElementById('tarifa');
const listaAparelhos=document.getElementById('lista-aparelhos');
const mensagemVazia=document.getElementById('mensagem-vazia');
const consumoTotalElemento=document.getElementById('consumo-total');
const custoTotalElemento=document.getElementById('custo-total');
const custoAnualElemento=document.getElementById('custo-anual');
const quantidadeElemento=document.getElementById('quantidade-aparelhos');
const destaqueConsumo=document.getElementById('destaque-consumo');
const graficoConsumo=document.getElementById('grafico-consumo');
const indiceEdicao=document.getElementById('indice-edicao');
const botaoSalvar=document.getElementById('botao-salvar');
const botaoCancelar=document.getElementById('botao-cancelar');
const botaoLimpar=document.getElementById('botao-limpar');
let aparelhos=[];
let saveTimer=null;

try{
 const cloud=await EnergyCloud.load();
 aparelhos=Array.isArray(cloud.aparelhos)?cloud.aparelhos:[];
 if(cloud.tarifa && Number(cloud.tarifa)>0) tarifaInput.value=cloud.tarifa;
}catch(err){console.error(err);}

function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>EnergyCloud.save({aparelhos,tarifa:tarifaInput.value}).catch(console.error),250);}
// As regras de cálculo vivem em calc.js, sem DOM, para poderem ser testadas.
const {calcularConsumo,classificarConsumo,validarAparelho,somarConsumo,somarCusto,percentual,maiorConsumidor,formatarNumero,formatarDinheiro}=EnergyCalc;
function tarifaAtual(){return Number(tarifaInput.value||0);}
function calcularCusto(consumo){return EnergyCalc.calcularCusto(consumo,tarifaAtual());}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function atualizarValores(){aparelhos.forEach(a=>{a.consumo=calcularConsumo(Number(a.potencia),Number(a.horas),Number(a.dias));a.custo=calcularCusto(a.consumo);});}
function atualizarResumo(){const consumo=somarConsumo(aparelhos);const custo=somarCusto(aparelhos);consumoTotalElemento.textContent=formatarNumero(consumo)+' kWh';custoTotalElemento.textContent=formatarDinheiro(custo);custoAnualElemento.textContent=formatarDinheiro(custo*12);quantidadeElemento.textContent=String(aparelhos.length);atualizarDestaque(consumo);}
function atualizarDestaque(total){if(!aparelhos.length){destaqueConsumo.className='destaque-vazio';destaqueConsumo.textContent='Cadastre aparelhos para visualizar a análise.';return;}const maior=maiorConsumidor(aparelhos);const pct=percentual(maior.consumo,total);destaqueConsumo.className='destaque';destaqueConsumo.innerHTML=`<strong>Maior consumidor: ${esc(maior.nome)}</strong><span>${formatarNumero(maior.consumo)} kWh/mês, equivalente a ${formatarNumero(pct)}% do consumo cadastrado.</span>`;}
function atualizarGrafico(){graficoConsumo.innerHTML='';if(!aparelhos.length){graficoConsumo.innerHTML='<p class="grafico-vazio">Nenhum dado disponível.</p>';return;}const ord=[...aparelhos].sort((a,b)=>b.consumo-a.consumo);const max=ord[0].consumo;ord.forEach(a=>{const largura=max>0?(a.consumo/max)*100:0;const item=document.createElement('div');item.className='item-grafico';item.innerHTML=`<span class="nome-grafico">${esc(a.nome)}</span><div class="barra-fundo"><div class="barra-consumo" style="width:${largura}%"></div></div><span class="valor-grafico">${formatarNumero(a.consumo)} kWh</span>`;graficoConsumo.appendChild(item);});}
function renderizar(){atualizarValores();listaAparelhos.innerHTML='';const total=somarConsumo(aparelhos);mensagemVazia.style.display=aparelhos.length?'none':'block';botaoLimpar.style.display=aparelhos.length?'block':'none';aparelhos.forEach((a,i)=>{const pct=percentual(a.consumo,total);const nivel=classificarConsumo(a.consumo);const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(a.nome)}</td><td>${a.potencia} W</td><td>${a.horas} h/dia<br>${a.dias} dias/mês</td><td>${formatarNumero(a.consumo)} kWh</td><td><span class="nivel ${nivel.classe}">${nivel.texto}</span></td><td>${formatarDinheiro(a.custo)}</td><td>${formatarNumero(pct)}%</td><td><div class="acoes"><button class="botao-editar" data-edit="${i}">Editar</button><button class="botao-excluir" data-delete="${i}">Excluir</button></div></td>`;listaAparelhos.appendChild(tr);});listaAparelhos.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editar(Number(b.dataset.edit)));listaAparelhos.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>excluir(Number(b.dataset.delete)));atualizarResumo();atualizarGrafico();persist();}
function cancelar(){form.reset();indiceEdicao.value='';botaoSalvar.textContent='Adicionar aparelho';botaoCancelar.classList.add('oculto');if(Number(tarifaInput.value)<=0)tarifaInput.value='1.00';}
function editar(i){const a=aparelhos[i];nomeInput.value=a.nome;potenciaInput.value=a.potencia;horasInput.value=a.horas;diasInput.value=a.dias;indiceEdicao.value=String(i);botaoSalvar.textContent='Salvar alterações';botaoCancelar.classList.remove('oculto');nomeInput.focus();}
function excluir(i){if(!confirm('Deseja excluir este aparelho?'))return;aparelhos.splice(i,1);renderizar();}

form.addEventListener('submit',e=>{e.preventDefault();const nome=nomeInput.value.trim(),potencia=Number(potenciaInput.value),horas=Number(horasInput.value),dias=Number(diasInput.value);const erro=validarAparelho({nome,potencia,horas,dias});if(erro){alert(erro);return;}const a={nome,potencia,horas,dias,consumo:0,custo:0};if(indiceEdicao.value!=='')aparelhos[Number(indiceEdicao.value)]=a;else aparelhos.push(a);renderizar();cancelar();});
botaoLimpar.addEventListener('click',()=>{if(aparelhos.length&&confirm('Deseja excluir todos os aparelhos cadastrados?')){aparelhos=[];renderizar();}});
botaoCancelar.addEventListener('click',cancelar);
tarifaInput.addEventListener('change',()=>{if(Number(tarifaInput.value)<=0)tarifaInput.value='1.00';renderizar();});
renderizar();
}
