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

const oldStatus=document.getElementById('cloud-save-status');
if(oldStatus)oldStatus.remove();
const status=document.createElement('p');
status.id='cloud-save-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
const statusText=document.createElement('span');
const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.hidden=true;
const reloadCloud=document.createElement('button');reloadCloud.type='button';reloadCloud.textContent='Carregar versão da nuvem';reloadCloud.hidden=true;
const keepLocal=document.createElement('button');keepLocal.type='button';keepLocal.textContent='Manter alterações desta aba';keepLocal.hidden=true;
status.append(statusText,document.createTextNode(' '),retry,reloadCloud,keepLocal);form.before(status);
const controls=[...form.querySelectorAll('input,button,select'),tarifaInput,botaoLimpar];
function lock(locked){controls.forEach(control=>control.disabled=locked);}
function report(message,canRetry=false){statusText.textContent=message;retry.hidden=!canRetry;}
lock(true);report('Carregando cenário salvo...');
let dataVersion=0;
try{
 const envelope=await EnergyCloud.load();
 const cloud=envelope.data||{};
 dataVersion=envelope.version||0;
 aparelhos=Array.isArray(cloud.aparelhos)?cloud.aparelhos:[];
 if(cloud.tarifa && Number(cloud.tarifa)>0) tarifaInput.value=cloud.tarifa;
}catch(err){
 console.error(err);report('Não foi possível carregar seu cenário. Nenhuma alteração será enviada.',true);
 retry.onclick=()=>initApp();return;
}
lock(false);report('Cenário carregado.');
let revision=0,savedRevision=0,saving=false,conflicted=false;
function reportConflict(){
 conflicted=true;saving=false;
 statusText.textContent='Este cenário foi alterado em outra aba ou dispositivo. Escolha carregar a versão da nuvem ou manter as alterações desta aba; nada é sobrescrito automaticamente.';
 retry.hidden=true;reloadCloud.hidden=false;keepLocal.hidden=false;
}
reloadCloud.onclick=async()=>{
 try{
  const fresh=await EnergyCloud.load();
  const cloud=fresh.data||{};
  dataVersion=fresh.version||0;
  aparelhos=Array.isArray(cloud.aparelhos)?cloud.aparelhos:[];
  if(cloud.tarifa && Number(cloud.tarifa)>0) tarifaInput.value=cloud.tarifa;
  revision=0;savedRevision=0;conflicted=false;
  reloadCloud.hidden=true;keepLocal.hidden=true;
  renderizar();
  report('Versão mais recente carregada. As alterações não salvas desta aba foram descartadas.');
 }catch(err){console.error(err);report('Não foi possível carregar a versão da nuvem. Tente novamente.',true);}
};
keepLocal.onclick=async()=>{
 try{
  const fresh=await EnergyCloud.load();
  dataVersion=fresh.version||0;
  conflicted=false;reloadCloud.hidden=true;keepLocal.hidden=true;
  report('Enviando as alterações desta aba por cima da versão da nuvem...');
  await savePending();
 }catch(err){console.error(err);report('Não foi possível manter suas alterações. Tente novamente.',true);}
};
async function savePending(){
 if(saving||conflicted||savedRevision===revision)return;
 saving=true;const targetRevision=revision;
 const snapshot={aparelhos:aparelhos.map(a=>({...a})),tarifa:tarifaInput.value};
 report('Salvando alterações...');
 try{
  const result=await EnergyCloud.save(snapshot,dataVersion);
  if(result&&Number.isInteger(result.version))dataVersion=result.version;
  savedRevision=targetRevision;
  report(savedRevision===revision?'Alterações salvas.':'Há alterações aguardando envio.');
 }catch(err){
  console.error(err);
  if(err&&err.status===409){reportConflict();return;}
  report('Não foi possível salvar. Suas alterações continuam nesta tela.',true);saving=false;return;
 }
 saving=false;if(savedRevision!==revision)await savePending();
}
retry.onclick=()=>savePending();
function persist(){revision++;report('Alterações ainda não salvas.');clearTimeout(saveTimer);saveTimer=setTimeout(savePending,250);}
// As regras de cálculo vivem em calc.js, sem DOM, para poderem ser testadas.
const {calcularConsumo,classificarConsumo,validarAparelho,somarConsumo,somarCusto,percentual,maiorConsumidor,formatarNumero,formatarDinheiro}=EnergyCalc;
function tarifaAtual(){return Number(tarifaInput.value||0);}
function calcularCusto(consumo){return EnergyCalc.calcularCusto(consumo,tarifaAtual());}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function atualizarValores(){aparelhos.forEach(a=>{a.consumo=calcularConsumo(Number(a.potencia),Number(a.horas),Number(a.dias));a.custo=calcularCusto(a.consumo);});}
function atualizarResumo(){const consumo=somarConsumo(aparelhos);const custo=somarCusto(aparelhos);consumoTotalElemento.textContent=formatarNumero(consumo)+' kWh';custoTotalElemento.textContent=formatarDinheiro(custo);custoAnualElemento.textContent=formatarDinheiro(custo*12);quantidadeElemento.textContent=String(aparelhos.length);atualizarDestaque(consumo);}
function atualizarDestaque(total){if(!aparelhos.length){destaqueConsumo.className='destaque-vazio';destaqueConsumo.textContent='Cadastre aparelhos para visualizar a análise.';return;}const maior=maiorConsumidor(aparelhos);const pct=percentual(maior.consumo,total);destaqueConsumo.className='destaque';destaqueConsumo.innerHTML=`<strong>Maior consumidor: ${esc(maior.nome)}</strong><span>${formatarNumero(maior.consumo)} kWh/mês, equivalente a ${formatarNumero(pct)}% do consumo cadastrado.</span>`;}
function atualizarGrafico(){graficoConsumo.innerHTML='';if(!aparelhos.length){graficoConsumo.innerHTML='<p class="grafico-vazio">Nenhum dado disponível.</p>';return;}const ord=[...aparelhos].sort((a,b)=>b.consumo-a.consumo);const max=ord[0].consumo;ord.forEach(a=>{const largura=max>0?(a.consumo/max)*100:0;const item=document.createElement('div');item.className='item-grafico';item.innerHTML=`<span class="nome-grafico">${esc(a.nome)}</span><div class="barra-fundo"><div class="barra-consumo" style="width:${largura}%"></div></div><span class="valor-grafico">${formatarNumero(a.consumo)} kWh</span>`;graficoConsumo.appendChild(item);});}
function renderizar(){atualizarValores();listaAparelhos.innerHTML='';const total=somarConsumo(aparelhos);mensagemVazia.style.display=aparelhos.length?'none':'block';botaoLimpar.style.display=aparelhos.length?'block':'none';aparelhos.forEach((a,i)=>{const pct=percentual(a.consumo,total);const nivel=classificarConsumo(a.consumo);const tr=document.createElement('tr');tr.innerHTML=`<td data-label="Aparelho">${esc(a.nome)}</td><td data-label="Potência">${esc(a.potencia)} W</td><td data-label="Uso">${esc(a.horas)} h/dia<br>${esc(a.dias)} dias/mês</td><td data-label="Consumo">${formatarNumero(a.consumo)} kWh</td><td data-label="Nível"><span class="nivel ${nivel.classe}">${nivel.texto}</span></td><td data-label="Custo">${formatarDinheiro(a.custo)}</td><td data-label="Participação">${formatarNumero(pct)}%</td><td><div class="acoes"><button class="botao-editar" data-edit="${i}">Editar</button><button class="botao-excluir" data-delete="${i}">Excluir</button></div></td>`;listaAparelhos.appendChild(tr);});listaAparelhos.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editar(Number(b.dataset.edit)));listaAparelhos.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>excluir(Number(b.dataset.delete)));atualizarResumo();atualizarGrafico();}
function cancelar(){form.reset();indiceEdicao.value='';botaoSalvar.textContent='Adicionar aparelho';botaoCancelar.classList.add('oculto');if(Number(tarifaInput.value)<=0)tarifaInput.value='1.00';}
function editar(i){const a=aparelhos[i];nomeInput.value=a.nome;potenciaInput.value=a.potencia;horasInput.value=a.horas;diasInput.value=a.dias;indiceEdicao.value=String(i);botaoSalvar.textContent='Salvar alterações';botaoCancelar.classList.remove('oculto');nomeInput.focus();}
function excluir(i){if(!confirm('Deseja excluir este aparelho?'))return;aparelhos.splice(i,1);renderizar();persist();}

form.addEventListener('submit',e=>{e.preventDefault();const nome=nomeInput.value.trim(),potencia=Number(potenciaInput.value),horas=Number(horasInput.value),dias=Number(diasInput.value);const erro=validarAparelho({nome,potencia,horas,dias});if(erro){alert(erro);return;}const a={nome,potencia,horas,dias,consumo:0,custo:0};if(indiceEdicao.value!=='')aparelhos[Number(indiceEdicao.value)]=a;else aparelhos.push(a);renderizar();persist();cancelar();});
botaoLimpar.addEventListener('click',()=>{if(aparelhos.length&&confirm('Deseja excluir todos os aparelhos cadastrados?')){aparelhos=[];renderizar();persist();}});
botaoCancelar.addEventListener('click',cancelar);
tarifaInput.addEventListener('change',()=>{if(Number(tarifaInput.value)<=0)tarifaInput.value='1.00';renderizar();persist();});
// Comparação de cenários: mesma lista de aparelhos com as horas reduzidas pelo
// percentual simulado. A tarifa e os usos são premissas do usuário; o painel e
// o CSV exportado dizem isso explicitamente (estimativa, não previsão da fatura).
const secaoComparacao=document.getElementById('comparacao');
if(secaoComparacao){
 const pctInput=document.getElementById('percentual-economia');
 const resultadoComparacao=document.getElementById('resultado-comparacao');
 function renderComparacao(){
  const p=Number(pctInput.value||20);
  let economico;
  try{economico=EnergyCalc.simularCenarioEconomico(aparelhos,p);}catch(err){resultadoComparacao.textContent=err.message;return;}
  if(!aparelhos.length){resultadoComparacao.textContent='Cadastre aparelhos para comparar cenários.';return;}
  const atual=EnergyCalc.resumoCenario(aparelhos,tarifaAtual());
  const eco=EnergyCalc.resumoCenario(economico,tarifaAtual());
  resultadoComparacao.innerHTML=
   `<table class="tabela-comparacao"><thead><tr><th>Cenário</th><th>kWh/mês</th><th>Custo/mês</th><th>Custo/ano</th></tr></thead><tbody>`+
   `<tr><td>Atual</td><td>${formatarNumero(atual.consumoKwh)}</td><td>${formatarDinheiro(atual.custoMes)}</td><td>${formatarDinheiro(atual.custoAno)}</td></tr>`+
   `<tr><td>Econômico (-${formatarNumero(p)}% de uso)</td><td>${formatarNumero(eco.consumoKwh)}</td><td>${formatarDinheiro(eco.custoMes)}</td><td>${formatarDinheiro(eco.custoAno)}</td></tr>`+
   `</tbody></table><p class="premissas-comparacao">Estimativa calculada a partir da tarifa e dos usos que você informou - são premissas, não a previsão exata da fatura.</p>`;
 }
 document.getElementById('botao-comparar').onclick=renderComparacao;
 document.getElementById('botao-exportar').onclick=()=>{
  const p=Number(pctInput.value||20);
  let csv;
  try{csv=EnergyCalc.gerarCsvEstimativa({aparelhos,tarifa:tarifaAtual(),percentualReducao:p,geradoEm:new Date().toISOString()});}
  catch(err){resultadoComparacao.textContent=err.message;return;}
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='estimativa-consumo.csv';
  link.click();
  URL.revokeObjectURL(link.href);
 };
}

renderizar();
}
