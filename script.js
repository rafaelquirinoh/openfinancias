/* ==========================================================================
   OPEN FINANCING — script.js
   Sistema pessoal de organização financeira — 100% client-side (LocalStorage)
   ========================================================================== */

/* ============================== 1. ESTADO ================================ */

const STORAGE_KEY = 'openfinancing_db_v1';

const DEFAULT_CATEGORIAS_DESPESA = ['Alimentação','Transporte','Moradia','Saúde','Educação','Lazer','Compras','Assinaturas','Contas','Transferências','Outros'];
const DEFAULT_CATEGORIAS_RECEITA = ['Salário','Freelance','Investimentos','Presente','Reembolso','Vendas','Outros'];
const TIPOS_META = ['Casa','Carro','Moto','Viagem','Computador','Celular','Educação','Reserva de emergência','Investimentos','Objetivo pessoal','Meta personalizada'];
const TIPOS_CONTA = ['Conta corrente','Conta poupança','Carteira','Conta digital','Investimentos'];
const FORMAS_PAGAMENTO = ['Dinheiro','Débito','Pix','Transferência','Cartão de crédito'];
const CATS_PATRIMONIO = ['Dinheiro','Contas bancárias','Poupança','Investimentos','Outros ativos'];
const BANDEIRAS = ['Visa','Mastercard','Elo','American Express','Hipercard','Outra'];

// Cores "de fábrica" por banco (usadas quando o usuário não personaliza manualmente)
const BANK_PRESETS = {
  'nubank': ['#8A05BE','#C238C9'], 'inter': ['#FF7A00','#FFB258'], 'itau': ['#EC7000','#004A8D'],
  'itaú': ['#EC7000','#004A8D'], 'bradesco': ['#CC092F','#7A0000'], 'santander': ['#EC0000','#8C0000'],
  'banco do brasil': ['#FFDD00','#0033A0'], 'caixa': ['#0070AD','#005CA9'], 'c6 bank': ['#1F1F1F','#4A4A4A'],
  'c6': ['#1F1F1F','#4A4A4A'], 'picpay': ['#21C25E','#0EA24A'], 'next': ['#00B050','#00CC4C'],
  'neon': ['#00E0FF','#0084FF'], 'will bank': ['#6C4CE0','#8F6CFF'], 'mercado pago': ['#00B1EA','#0090C8']
};

// Cores padrão por tipo de meta / conta (o usuário pode sobrescrever manualmente)
const TIPO_META_COLOR = {
  'Casa':'#F5A623','Carro':'#2F5CFF','Moto':'#0EA5E9','Viagem':'#EC4899','Computador':'#7C4DFF',
  'Celular':'#A855F7','Educação':'#17A673','Reserva de emergência':'#EF4444','Investimentos':'#14B8A6',
  'Objetivo pessoal':'#F97316','Meta personalizada':'#6B7280'
};
const TIPO_CONTA_COLOR = { 'Conta corrente':'#2F5CFF','Conta poupança':'#17A673','Carteira':'#F5A623','Conta digital':'#7C4DFF','Investimentos':'#14B8A6' };
const TIPO_CONTA_ICON = { 'Conta corrente':'landmark','Conta poupança':'piggy-bank','Carteira':'wallet','Conta digital':'smartphone','Investimentos':'trending-up' };

function defaultDB(){
  return {
    receitas: [],
    despesas: [],
    cartoes: [],
    contas: [],
    metas: [],
    orcamentos: [],
    parcelamentos: [],
    recorrentes: [],
    patrimonio: [],
    patrimonioHistorico: [],
    categoriasDespesa: DEFAULT_CATEGORIAS_DESPESA.slice(),
    categoriasReceita: DEFAULT_CATEGORIAS_RECEITA.slice(),
    config: { tema: 'light', sidebarCollapsed: false }
  };
}

let DB = loadData();
const CHARTS = {};
let currentUser = null;      // usuário logado com Google (null = modo local/convidado)
let cloudSaveTimer = null;   // agrupa gravações rápidas antes de enviar para o Firestore

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultDB();
    const parsed = JSON.parse(raw);
    const base = defaultDB();
    return Object.assign(base, parsed, {
      categoriasDespesa: (parsed.categoriasDespesa && parsed.categoriasDespesa.length) ? parsed.categoriasDespesa : base.categoriasDespesa,
      categoriasReceita: (parsed.categoriasReceita && parsed.categoriasReceita.length) ? parsed.categoriasReceita : base.categoriasReceita,
      config: Object.assign(base.config, parsed.config || {})
    });
  }catch(e){
    console.error('Falha ao carregar dados', e);
    return defaultDB();
  }
}

function saveData(){
  // Modo convidado (sem login): continua salvando no LocalStorage deste navegador, como sempre.
  if(!currentUser){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    }catch(e){
      console.error('Falha ao salvar dados', e);
      toast('Erro ao salvar', 'Não foi possível salvar os dados no armazenamento local.', 'error');
    }
  } else {
    // Modo logado: sincroniza com o Firestore (dados isolados por UID), com um pequeno
    // atraso para agrupar alterações rápidas em uma única gravação.
    scheduleCloudSync();
  }
}

/* ============================== 1B. LOGIN COM GOOGLE / SINCRONIZAÇÃO NA NUVEM ===== */
// Tudo aqui é opcional/aditivo: se o Firebase não estiver configurado (veja
// firebase-config.js) ou o script não carregar (ex: sem internet), o app continua
// funcionando 100% normalmente no modo local acima.

function firebaseReady(){
  return typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined'
    && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('COLE_AQUI');
}

function initFirebaseAuth(){
  if(!firebaseReady()){
    updateAuthUI(); // mostra o botão de login normalmente; ele avisa se for clicado sem configuração
    return;
  }
  try{
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    auth.onAuthStateChanged(async (user)=>{
      if(user){
        currentUser = user;
        await loadCloudData(user.uid);
      } else {
        currentUser = null;
        DB = loadData(); // volta a exibir os dados locais deste navegador (modo convidado)
      }
      updateAuthUI();
      refreshCurrentView();
    });
  }catch(e){
    console.error('Falha ao iniciar o Firebase', e);
  }
}

async function loadCloudData(uid){
  try{
    const docRef = firebase.firestore().collection('users').doc(uid);
    const snap = await docRef.get();
    if(snap.exists){
      const cloud = snap.data();
      const base = defaultDB();
      DB = Object.assign(base, cloud, { config: Object.assign(base.config, cloud.config||{}) });
    } else {
      DB = defaultDB();
      await docRef.set(DB);
    }
    toast('Login realizado', 'Seus dados foram carregados da nuvem.', 'success');
  }catch(e){
    console.error('Erro ao carregar dados da nuvem', e);
    toast('Erro de sincronização', 'Não foi possível carregar seus dados da nuvem.', 'error');
    DB = defaultDB();
  }
}

function scheduleCloudSync(){
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(()=>{
    if(!currentUser) return;
    firebase.firestore().collection('users').doc(currentUser.uid).set(DB).catch(e=>{
      console.error('Falha ao sincronizar com a nuvem', e);
      toast('Erro de sincronização', 'Não foi possível salvar na nuvem agora. Suas alterações continuam nesta tela.', 'error');
    });
  }, 600);
}

function googleLogin(){
  if(!firebaseReady()){
    toast('Login com Google não configurado', 'Preencha o arquivo firebase-config.js com as chaves do seu projeto Firebase (veja os comentários no próprio arquivo).', 'error');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(e=>{
    console.error('Erro ao entrar com Google', e);
    toast('Erro ao entrar', 'Não foi possível concluir o login com Google.', 'error');
  });
}

function googleLogout(){
  if(!firebaseReady()) return;
  firebase.auth().signOut().catch(e=>console.error('Erro ao sair', e));
}

function updateAuthUI(){
  const box = document.getElementById('auth-box');
  if(!box) return;
  if(currentUser){
    const foto = currentUser.photoURL;
    const inicial = (currentUser.displayName||currentUser.email||'?').charAt(0).toUpperCase();
    box.innerHTML = `<div class="user-chip">
      ${foto ? `<img src="${escapeHtml(foto)}" alt="">` : `<span class="user-chip-avatar-fallback">${escapeHtml(inicial)}</span>`}
      <div class="user-chip-info">
        <div class="user-chip-name">${escapeHtml(currentUser.displayName||currentUser.email)}</div>
        <div class="user-chip-status">Sincronizado</div>
      </div>
      <button class="icon-btn tiny" data-action="google-logout" aria-label="Sair" title="Sair"><span data-lucide="log-out"></span></button>
    </div>`;
  } else {
    box.innerHTML = `<button class="btn btn-outline btn-block" data-action="google-login">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29.1 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z"/>
        <path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5.1l-6-5c-1.9 1.4-4.4 2.2-6.9 2.2-5.3 0-9.7-2.6-11.4-6.9l-6.6 5.1C9.6 39 16.2 43.5 24 43.5z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.4 5.4l6 5C40.1 35.7 43.5 30.3 43.5 24c0-1.2-.1-2.4-.4-3.5z"/>
      </svg>
      Entrar com Google
    </button>`;
  }
  refreshIcons();
}

/* ============================== 2. UTILITÁRIOS ============================ */

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function formatCurrency(v){
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function formatNumber(v, casas){
  return Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: casas||0, maximumFractionDigits: casas||0 });
}

function formatDate(iso){
  if(!iso) return '—';
  const d = parseISODate(iso);
  if(!d) return '—';
  return d.toLocaleDateString('pt-BR');
}

function parseISODate(iso){
  if(!iso) return null;
  const parts = iso.split('-');
  if(parts.length!==3) return null;
  return new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));
}

function formatMonthYear(ym){
  if(!ym) return '—';
  const [y,m] = ym.split('-').map(Number);
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${meses[m-1]} de ${y}`;
}

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function currentMonthKey(){ return todayISO().slice(0,7); }

function monthKeyOf(iso){ return (iso||'').slice(0,7); }

function addMonthsToISO(iso, n){
  const d = parseISODate(iso); if(!d) return iso;
  d.setMonth(d.getMonth()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDaysToISO(iso, n){
  const d = parseISODate(iso); if(!d) return iso;
  d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function monthsBetween(aISO, bISO){
  // meses inteiros de aISO até bISO (b - a)
  const a = parseISODate(aISO), b = parseISODate(bISO);
  if(!a || !b) return 0;
  return (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth());
}

function escapeHtml(str){
  return String(str==null?'':str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function normalizeStr(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function clamp(n, min, max){ return Math.min(max, Math.max(min, n)); }

const CATEGORY_PALETTE = ['#2F5CFF','#7C4DFF','#17A673','#F5A623','#EF4444','#06B6D4','#EC4899','#84CC16','#F97316','#0EA5E9','#A855F7','#14B8A6'];
function categoryColor(cat){
  let hash = 0;
  const s = String(cat||'');
  for(let i=0;i<s.length;i++){ hash = (hash*31 + s.charCodeAt(i)) >>> 0; }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

function cardAutoGradient(id){
  let hash=0; for(let i=0;i<id.length;i++) hash=(hash*31+id.charCodeAt(i))>>>0;
  const grads = [['#2F5CFF','#7C4DFF'],['#7C4DFF','#EC4899'],['#0EA5E9','#2F5CFF'],['#17A673','#0EA5E9'],['#F5A623','#EF4444'],['#EF4444','#7C4DFF']];
  return grads[hash % grads.length];
}
function cardColors(cartao){
  // Prioridade: cor personalizada pelo usuário > cor "de fábrica" do banco > cor automática por id
  if(cartao.corInicio && cartao.corFim) return [cartao.corInicio, cartao.corFim];
  const preset = BANK_PRESETS[normalizeStr(cartao.banco||'')];
  if(preset) return preset;
  return cardAutoGradient(cartao.id);
}
function metaColor(m){ return m.cor || TIPO_META_COLOR[m.tipo] || categoryColor(m.tipo); }
function contaColor(c){ return TIPO_CONTA_COLOR[c.tipo] || categoryColor(c.tipo); }
function contaIcon(c){ return TIPO_CONTA_ICON[c.tipo] || 'landmark'; }

function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function palette(){
  return {
    primary: cssVar('--primary'), success: cssVar('--success'), danger: cssVar('--danger'),
    purple: cssVar('--purple'), yellow: cssVar('--yellow'),
    text: cssVar('--text-secondary'), border: cssVar('--border'), cardBg: cssVar('--card-bg')
  };
}

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }

/* ============================== 3. CÁLCULOS =============================== */

function getConta(id){ return DB.contas.find(c=>c.id===id); }
function getCartao(id){ return DB.cartoes.find(c=>c.id===id); }
function getMeta(id){ return DB.metas.find(m=>m.id===id); }

function accountBalance(contaId){
  const conta = getConta(contaId);
  if(!conta) return 0;
  const entradas = DB.receitas.filter(r=>r.contaId===contaId).reduce((s,r)=>s+Number(r.valor),0);
  const saidas = DB.despesas.filter(d=>d.contaId===contaId && d.formaPagamento!=='Cartão de crédito').reduce((s,d)=>s+Number(d.valor),0);
  return Number(conta.saldoInicial||0) + entradas - saidas;
}

function parcelamentoStatus(p){
  // parcelasPagas é controlado manualmente (botão "Pagar parcela"), iniciado
  // automaticamente conforme a data da compra ao cadastrar.
  const qtd = Number(p.qtdParcelas)||1;
  const pagas = clamp(Number(p.parcelasPagas||0), 0, qtd);
  const concluido = pagas>=qtd;
  const parcelaAtual = concluido ? qtd : pagas+1;
  const restantes = qtd - parcelaAtual; // quantas ficam depois da parcela atual
  const valorParcela = Number(p.valorTotal) / qtd;
  const saldoDevedor = valorParcela * restantes;
  return { parcelaAtual, restantes, valorParcela, saldoDevedor, concluido, parcelasPagas: pagas, qtdParcelas: qtd };
}

// Gera "despesas virtuais" a partir das parcelas em aberto — usadas SOMENTE para
// exibição/gráficos no Dashboard. Nunca são gravadas em DB.despesas (evita duplicar
// o cálculo já usado no limite do cartão, que continua vindo de parcelamentoStatus/cardUsage).
function virtualParcelaEntries(){
  return DB.parcelamentos.filter(p=>!parcelamentoStatus(p).concluido).map(p=>{
    const st = parcelamentoStatus(p);
    return {
      id: 'virtual-parcela-'+p.id,
      parcelamentoId: p.id,
      descricao: p.descricao,
      categoria: p.categoria,
      valor: st.valorParcela,
      data: addMonthsToISO(p.dataCompra, st.parcelasPagas),
      cartaoId: p.cartaoId,
      formaPagamento: 'Cartão de crédito',
      parcelaLabel: `${st.parcelaAtual}/${p.qtdParcelas}`,
      isParcela: true
    };
  });
}

function cardUsage(cartaoId){
  const cartao = getCartao(cartaoId);
  if(!cartao) return { limite:0, usado:0, disponivel:0, percentual:0 };
  const despesasCartao = DB.despesas.filter(d=>d.cartaoId===cartaoId && d.formaPagamento==='Cartão de crédito').reduce((s,d)=>s+Number(d.valor),0);
  // saldo devedor de parcelamentos = valor das parcelas futuras (não inclui a parcela já "usada" no mês atual, que é contabilizada separadamente na fatura do mês)
  const parcelasFaturaAtual = DB.parcelamentos.filter(p=>p.cartaoId===cartaoId).reduce((s,p)=>{
    const st = parcelamentoStatus(p);
    return s + (st.concluido ? 0 : st.valorParcela);
  },0);
  const parcelasFuturas = DB.parcelamentos.filter(p=>p.cartaoId===cartaoId).reduce((s,p)=>s+parcelamentoStatus(p).saldoDevedor,0);
  const usado = despesasCartao + parcelasFaturaAtual + parcelasFuturas;
  const limite = Number(cartao.limite)||0;
  const disponivel = limite - usado;
  const percentual = limite>0 ? clamp((usado/limite)*100,0,999) : 0;
  return { limite, usado, disponivel, percentual, faturaAtual: despesasCartao + parcelasFaturaAtual };
}

function goalCalc(meta){
  const alvo = Number(meta.valorAlvo)||0;
  const guardado = Number(meta.valorGuardado)||0;
  const restante = Math.max(0, alvo-guardado);
  const progresso = alvo>0 ? clamp((guardado/alvo)*100,0,100) : 0;
  let mesesRestantes = null;
  if(meta.prazo){
    const prazoISO = meta.prazo.length===7 ? meta.prazo+'-01' : meta.prazo;
    mesesRestantes = Math.max(0, monthsBetween(todayISO(), prazoISO));
  }
  const valorRecomendado = (mesesRestantes && mesesRestantes>0) ? restante/mesesRestantes : restante;
  let status = 'Em andamento';
  const prazoPassou = meta.prazo ? (monthsBetween(todayISO(), meta.prazo.length===7?meta.prazo+'-01':meta.prazo) < 0) : false;
  if(progresso>=100) status='Concluída';
  else if(prazoPassou) status='Atrasada';
  else if(mesesRestantes!==null && mesesRestantes<=1) status='Próxima do prazo';
  return { alvo, guardado, restante, progresso, mesesRestantes, valorRecomendado, status };
}

function budgetCalc(orc){
  const gasto = DB.despesas.filter(d=>d.categoria===orc.categoria && monthKeyOf(d.data)===currentMonthKey()).reduce((s,d)=>s+Number(d.valor),0);
  const limite = Number(orc.limite)||0;
  const percentual = limite>0 ? (gasto/limite)*100 : 0;
  const restante = limite - gasto;
  return { gasto, limite, restante, percentual };
}

function patrimonioTotal(){
  return DB.patrimonio.reduce((s,p)=>s+Number(p.valor),0);
}

function periodRange(period){
  const now = new Date();
  let start, end = todayISO();
  if(period==='week'){
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate()-day);
    start = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  } else if(period==='month'){
    start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  } else if(period==='year'){
    start = `${now.getFullYear()}-01-01`;
  } else if(period==='today'){
    start = todayISO();
  } else {
    start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  }
  return { start, end };
}

function sumInRange(list, start, end){
  return list.filter(x=>x.data>=start && x.data<=end).reduce((s,x)=>s+Number(x.valor),0);
}
function filterInRange(list, start, end){
  return list.filter(x=>x.data>=start && x.data<=end);
}

/* ============================== 4. NAVEGAÇÃO / TEMA ======================= */

const RENDERERS = {
  dashboard: renderDashboard,
  receitas: renderReceitas,
  despesas: renderDespesas,
  cartoes: renderCartoes,
  contas: renderContas,
  metas: renderMetas,
  orcamento: renderOrcamento,
  parcelas: renderParcelas,
  relatorios: renderRelatorios,
  patrimonio: renderPatrimonio,
  configuracoes: renderConfiguracoes
};

let currentView = 'dashboard';

function switchView(view){
  if(!RENDERERS[view]) return;
  currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===view));
  closeMobileSidebar();
  RENDERERS[view]();
  window.scrollTo({top:0, behavior:'instant'});
}

function refreshCurrentView(){
  if(RENDERERS[currentView]) RENDERERS[currentView]();
  renderNotifications();
}

function applyTheme(theme){
  DB.config.tema = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveData();
  refreshCurrentView();
}

function closeMobileSidebar(){
  document.querySelector('.app-shell').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

/* ============================== 5. DASHBOARD =============================== */

let dashboardPeriod = 'month';
let dashboardDateFilter = { mode:'all', value:null };
let receitasDateFilter = { mode:'all', value:null };
let despesasDateFilter = { mode:'all', value:null };

function monthEndISO(ym){
  const [y,m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
}

function dateFilterRange(filter){
  if(!filter || filter.mode==='all' || !filter.value) return null;
  if(filter.mode==='day') return { start: filter.value, end: filter.value };
  if(filter.mode==='month') return { start: filter.value+'-01', end: monthEndISO(filter.value) };
  if(filter.mode==='year') return { start: filter.value+'-01-01', end: filter.value+'-12-31' };
  return null;
}

function dateFilterLabel(filter){
  if(!filter || filter.mode==='all' || !filter.value) return null;
  if(filter.mode==='day') return formatDate(filter.value);
  if(filter.mode==='month') return formatMonthYear(filter.value);
  if(filter.mode==='year') return 'ano de '+filter.value;
  return null;
}

// Liga um seletor de filtro de calendário (dia/mês/ano) a um estado e a uma função de renderização
function wireDateFilter(modeId, dayId, monthId, yearId, state, onChange){
  const modeSel = document.getElementById(modeId);
  const dayInp = document.getElementById(dayId);
  const monthInp = document.getElementById(monthId);
  const yearInp = document.getElementById(yearId);
  function syncVisibility(){
    dayInp.hidden = state.mode!=='day';
    monthInp.hidden = state.mode!=='month';
    yearInp.hidden = state.mode!=='year';
  }
  modeSel.addEventListener('change', ()=>{
    state.mode = modeSel.value; state.value = null;
    dayInp.value=''; monthInp.value=''; yearInp.value='';
    syncVisibility(); onChange();
  });
  dayInp.addEventListener('change', ()=>{ state.value = dayInp.value; onChange(); });
  monthInp.addEventListener('change', ()=>{ state.value = monthInp.value; onChange(); });
  yearInp.addEventListener('change', ()=>{ state.value = yearInp.value; onChange(); });
  syncVisibility();
}

function getDashboardRange(){
  const dr = dateFilterRange(dashboardDateFilter);
  if(dr) return dr;
  return periodRange(dashboardPeriod);
}

function renderDashboard(){
  const { start, end } = getDashboardRange();
  const receitasP = filterInRange(DB.receitas, start, end);
  const despesasP = filterInRange(DB.despesas, start, end);
  const parcelasP = filterInRange(virtualParcelaEntries(), start, end);
  const totalReceitas = receitasP.reduce((s,r)=>s+Number(r.valor),0);
  const totalDespesasNormais = despesasP.reduce((s,d)=>s+Number(d.valor),0);
  const totalDespesasParceladas = parcelasP.reduce((s,d)=>s+Number(d.valor),0);
  // Total real de gastos = despesas normais do período + valor da fatura/parcelas do cartão do período
  // (parcelasP nunca duplica DB.despesas — ver virtualParcelaEntries)
  const totalDespesas = totalDespesasNormais + totalDespesasParceladas;
  const saldo = totalReceitas - totalDespesas;
  const economia = DB.metas.reduce((s,m)=>{
    const adds = (m.movimentacoes||[]).filter(mv=>mv.tipo==='add' && mv.data>=start && mv.data<=end).reduce((a,mv)=>a+Number(mv.valor),0);
    return s+adds;
  },0);
  const usoCartoes = DB.cartoes.reduce((s,c)=>s+cardUsage(c.id).usado,0);

  const customLabel = dateFilterLabel(dashboardDateFilter);
  const labels = {week:'nesta semana', month:'neste mês', year:'neste ano'};
  document.getElementById('dashboard-date-label').textContent = 'Resumo financeiro — ' + (customLabel || labels[dashboardPeriod] || '');

  const kpis = [
    {label:'Receitas', value: formatCurrency(totalReceitas), icon:'trending-up', color:'green', valueColor:'green'},
    {label:'Despesas', value: formatCurrency(totalDespesas), icon:'trending-down', color:'red', valueColor:'red'},
    {label:'Saldo', value: formatCurrency(saldo), icon:'wallet', color: saldo>=0?'blue':'red', valueColor: saldo>=0?'':'red'},
    {label:'Economia', value: formatCurrency(economia), icon:'piggy-bank', color:'purple'},
    {label:'Cartões (em uso)', value: formatCurrency(usoCartoes), icon:'credit-card', color:'yellow'}
  ];
  document.getElementById('kpi-grid').innerHTML = kpis.map(kpiCardHtml).join('');

  renderDashboardCharts(despesasP, receitasP, parcelasP, start, end);
  renderDespesasDoPeriodo(despesasP, parcelasP, totalDespesasNormais, totalDespesasParceladas);
  renderDashboardCartoes();
  renderUltimasMovimentacoes();
  renderProximasContas();
  renderMetasAndamento();
  renderInsights();
  refreshIcons();
}

// Painel "Cartões" no Dashboard: fatura atual, limite e disponível de cada cartão
function renderDashboardCartoes(){
  const el = document.getElementById('dash-cartoes-body');
  if(!el) return;
  if(!DB.cartoes.length){ el.innerHTML = emptyInline('Nenhum cartão cadastrado.'); return; }
  el.innerHTML = DB.cartoes.map(c=>{
    const u = cardUsage(c.id);
    const pct = clamp(u.percentual,0,100);
    const barColor = u.percentual>=100 ? 'red' : (u.percentual>=80 ? 'yellow' : 'green');
    return `<div class="list-row" style="flex-direction:column;align-items:stretch;gap:6px">
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <strong>${escapeHtml(c.nome)}</strong>
        <span>Fatura ${formatCurrency(u.faturaAtual)}</span>
      </div>
      <div class="progress-track"><div class="progress-fill ${barColor}" style="width:${pct}%"></div></div>
      <div class="progress-labels"><span>Disponível ${formatCurrency(Math.max(0,u.disponivel))}</span><span>Limite ${formatCurrency(u.limite)}</span></div>
    </div>`;
  }).join('');
}

function renderDespesasDoPeriodo(despesasP, parcelasP, totalNormais, totalParceladas){
  const el = document.getElementById('despesas-periodo-body');
  if(!el) return;
  const totalGeral = totalNormais + totalParceladas;

  document.getElementById('dp-total-geral').textContent = formatCurrency(totalGeral);
  document.getElementById('dp-total-normais').textContent = formatCurrency(totalNormais);
  document.getElementById('dp-total-parceladas').textContent = formatCurrency(totalParceladas);

  const todas = [...despesasP, ...parcelasP].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,8);
  if(!todas.length){ el.innerHTML = emptyInline('Nenhuma despesa neste período.'); return; }
  el.innerHTML = todas.map(d=>{
    const cartao = d.cartaoId ? getCartao(d.cartaoId) : null;
    return `<div class="list-row">
      <div class="list-row-main"><span class="dot" style="background:${categoryColor(d.categoria)}"></span>
        <div>
          <div class="list-row-title">${escapeHtml(d.descricao)}${d.isParcela?` <span class="badge purple" style="margin-left:4px">Parcela ${d.parcelaLabel}</span>`:''}</div>
          <div class="list-row-sub">${escapeHtml(d.categoria)}${cartao?' · '+escapeHtml(cartao.nome):''} · ${formatDate(d.data)}</div>
        </div>
      </div>
      <div class="list-row-value" style="color:var(--danger)">- ${formatCurrency(d.valor)}</div>
    </div>`;
  }).join('');
}

function kpiCardHtml(k){
  return `<div class="card kpi-card">
    <div class="kpi-top"><span class="kpi-label">${escapeHtml(k.label)}</span><span class="kpi-icon ${k.color}"><span data-lucide="${k.icon}"></span></span></div>
    <div class="kpi-value ${k.valueColor||''}">${k.value}</div>
  </div>`;
}

function renderDashboardCharts(despesasP, receitasP, parcelasP, start, end){
  const p = palette();

  ensureChart('chart-receitas-despesas', {
    type:'bar',
    data:{ labels:['Receitas','Despesas'], datasets:[{ data:[receitasP.reduce((s,r)=>s+Number(r.valor),0), despesasP.reduce((s,d)=>s+Number(d.valor),0)], backgroundColor:[p.success, p.danger], borderRadius:8, maxBarThickness:60 }] },
    options: baseChartOptions({legend:false, dataLabels:dataLabelsCurrency()})
  });

  const catTotals = {};
  despesasP.forEach(d=>{ catTotals[d.categoria] = (catTotals[d.categoria]||0) + Number(d.valor); });
  (parcelasP||[]).forEach(d=>{ catTotals[d.categoria] = (catTotals[d.categoria]||0) + Number(d.valor); });
  const catLabels = Object.keys(catTotals);
  ensureChart('chart-categorias', {
    type:'doughnut',
    data:{ labels: catLabels, datasets:[{ data: catLabels.map(c=>catTotals[c]), backgroundColor: catLabels.map(categoryColor), borderWidth:0 }] },
    options: baseChartOptions({legend:true, cutout:'65%', dataLabels:dataLabelsCurrencyOnSlice()})
  });

  const evo = evolucaoSaldo(30);
  ensureChart('chart-evolucao-saldo', {
    type:'line',
    data:{ labels: evo.labels, datasets:[{ data: evo.values, borderColor:p.primary, backgroundColor: p.primary+'22', fill:true, tension:.35, pointRadius:0 }] },
    options: baseChartOptions({legend:false}) // sem rótulos fixos: com ~30 pontos ficaria ilegível — o valor já aparece ao passar o mouse
  });

  const cardLabels = DB.cartoes.map(c=>c.nome);
  ensureChart('chart-cartoes', {
    type:'bar',
    data:{ labels: cardLabels, datasets:[{ data: DB.cartoes.map(c=>cardUsage(c.id).usado), backgroundColor:p.purple, borderRadius:8, maxBarThickness:44 }] },
    options: baseChartOptions({legend:false, indexAxis:'y', dataLabels:dataLabelsCurrencyHorizontal()})
  });

  const metaLabels = DB.metas.map(m=>m.nome);
  ensureChart('chart-metas', {
    type:'bar',
    data:{ labels: metaLabels, datasets:[{ data: DB.metas.map(m=>goalCalc(m).progresso), backgroundColor: DB.metas.map(metaColor), borderRadius:8, maxBarThickness:34 }] },
    options: baseChartOptions({legend:false, indexAxis:'y', max:100, dataLabels:dataLabelsPercent(), tooltipFormat:'percent'})
  });
}

function evolucaoSaldo(days){
  const labels=[], values=[];
  let saldo=0;
  const startISO = addDaysToISO(todayISO(), -days);
  const before = [...DB.receitas.map(r=>({...r,tipo:1})), ...DB.despesas.map(d=>({...d,tipo:-1}))].filter(x=>x.data<startISO);
  saldo = before.reduce((s,x)=>s+x.tipo*Number(x.valor),0);
  for(let i=days;i>=0;i--){
    const iso = addDaysToISO(todayISO(), -i);
    const dayReceitas = DB.receitas.filter(r=>r.data===iso).reduce((s,r)=>s+Number(r.valor),0);
    const dayDespesas = DB.despesas.filter(d=>d.data===iso).reduce((s,d)=>s+Number(d.valor),0);
    saldo += dayReceitas - dayDespesas;
    labels.push(parseISODate(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}));
    values.push(Number(saldo.toFixed(2)));
  }
  return { labels, values };
}

function ensureChart(id, config){
  const canvas = document.getElementById(id);
  if(!canvas) return;
  if(CHARTS[id]) CHARTS[id].destroy();
  CHARTS[id] = new Chart(canvas, config);
}

// Extrai o valor real do ponto do gráfico, tratando corretamente cada tipo:
// doughnut/pie: ctx.parsed já é o número puro.
// barra/linha: ctx.parsed é {x,y} — qual dos dois é o "valor" depende do indexAxis
// (em barras horizontais, indexAxis:'y', o valor fica em x, não em y).
function chartTooltipValue(ctx){
  const parsed = ctx.parsed;
  if(parsed && typeof parsed === 'object'){
    const indexAxis = ctx.chart.options.indexAxis || 'x';
    return indexAxis === 'y' ? parsed.x : parsed.y;
  }
  return parsed;
}

function baseChartOptions(opts){
  opts = opts||{};
  const p = palette();
  const formatTooltip = opts.tooltipFormat==='percent' ? (v)=> Math.round(v)+'%' : (v)=> formatCurrency(v);
  return {
    responsive:true, maintainAspectRatio:false,
    indexAxis: opts.indexAxis||'x',
    layout: opts.dataLabels ? { padding:{ top:16, right:16 } } : undefined,
    plugins:{
      legend:{ display: !!opts.legend, position:'bottom', labels:{ color:p.text, boxWidth:10, font:{size:11} } },
      tooltip:{ backgroundColor:p.cardBg, titleColor:p.text, bodyColor:p.text, borderColor:p.border, borderWidth:1, padding:10, callbacks:{ label:(ctx)=> ' ' + formatTooltip(chartTooltipValue(ctx)) } },
      datalabels: opts.dataLabels || { display:false }
    },
    scales: opts.cutout ? undefined : {
      x:{ ticks:{ color:p.text, font:{size:10.5} }, grid:{ display:false }, max: opts.max },
      y:{ ticks:{ color:p.text, font:{size:10.5} }, grid:{ color:p.border }, max: opts.max }
    },
    cutout: opts.cutout
  };
}

// Rótulos padrão (valor em R$) para barras — texto acima/ao lado da barra, na cor do tema
function dataLabelsCurrency(){
  const p = palette();
  return { display:true, color:p.text, font:{weight:'700', size:10.5}, anchor:'end', align:'top', offset:4,
    formatter:(v)=> v ? 'R$ '+Math.round(v).toLocaleString('pt-BR') : '' };
}
// Rótulos para dentro de fatias coloridas (doughnut) — texto branco com contorno para contraste
function dataLabelsCurrencyOnSlice(){
  return { display:true, color:'#fff', textStrokeColor:'rgba(0,0,0,.45)', textStrokeWidth:3,
    font:{weight:'700', size:10.5}, formatter:(v)=> v ? 'R$ '+Math.round(v).toLocaleString('pt-BR') : '' };
}
// Rótulos de percentual (barra de progresso das metas) — barras horizontais
function dataLabelsPercent(){
  const p = palette();
  return { display:true, color:p.text, font:{weight:'700', size:10.5}, anchor:'end', align:'right', offset:4,
    formatter:(v)=> Math.round(v)+'%' };
}
// Rótulos para barras horizontais em R$ (ex: gastos por cartão)
function dataLabelsCurrencyHorizontal(){
  const p = palette();
  return { display:true, color:p.text, font:{weight:'700', size:10.5}, anchor:'end', align:'right', offset:4,
    formatter:(v)=> v ? 'R$ '+Math.round(v).toLocaleString('pt-BR') : '' };
}

if(typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined'){
  Chart.register(ChartDataLabels);
}

function renderUltimasMovimentacoes(){
  const all = [...DB.receitas.map(r=>({...r, tipo:'receita'})), ...DB.despesas.map(d=>({...d, tipo:'despesa'}))]
    .sort((a,b)=> b.data.localeCompare(a.data)).slice(0,7);
  const el = document.getElementById('dash-ultimas-mov');
  if(!all.length){ el.innerHTML = emptyInline('Nenhuma movimentação ainda.'); return; }
  el.innerHTML = all.map(m=>`
    <div class="list-row">
      <div class="list-row-main"><span class="dot" style="background:${m.tipo==='receita'?'var(--success)':'var(--danger)'}"></span>
        <div><div class="list-row-title">${escapeHtml(m.descricao)}</div><div class="list-row-sub">${escapeHtml(m.categoria)} · ${formatDate(m.data)}</div></div>
      </div>
      <div class="list-row-value" style="color:${m.tipo==='receita'?'var(--success)':'var(--danger)'}">${m.tipo==='receita'?'+':'-'} ${formatCurrency(m.valor)}</div>
    </div>`).join('');
}

function renderProximasContas(){
  const list = DB.recorrentes.filter(r=>r.proximaData>=todayISO()).sort((a,b)=>a.proximaData.localeCompare(b.proximaData)).slice(0,6);
  const el = document.getElementById('dash-proximas-contas');
  if(!list.length){ el.innerHTML = emptyInline('Nenhuma conta recorrente cadastrada.'); return; }
  el.innerHTML = list.map(r=>`
    <div class="list-row"><div class="list-row-main"><span class="dot" style="background:var(--yellow)"></span>
      <div><div class="list-row-title">${escapeHtml(r.descricao)}</div><div class="list-row-sub">vence em ${formatDate(r.proximaData)}</div></div></div>
      <div class="list-row-value">${formatCurrency(r.valor)}</div></div>`).join('');
}

function renderMetasAndamento(){
  const list = DB.metas.filter(m=>goalCalc(m).status!=='Concluída').slice(0,5);
  const el = document.getElementById('dash-metas-andamento');
  if(!list.length){ el.innerHTML = emptyInline('Nenhuma meta em andamento.'); return; }
  el.innerHTML = list.map(m=>{
    const c = goalCalc(m);
    return `<div class="list-row" style="flex-direction:column;align-items:stretch;gap:6px">
      <div style="display:flex;justify-content:space-between;font-size:13px"><strong>${escapeHtml(m.nome)}</strong><span>${formatNumber(c.progresso,1)}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${c.progresso}%;background:${metaColor(m)}"></div></div>
    </div>`;
  }).join('');
}

function renderInsights(){
  const el = document.getElementById('dash-insights');
  const insights = [];
  const thisMonth = currentMonthKey();
  const lastMonthDate = addMonthsToISO(currentMonthKey()+'-01', -1).slice(0,7);

  const despThis = DB.despesas.filter(d=>monthKeyOf(d.data)===thisMonth);
  const despLast = DB.despesas.filter(d=>monthKeyOf(d.data)===lastMonthDate);
  const recThis = DB.receitas.filter(r=>monthKeyOf(r.data)===thisMonth);

  if(despThis.length){
    const byCat = {};
    despThis.forEach(d=>{ byCat[d.categoria]=(byCat[d.categoria]||0)+Number(d.valor); });
    const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
    if(top) insights.push(`Seu maior gasto este mês foi com <strong>${escapeHtml(top[0])}</strong> (${formatCurrency(top[1])}).`);

    if(despLast.length){
      const byCatLast = {};
      despLast.forEach(d=>{ byCatLast[d.categoria]=(byCatLast[d.categoria]||0)+Number(d.valor); });
      Object.keys(byCat).forEach(cat=>{
        if(byCatLast[cat]>0){
          const variacao = ((byCat[cat]-byCatLast[cat])/byCatLast[cat])*100;
          if(Math.abs(variacao)>=15){
            insights.push(`Seus gastos com <strong>${escapeHtml(cat)}</strong> ${variacao>0?'aumentaram':'diminuíram'} ${formatNumber(Math.abs(variacao),0)}% em relação ao mês passado.`);
          }
        }
      });
    }
  }

  const totalRecThis = recThis.reduce((s,r)=>s+Number(r.valor),0);
  const totalDespThis = despThis.reduce((s,d)=>s+Number(d.valor),0);
  if(totalRecThis>0 || totalDespThis>0){
    const saldoMes = totalRecThis-totalDespThis;
    insights.push(saldoMes>=0 ? `Você economizou <strong>${formatCurrency(saldoMes)}</strong> este mês.` : `Você gastou <strong>${formatCurrency(Math.abs(saldoMes))}</strong> a mais do que recebeu este mês.`);
  }

  const metaProxima = DB.metas.map(m=>({m,c:goalCalc(m)})).filter(x=>x.c.status!=='Concluída').sort((a,b)=>b.c.progresso-a.c.progresso)[0];
  if(metaProxima) insights.push(`Você está a <strong>${formatNumber(metaProxima.c.progresso,0)}%</strong> de atingir a meta "${escapeHtml(metaProxima.m.nome)}".`);

  el.innerHTML = insights.length ? insights.slice(0,5).map(i=>`<div class="list-row"><div class="list-row-main"><span data-lucide="sparkle" style="width:15px;color:var(--primary)"></span><div class="list-row-sub" style="font-size:13px;color:var(--text)">${i}</div></div></div>`).join('') : emptyInline('Cadastre receitas e despesas para ver insights personalizados.');
  refreshIcons();
}

function emptyInline(msg){ return `<div class="empty-inline">${escapeHtml(msg)}</div>`; }

/* ============================== 6. RECEITAS ================================ */

function renderReceitas(){
  const selCat = document.getElementById('filtro-receitas-categoria');
  selCat.innerHTML = '<option value="">Todas categorias</option>' + DB.categoriasReceita.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  const busca = normalizeStr(document.getElementById('filtro-receitas-busca').value);
  const cat = document.getElementById('filtro-receitas-categoria').value;
  const ordenar = document.getElementById('filtro-receitas-ordenar').value;

  let list = DB.receitas.filter(r=> (!busca || normalizeStr(r.descricao).includes(busca)) && (!cat || r.categoria===cat) );
  const drR = dateFilterRange(receitasDateFilter);
  if(drR) list = list.filter(r=> r.data>=drR.start && r.data<=drR.end);
  list = sortList(list, ordenar);

  const tbody = document.querySelector('#tbl-receitas tbody');
  document.getElementById('empty-receitas').hidden = list.length>0;
  tbody.innerHTML = list.map(r=>`
    <tr>
      <td>${escapeHtml(r.descricao)}</td>
      <td><span class="badge blue">${escapeHtml(r.categoria)}</span></td>
      <td>${r.contaId ? escapeHtml(getConta(r.contaId)?.nome||'—') : '—'}</td>
      <td>${formatDate(r.data)}</td>
      <td class="cell-value pos">+ ${formatCurrency(r.valor)}</td>
      <td><div class="row-actions">
        <button class="icon-btn tiny" data-action="edit-receita" data-id="${r.id}" aria-label="Editar"><span data-lucide="pencil"></span></button>
        <button class="icon-btn tiny" data-action="delete-receita" data-id="${r.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button>
      </div></td>
    </tr>`).join('');
  refreshIcons();
}

function sortList(list, mode){
  const arr = list.slice();
  if(mode==='data-asc') arr.sort((a,b)=>a.data.localeCompare(b.data));
  else if(mode==='valor-desc') arr.sort((a,b)=>b.valor-a.valor);
  else if(mode==='valor-asc') arr.sort((a,b)=>a.valor-b.valor);
  else arr.sort((a,b)=>b.data.localeCompare(a.data));
  return arr;
}

/* ============================== 7. DESPESAS ================================ */

function renderDespesas(){
  const selCat = document.getElementById('filtro-despesas-categoria');
  selCat.innerHTML = '<option value="">Todas categorias</option>' + DB.categoriasDespesa.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  const busca = normalizeStr(document.getElementById('filtro-despesas-busca').value);
  const cat = document.getElementById('filtro-despesas-categoria').value;
  const ordenar = document.getElementById('filtro-despesas-ordenar').value;

  let list = DB.despesas.filter(d=> (!busca || normalizeStr(d.descricao).includes(busca)) && (!cat || d.categoria===cat) );
  const drD = dateFilterRange(despesasDateFilter);
  if(drD) list = list.filter(d=> d.data>=drD.start && d.data<=drD.end);
  list = sortList(list, ordenar);

  const tbody = document.querySelector('#tbl-despesas tbody');
  document.getElementById('empty-despesas').hidden = list.length>0;
  tbody.innerHTML = list.map(d=>`
    <tr>
      <td>${escapeHtml(d.descricao)}</td>
      <td><span class="badge" style="background:${categoryColor(d.categoria)}22;color:${categoryColor(d.categoria)}">${escapeHtml(d.categoria)}</span></td>
      <td>${escapeHtml(d.formaPagamento)}${d.cartaoId ? ' · '+escapeHtml(getCartao(d.cartaoId)?.nome||'') : ''}</td>
      <td>${formatDate(d.data)}</td>
      <td class="cell-value neg">- ${formatCurrency(d.valor)}</td>
      <td><div class="row-actions">
        <button class="icon-btn tiny" data-action="edit-despesa" data-id="${d.id}" aria-label="Editar"><span data-lucide="pencil"></span></button>
        <button class="icon-btn tiny" data-action="delete-despesa" data-id="${d.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button>
      </div></td>
    </tr>`).join('');

  document.getElementById('lista-categorias-despesa').innerHTML = DB.categoriasDespesa.map(c=>`
    <div class="tag-chip"><span>${escapeHtml(c)}</span><button data-action="delete-categoria" data-id="${escapeHtml(c)}" aria-label="Remover categoria"><span data-lucide="x"></span></button></div>
  `).join('');
  renderDespesasCategoriaChart();
  refreshIcons();
}

// Gráfico com TODAS as despesas já cadastradas (não é afetado pelos filtros da lista acima)
function renderDespesasCategoriaChart(){
  const p = palette();
  const totals = {};
  DB.despesas.forEach(d=>{ totals[d.categoria] = (totals[d.categoria]||0) + Number(d.valor); });
  const labels = Object.keys(totals);
  ensureChart('chart-despesas-categoria', {
    type:'bar',
    data:{ labels, datasets:[{ data: labels.map(c=>totals[c]), backgroundColor: labels.map(categoryColor), borderRadius:8, maxBarThickness:52 }] },
    options: baseChartOptions({legend:false, dataLabels:dataLabelsCurrency()})
  });
}

/* ============================== 8. CARTÕES ================================= */

function renderCartoes(){
  const grid = document.getElementById('cartoes-grid');
  document.getElementById('empty-cartoes').hidden = DB.cartoes.length>0;
  grid.innerHTML = DB.cartoes.map(c=>{
    const u = cardUsage(c.id);
    const grad = cardColors(c);
    const barClass = u.percentual>=100 ? 'red' : (u.percentual>=80 ? 'yellow' : 'green');
    return `<div class="fin-card" style="--accent-color:${grad[0]}" data-action="open-cartao" data-id="${c.id}">
      <div class="credit-card-visual" style="--cc1:${grad[0]};--cc2:${grad[1]}">
        <div class="cc-top"><div><div class="cc-bank">${escapeHtml(c.banco||c.nome)}</div><div class="cc-name">${escapeHtml(c.nome)}</div></div>
          <button class="cc-menu" data-action="edit-cartao" data-id="${c.id}" aria-label="Editar cartão"><span data-lucide="pencil"></span></button>
        </div>
        <div>
          <div class="cc-limit-row"><span>Disponível</span><span>${formatCurrency(Math.max(0,u.disponivel))}</span></div>
          <div class="cc-dates">Fecha dia ${c.fechamento} · Vence dia ${c.vencimento}</div>
        </div>
        ${c.bandeira ? `<div class="cc-bandeira">${escapeHtml(c.bandeira)}</div>` : ''}
      </div>
      <div class="progress-track"><div class="progress-fill ${barClass}" style="width:${clamp(u.percentual,0,100)}%"></div></div>
      <div class="progress-labels"><span>Usado ${formatCurrency(u.usado)}</span><span>Limite ${formatCurrency(u.limite)}</span></div>
      <div class="mini-stats">
        <div class="mini-stat"><div class="mini-stat-label">Fatura atual</div><div class="mini-stat-value">${formatCurrency(u.faturaAtual)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">% utilizado</div><div class="mini-stat-value">${formatNumber(clamp(u.percentual,0,999),0)}%</div></div>
      </div>
    </div>`;
  }).join('');
  refreshIcons();
}

/* ============================== 9. CONTAS =================================== */

function renderContas(){
  const grid = document.getElementById('contas-grid');
  document.getElementById('empty-contas').hidden = DB.contas.length>0;
  grid.innerHTML = DB.contas.map(c=>{
    const saldo = accountBalance(c.id);
    const color = contaColor(c);
    return `<div class="fin-card" style="--accent-color:${color}" data-action="open-conta" data-id="${c.id}">
      <div class="fin-card-top">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="goal-icon" style="background:${color}22;color:${color}"><span data-lucide="${contaIcon(c)}"></span></div>
          <div><div class="fin-card-title">${escapeHtml(c.nome)}</div><div class="fin-card-sub">${escapeHtml(c.tipo)}</div></div>
        </div>
        <div class="card-menu-actions">
          <button class="icon-btn tiny" data-action="edit-conta" data-id="${c.id}" aria-label="Editar"><span data-lucide="pencil"></span></button>
          <button class="icon-btn tiny" data-action="delete-conta" data-id="${c.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button>
        </div>
      </div>
      <div class="modal-divider" style="margin:2px 0"></div>
      <div class="mini-stat"><div class="mini-stat-label">Saldo atual</div>
        <div class="mini-stat-value" style="font-size:20px;color:${saldo>=0?'var(--success)':'var(--danger)'}">${formatCurrency(saldo)}</div></div>
      <div class="mini-stat-label">Saldo inicial: ${formatCurrency(c.saldoInicial)}</div>
    </div>`;
  }).join('');
  refreshIcons();
}

/* ============================== 10. METAS ==================================== */

function renderMetas(){
  const grid = document.getElementById('metas-grid');
  document.getElementById('empty-metas').hidden = DB.metas.length>0;
  grid.innerHTML = DB.metas.map(m=>{
    const c = goalCalc(m);
    const color = metaColor(m);
    return `<div class="fin-card" style="--accent-color:${color}" data-action="open-meta" data-id="${m.id}">
      <div class="fin-card-top">
        <div style="display:flex;gap:12px;align-items:center"><div class="goal-icon" style="background:${color}22;color:${color}"><span data-lucide="target"></span></div>
          <div><div class="fin-card-title">${escapeHtml(m.nome)}</div><div class="fin-card-sub">${escapeHtml(m.tipo)}</div></div></div>
        <span class="badge ${c.status==='Concluída'?'green':(c.status==='Atrasada'?'red':(c.status==='Próxima do prazo'?'yellow':'purple'))}">${c.status}${c.status==='Concluída'?' 🎉':''}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${c.progresso}%;background:${color}"></div></div>
      <div class="progress-labels"><span>${formatNumber(c.progresso,1)}%</span><span>${formatCurrency(c.guardado)} / ${formatCurrency(c.alvo)}</span></div>
      <div class="mini-stats">
        <div class="mini-stat"><div class="mini-stat-label">Restante</div><div class="mini-stat-value">${formatCurrency(c.restante)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Prazo</div><div class="mini-stat-value" style="font-size:12.5px">${m.prazo?formatMonthYear(m.prazo):'—'}</div></div>
      </div>
    </div>`;
  }).join('');
  refreshIcons();
}

/* ============================== 11. ORÇAMENTO ================================= */

function renderOrcamento(){
  const grid = document.getElementById('orcamento-grid');
  document.getElementById('empty-orcamento').hidden = DB.orcamentos.length>0;
  grid.innerHTML = DB.orcamentos.map(o=>{
    const c = budgetCalc(o);
    let barColor='green', badge=null;
    if(c.percentual>=100){ barColor='red'; badge='<span class="badge red">Limite excedido</span>'; }
    else if(c.percentual>=80){ barColor='yellow'; badge='<span class="badge yellow">Próximo do limite</span>'; }
    else if(c.percentual>=50){ barColor='yellow'; }
    const accent = categoryColor(o.categoria);
    return `<div class="fin-card" style="--accent-color:${accent}" data-action="edit-orcamento" data-id="${o.id}">
      <div class="fin-card-top">
        <div><div class="fin-card-title">${escapeHtml(o.categoria)}</div><div class="fin-card-sub">Orçamento mensal</div></div>
        <div class="card-menu-actions">${badge||''}<button class="icon-btn tiny" data-action="delete-orcamento" data-id="${o.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button></div>
      </div>
      <div class="progress-track"><div class="progress-fill ${barColor}" style="width:${clamp(c.percentual,0,100)}%"></div></div>
      <div class="progress-labels"><span>${formatCurrency(c.gasto)} gasto</span><span>Limite ${formatCurrency(c.limite)}</span></div>
      <div class="mini-stat"><div class="mini-stat-label">Restante</div><div class="mini-stat-value" style="color:${c.restante<0?'var(--danger)':'var(--text)'}">${formatCurrency(c.restante)}</div></div>
    </div>`;
  }).join('');
  refreshIcons();
}

/* ============================== 12. PARCELAS / RECORRENTES ==================== */

function renderParcelas(){
  const grid = document.getElementById('parcelas-grid');
  document.getElementById('empty-parcelas').hidden = DB.parcelamentos.length>0;
  grid.innerHTML = DB.parcelamentos.map(p=>{
    const st = parcelamentoStatus(p);
    const cartao = getCartao(p.cartaoId);
    const accent = categoryColor(p.categoria||p.descricao);
    return `<div class="fin-card" style="--accent-color:${accent}" data-action="edit-parcelamento" data-id="${p.id}">
      <div class="fin-card-top">
        <div><div class="fin-card-title">${escapeHtml(p.descricao)}</div><div class="fin-card-sub">${escapeHtml(cartao?cartao.nome:'—')}</div></div>
        <div class="card-menu-actions">
          ${st.concluido ? '<span class="badge green">Quitada ✓</span>' : ''}
          <button class="icon-btn tiny" data-action="delete-parcelamento" data-id="${p.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill ${st.concluido?'green':''}" style="width:${(st.parcelasPagas/p.qtdParcelas)*100}%;${st.concluido?'':`background:${accent}`}"></div></div>
      <div class="progress-labels"><span>Pagas ${st.parcelasPagas}/${p.qtdParcelas}</span><span>${formatCurrency(st.valorParcela)}/mês</span></div>
      <div class="mini-stats">
        <div class="mini-stat"><div class="mini-stat-label">Total</div><div class="mini-stat-value">${formatCurrency(p.valorTotal)}</div></div>
        <div class="mini-stat"><div class="mini-stat-label">Restantes</div><div class="mini-stat-value">${st.qtdParcelas-st.parcelasPagas}</div></div>
      </div>
      ${st.concluido ? '' : `<button type="button" class="btn btn-sm btn-outline btn-block" data-action="pagar-parcela" data-id="${p.id}"><span data-lucide="check"></span>Pagar parcela (${st.parcelaAtual}/${p.qtdParcelas})</button>`}
    </div>`;
  }).join('');

  const tbody = document.querySelector('#tbl-recorrentes tbody');
  document.getElementById('empty-recorrentes').hidden = DB.recorrentes.length>0;
  tbody.innerHTML = DB.recorrentes.map(r=>`
    <tr>
      <td>${escapeHtml(r.descricao)}</td>
      <td><span class="badge" style="background:${categoryColor(r.categoria)}22;color:${categoryColor(r.categoria)}">${escapeHtml(r.categoria)}</span></td>
      <td class="cell-value">${formatCurrency(r.valor)}</td>
      <td>${escapeHtml(r.frequencia)}</td>
      <td>${formatDate(r.proximaData)}</td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-outline" data-action="lancar-recorrente" data-id="${r.id}">Lançar agora</button>
        <button class="icon-btn tiny" data-action="delete-recorrente" data-id="${r.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button>
      </div></td>
    </tr>`).join('');
  refreshIcons();
}

/* ============================== 13. RELATÓRIOS ================================= */

function renderRelatorios(){
  const periodo = document.getElementById('relatorio-periodo').value;
  const inicioEl = document.getElementById('relatorio-data-inicio');
  const fimEl = document.getElementById('relatorio-data-fim');
  const custom = periodo==='personalizado';
  inicioEl.hidden = !custom; fimEl.hidden = !custom;

  let start, end;
  if(custom){
    start = inicioEl.value || todayISO();
    end = fimEl.value || todayISO();
  } else {
    const map = {hoje:'today', semana:'week', mes:'month', ano:'year'};
    const r = periodRange(map[periodo]||'month');
    start = r.start; end = r.end;
  }

  const receitasP = filterInRange(DB.receitas, start, end);
  const despesasP = filterInRange(DB.despesas, start, end);
  const totalR = receitasP.reduce((s,r)=>s+Number(r.valor),0);
  const totalD = despesasP.reduce((s,d)=>s+Number(d.valor),0);

  document.getElementById('relatorio-kpis').innerHTML = [
    {label:'Receitas', value:formatCurrency(totalR), icon:'trending-up', color:'green'},
    {label:'Despesas', value:formatCurrency(totalD), icon:'trending-down', color:'red'},
    {label:'Saldo', value:formatCurrency(totalR-totalD), icon:'wallet', color:'blue'},
    {label:'Economia', value:formatCurrency(Math.max(0,totalR-totalD)), icon:'piggy-bank', color:'purple'}
  ].map(kpiCardHtml).join('');

  const p = palette();
  const byCat = {}; despesasP.forEach(d=>{ byCat[d.categoria]=(byCat[d.categoria]||0)+Number(d.valor); });
  ensureChart('chart-rel-categoria', { type:'doughnut', data:{ labels:Object.keys(byCat), datasets:[{data:Object.values(byCat), backgroundColor:Object.keys(byCat).map(categoryColor), borderWidth:0}] }, options: baseChartOptions({legend:true,cutout:'62%'}) });

  const byCard = {}; DB.cartoes.forEach(c=>{ byCard[c.nome] = despesasP.filter(d=>d.cartaoId===c.id).reduce((s,d)=>s+Number(d.valor),0); });
  ensureChart('chart-rel-cartao', { type:'bar', data:{ labels:Object.keys(byCard), datasets:[{data:Object.values(byCard), backgroundColor:p.purple, borderRadius:8}] }, options: baseChartOptions({legend:false}) });

  const byConta = {}; DB.contas.forEach(c=>{ byConta[c.nome] = despesasP.filter(d=>d.contaId===c.id).reduce((s,d)=>s+Number(d.valor),0); });
  ensureChart('chart-rel-conta', { type:'bar', data:{ labels:Object.keys(byConta), datasets:[{data:Object.values(byConta), backgroundColor:p.primary, borderRadius:8}] }, options: baseChartOptions({legend:false}) });

  const evo = evolucaoSaldo(Math.min(90, Math.max(7, monthsBetween(start,end)*30+30)));
  ensureChart('chart-rel-evolucao', { type:'line', data:{ labels:evo.labels, datasets:[{data:evo.values, borderColor:p.primary, backgroundColor:p.primary+'22', fill:true, tension:.35, pointRadius:0}] }, options: baseChartOptions({legend:false}) });

  refreshIcons();
}

/* ============================== 14. PATRIMÔNIO ================================== */

function renderPatrimonio(){
  const total = patrimonioTotal();
  document.getElementById('patrimonio-kpis').innerHTML = [
    {label:'Patrimônio total', value:formatCurrency(total), icon:'gem', color:'blue'},
    {label:'Itens cadastrados', value:String(DB.patrimonio.length), icon:'layers', color:'purple'}
  ].map(kpiCardHtml).join('');

  const p = palette();
  const byCat = {}; DB.patrimonio.forEach(it=>{ byCat[it.categoria]=(byCat[it.categoria]||0)+Number(it.valor); });
  ensureChart('chart-patrimonio-comp', { type:'doughnut', data:{ labels:Object.keys(byCat), datasets:[{data:Object.values(byCat), backgroundColor:Object.keys(byCat).map(categoryColor), borderWidth:0}] }, options: baseChartOptions({legend:true,cutout:'62%'}) });

  const hist = (DB.patrimonioHistorico||[]).slice(-24);
  ensureChart('chart-patrimonio-evo', { type:'line', data:{ labels: hist.map(h=>formatDate(h.data)), datasets:[{data:hist.map(h=>h.total), borderColor:p.primary, backgroundColor:p.primary+'22', fill:true, tension:.3, pointRadius:2}] }, options: baseChartOptions({legend:false}) });

  const tbody = document.querySelector('#tbl-patrimonio tbody');
  document.getElementById('empty-patrimonio').hidden = DB.patrimonio.length>0;
  tbody.innerHTML = DB.patrimonio.map(it=>`
    <tr><td>${escapeHtml(it.nome)}</td><td><span class="badge blue">${escapeHtml(it.categoria)}</span></td>
      <td class="cell-value">${formatCurrency(it.valor)}</td>
      <td><div class="row-actions">
        <button class="icon-btn tiny" data-action="edit-patrimonio" data-id="${it.id}" aria-label="Editar"><span data-lucide="pencil"></span></button>
        <button class="icon-btn tiny" data-action="delete-patrimonio" data-id="${it.id}" aria-label="Excluir"><span data-lucide="trash-2"></span></button>
      </div></td></tr>`).join('');
  refreshIcons();
}

/* ============================== 15. CONFIGURAÇÕES ================================ */

function renderConfiguracoes(){
  document.getElementById('btn-set-light').classList.toggle('is-active', DB.config.tema==='light');
  document.getElementById('btn-set-dark').classList.toggle('is-active', DB.config.tema==='dark');
  document.getElementById('config-categorias-list').innerHTML = DB.categoriasDespesa.map(c=>`
    <div class="tag-chip"><span>${escapeHtml(c)}</span><button data-action="delete-categoria" data-id="${escapeHtml(c)}" aria-label="Remover"><span data-lucide="x"></span></button></div>
  `).join('');
  refreshIcons();
}

/* ============================== 16. NOTIFICAÇÕES ================================= */

function buildAlerts(){
  const alerts = [];
  DB.cartoes.forEach(c=>{
    const u = cardUsage(c.id);
    if(u.percentual>=100) alerts.push({level:'red', text:`Seu cartão ${c.nome} ultrapassou o limite.`});
    else if(u.percentual>=80) alerts.push({level:'yellow', text:`Seu cartão ${c.nome} está com ${formatNumber(u.percentual,0)}% do limite utilizado.`});
  });
  DB.metas.forEach(m=>{
    const c = goalCalc(m);
    if(c.status==='Concluída') alerts.push({level:'green', text:`Você atingiu a meta "${m.nome}"! 🎉`});
    else if(c.status==='Próxima do prazo') alerts.push({level:'yellow', text:`Sua meta "${m.nome}" está próxima do prazo.`});
    else if(c.status==='Atrasada') alerts.push({level:'red', text:`Sua meta "${m.nome}" está com o prazo atrasado.`});
  });
  DB.orcamentos.forEach(o=>{
    const c = budgetCalc(o);
    if(c.percentual>=100) alerts.push({level:'red', text:`Você ultrapassou o orçamento de ${o.categoria}.`});
    else if(c.percentual>=80) alerts.push({level:'yellow', text:`Seu orçamento de ${o.categoria} está próximo do limite.`});
  });
  DB.recorrentes.forEach(r=>{
    const dias = monthsBetween(todayISO(), r.proximaData)===0 ? Math.round((parseISODate(r.proximaData)-parseISODate(todayISO()))/86400000) : null;
    const diff = Math.round((parseISODate(r.proximaData)-parseISODate(todayISO()))/86400000);
    if(diff>=0 && diff<=7) alerts.push({level:'blue', text:`"${r.descricao}" vence em ${diff===0?'hoje':diff+' dia(s)'} (${formatCurrency(r.valor)}).`});
  });
  return alerts;
}

function renderNotifications(){
  const alerts = buildAlerts();
  document.getElementById('notif-dot').hidden = alerts.length===0;
  const list = document.getElementById('notif-list');
  list.innerHTML = alerts.length ? alerts.map(a=>`<div class="notif-item level-${a.level}">${escapeHtml(a.text)}</div>`).join('') : '<div class="notif-empty">Nenhum alerta no momento.</div>';
}

/* ============================== 17. BUSCA GLOBAL ================================== */

function runGlobalSearch(term){
  const t = normalizeStr(term);
  const resultsEl = document.getElementById('search-results');
  if(!t){ resultsEl.classList.remove('show'); resultsEl.innerHTML=''; return; }

  const results = [];
  DB.receitas.forEach(r=>{ if(normalizeStr(r.descricao).includes(t)) results.push({type:'Receita', label:r.descricao, sub:formatCurrency(r.valor), view:'receitas'}); });
  DB.despesas.forEach(d=>{ if(normalizeStr(d.descricao).includes(t)) results.push({type:'Despesa', label:d.descricao, sub:formatCurrency(d.valor), view:'despesas'}); });
  DB.cartoes.forEach(c=>{ if(normalizeStr(c.nome+' '+c.banco).includes(t)) results.push({type:'Cartão', label:c.nome, sub:c.banco, view:'cartoes'}); });
  DB.contas.forEach(c=>{ if(normalizeStr(c.nome).includes(t)) results.push({type:'Conta', label:c.nome, sub:c.tipo, view:'contas'}); });
  DB.metas.forEach(m=>{ if(normalizeStr(m.nome).includes(t)) results.push({type:'Meta', label:m.nome, sub:formatCurrency(m.valorAlvo), view:'metas'}); });
  DB.parcelamentos.forEach(p=>{ if(normalizeStr(p.descricao).includes(t)) results.push({type:'Parcela', label:p.descricao, sub:formatCurrency(p.valorTotal), view:'parcelas'}); });

  resultsEl.classList.add('show');
  resultsEl.innerHTML = results.length ? results.slice(0,10).map(r=>`
    <div class="search-result-item" data-view="${r.view}">
      <div><div>${escapeHtml(r.label)}</div><small>${escapeHtml(r.type)}</small></div>
      <div>${escapeHtml(r.sub)}</div>
    </div>`).join('') : '<div class="search-empty">Nenhum resultado encontrado.</div>';
}

/* ============================== 18. TOASTS ========================================= */

function toast(title, msg, type){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${msg?`<div>${escapeHtml(msg)}</div>`:''}`;
  stack.appendChild(el);
  setTimeout(()=>{ el.classList.add('leaving'); setTimeout(()=>el.remove(), 250); }, 3200);
}

/* ============================== 19. MODAL SYSTEM =================================== */

function openModal(title, bodyHtml, opts){
  opts = opts||{};
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-box').classList.toggle('wide', !!opts.wide);
  document.getElementById('modal-overlay').classList.add('show');
  refreshIcons();
  const first = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea, #modal-body button');
  if(first) setTimeout(()=>first.focus(), 60);
}
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
}

function fieldHtml(opts){
  const { label, id, type='text', value='', required=true, options=null, step, full=false, placeholder='' } = opts;
  const cls = 'field' + (full?' full':'');
  let control;
  if(type==='select'){
    control = `<select class="input" id="${id}" ${required?'required':''}>${options.map(o=>`<option value="${escapeHtml(o.value)}" ${String(o.value)===String(value)?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
  } else if(type==='textarea'){
    control = `<textarea id="${id}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
  } else {
    control = `<input class="input" id="${id}" type="${type}" value="${escapeHtml(value)}" ${required?'required':''} ${step?`step="${step}"`:''} placeholder="${escapeHtml(placeholder)}">`;
  }
  return `<div class="${cls}" data-field="${id}"><label for="${id}">${escapeHtml(label)}</label>${control}<span class="field-error">Campo obrigatório.</span></div>`;
}

function validateForm(fieldIds){
  let ok = true;
  fieldIds.forEach(id=>{
    const input = document.getElementById(id);
    const wrap = input.closest('.field');
    const invalid = input.hasAttribute('required') && (input.value===''||input.value===null);
    const invalidNum = input.type==='number' && input.value!=='' && Number(input.value)<0;
    wrap.classList.toggle('has-error', invalid || invalidNum);
    if(invalid || invalidNum) ok = false;
  });
  return ok;
}

/* ---- Receita ---- */
function modalReceita(existing){
  const contaOptions = [{value:'',label:'Nenhuma'}].concat(DB.contas.map(c=>({value:c.id,label:c.nome})));
  const catOptions = DB.categoriasReceita.map(c=>({value:c,label:c}));
  const body = `<form id="form-receita" class="form-grid" novalidate>
    ${fieldHtml({label:'Descrição', id:'rc-descricao', value:existing?.descricao||'', full:true, placeholder:'Ex: Salário de agosto'})}
    ${fieldHtml({label:'Valor (R$)', id:'rc-valor', type:'number', step:'0.01', value:existing?.valor??''})}
    ${fieldHtml({label:'Data', id:'rc-data', type:'date', value:existing?.data||todayISO()})}
    ${fieldHtml({label:'Categoria', id:'rc-categoria', type:'select', options:catOptions, value:existing?.categoria||catOptions[0]?.value})}
    ${fieldHtml({label:'Conta', id:'rc-conta', type:'select', options:contaOptions, value:existing?.contaId||'', required:false})}
    ${fieldHtml({label:'Observação', id:'rc-obs', type:'textarea', value:existing?.observacao||'', full:true, required:false})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-receita" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar receita</button>
    </div>
  </form>`;
  openModal(existing?'Editar receita':'Nova receita', body);
  document.getElementById('form-receita').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['rc-descricao','rc-valor','rc-data','rc-categoria'])) return;
    const data = {
      id: existing?existing.id:uid(),
      descricao: document.getElementById('rc-descricao').value.trim(),
      valor: Number(document.getElementById('rc-valor').value),
      data: document.getElementById('rc-data').value,
      categoria: document.getElementById('rc-categoria').value,
      contaId: document.getElementById('rc-conta').value || null,
      observacao: document.getElementById('rc-obs').value.trim()
    };
    if(existing){ Object.assign(existing, data); } else { DB.receitas.push(data); }
    saveData(); closeModal(); toast('Receita salva', data.descricao, 'success'); refreshCurrentView();
  });
}

/* ---- Despesa ---- */
function modalDespesa(existing){
  const catOptions = DB.categoriasDespesa.map(c=>({value:c,label:c}));
  const contaOptions = [{value:'',label:'Nenhuma'}].concat(DB.contas.map(c=>({value:c.id,label:c.nome})));
  const cartaoOptions = DB.cartoes.map(c=>({value:c.id,label:c.nome}));
  const formaOptions = FORMAS_PAGAMENTO.map(f=>({value:f,label:f}));
  const isCartao = existing ? existing.formaPagamento==='Cartão de crédito' : false;

  const body = `<form id="form-despesa" class="form-grid" novalidate>
    ${fieldHtml({label:'Descrição', id:'dp-descricao', value:existing?.descricao||'', full:true, placeholder:'Ex: Supermercado'})}
    ${fieldHtml({label:'Valor (R$)', id:'dp-valor', type:'number', step:'0.01', value:existing?.valor??''})}
    ${fieldHtml({label:'Data', id:'dp-data', type:'date', value:existing?.data||todayISO()})}
    ${fieldHtml({label:'Categoria', id:'dp-categoria', type:'select', options:catOptions, value:existing?.categoria||catOptions[0]?.value})}
    ${fieldHtml({label:'Forma de pagamento', id:'dp-forma', type:'select', options:formaOptions, value:existing?.formaPagamento||formaOptions[0].value})}
    <div class="field full" id="dp-cartao-wrap" data-field="dp-cartao" ${isCartao?'':'style="display:none"'}>
      <label for="dp-cartao">Selecionar cartão</label>
      <select class="input" id="dp-cartao">${cartaoOptions.length?cartaoOptions.map(o=>`<option value="${o.value}" ${o.value===existing?.cartaoId?'selected':''}>${escapeHtml(o.label)}</option>`).join(''):'<option value="">Nenhum cartão cadastrado</option>'}</select>
      <span class="field-error">Selecione um cartão.</span>
    </div>
    <div class="field full" id="dp-conta-wrap" data-field="dp-conta" ${isCartao?'style="display:none"':''}>
      <label for="dp-conta">Conta</label>
      <select class="input" id="dp-conta">${contaOptions.map(o=>`<option value="${o.value}" ${o.value===(existing?.contaId||'')?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select>
    </div>
    ${fieldHtml({label:'Observação', id:'dp-obs', type:'textarea', value:existing?.observacao||'', full:true, required:false})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-despesa" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar despesa</button>
    </div>
  </form>`;
  openModal(existing?'Editar despesa':'Nova despesa', body);

  const formaSel = document.getElementById('dp-forma');
  formaSel.addEventListener('change', ()=>{
    const cartaoMode = formaSel.value==='Cartão de crédito';
    document.getElementById('dp-cartao-wrap').style.display = cartaoMode?'':'none';
    document.getElementById('dp-conta-wrap').style.display = cartaoMode?'none':'';
  });

  document.getElementById('form-despesa').addEventListener('submit', e=>{
    e.preventDefault();
    const cartaoMode = formaSel.value==='Cartão de crédito';
    const required = ['dp-descricao','dp-valor','dp-data','dp-categoria'];
    if(!validateForm(required)) return;
    if(cartaoMode && !document.getElementById('dp-cartao').value){
      document.getElementById('dp-cartao-wrap').classList.add('has-error'); return;
    }
    const data = {
      id: existing?existing.id:uid(),
      descricao: document.getElementById('dp-descricao').value.trim(),
      valor: Number(document.getElementById('dp-valor').value),
      data: document.getElementById('dp-data').value,
      categoria: document.getElementById('dp-categoria').value,
      formaPagamento: formaSel.value,
      cartaoId: cartaoMode ? document.getElementById('dp-cartao').value : null,
      contaId: !cartaoMode ? (document.getElementById('dp-conta').value||null) : null,
      observacao: document.getElementById('dp-obs').value.trim()
    };
    if(existing){ Object.assign(existing, data); } else { DB.despesas.push(data); }
    saveData(); closeModal(); toast('Despesa salva', data.descricao, 'success'); refreshCurrentView();
  });
}

/* ---- Categoria ---- */
function modalCategoria(tipo){
  const body = `<form id="form-categoria" class="form-grid" novalidate>
    ${fieldHtml({label:'Nome da categoria', id:'cat-nome', full:true, placeholder:'Ex: Pets'})}
    <div class="form-actions full">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Adicionar</button>
    </div>
  </form>`;
  openModal('Nova categoria', body);
  document.getElementById('form-categoria').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['cat-nome'])) return;
    const nome = document.getElementById('cat-nome').value.trim();
    const arr = tipo==='receita' ? DB.categoriasReceita : DB.categoriasDespesa;
    if(!arr.some(c=>normalizeStr(c)===normalizeStr(nome))) arr.push(nome);
    saveData(); closeModal(); toast('Categoria adicionada', nome, 'success'); refreshCurrentView();
  });
}

/* ---- Cartão ---- */
function modalCartao(existing){
  const bandeiraOptions = BANDEIRAS.map(b=>({value:b,label:b}));
  const temCorPersonalizada = !!(existing?.corInicio && existing?.corFim);
  const corInicioIni = existing?.corInicio || cardColors(existing||{id:'novo'})[0];
  const corFimIni = existing?.corFim || cardColors(existing||{id:'novo'})[1];
  const body = `<form id="form-cartao" class="form-grid" novalidate>
    ${fieldHtml({label:'Nome do cartão', id:'ct-nome', value:existing?.nome||'', placeholder:'Ex: Nubank'})}
    ${fieldHtml({label:'Banco', id:'ct-banco', value:existing?.banco||''})}
    ${fieldHtml({label:'Limite total (R$)', id:'ct-limite', type:'number', step:'0.01', value:existing?.limite??''})}
    ${fieldHtml({label:'Dia de fechamento', id:'ct-fechamento', type:'number', value:existing?.fechamento??'', step:'1'})}
    ${fieldHtml({label:'Dia de vencimento', id:'ct-vencimento', type:'number', value:existing?.vencimento??'', step:'1'})}
    ${fieldHtml({label:'Bandeira', id:'ct-bandeira', type:'select', options:bandeiraOptions, value:existing?.bandeira||bandeiraOptions[0].value, required:false, full:true})}
    <div class="field full">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:12.5px;color:var(--text-secondary)">
        <input type="checkbox" id="ct-custom-color" ${temCorPersonalizada?'checked':''}> Personalizar cores do cartão
      </label>
      <span class="form-hint">Se não marcar, usamos automaticamente as cores do banco informado (quando reconhecido).</span>
    </div>
    <div class="field" id="ct-cor-inicio-wrap" ${temCorPersonalizada?'':'style="display:none"'}>
      <label for="ct-cor-inicio">Cor inicial</label>
      <input type="color" id="ct-cor-inicio" value="${corInicioIni}" style="width:100%;height:42px;border:1px solid var(--border);border-radius:10px;padding:2px;background:var(--bg-elevated)">
    </div>
    <div class="field" id="ct-cor-fim-wrap" ${temCorPersonalizada?'':'style="display:none"'}>
      <label for="ct-cor-fim">Cor final</label>
      <input type="color" id="ct-cor-fim" value="${corFimIni}" style="width:100%;height:42px;border:1px solid var(--border);border-radius:10px;padding:2px;background:var(--bg-elevated)">
    </div>
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-cartao" data-id="${existing.id}">Excluir cartão</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar cartão</button>
    </div>
  </form>`;
  openModal(existing?'Editar cartão':'Adicionar novo cartão', body);

  const customChk = document.getElementById('ct-custom-color');
  customChk.addEventListener('change', ()=>{
    document.getElementById('ct-cor-inicio-wrap').style.display = customChk.checked?'':'none';
    document.getElementById('ct-cor-fim-wrap').style.display = customChk.checked?'':'none';
  });

  document.getElementById('form-cartao').addEventListener('submit', e=>{
    e.preventDefault();
    const ids = ['ct-nome','ct-banco','ct-limite','ct-fechamento','ct-vencimento'];
    if(!validateForm(ids)) return;
    const fech = clamp(Number(document.getElementById('ct-fechamento').value),1,31);
    const venc = clamp(Number(document.getElementById('ct-vencimento').value),1,31);
    const usaCorPersonalizada = document.getElementById('ct-custom-color').checked;
    const data = {
      id: existing?existing.id:uid(),
      nome: document.getElementById('ct-nome').value.trim(),
      banco: document.getElementById('ct-banco').value.trim(),
      limite: Number(document.getElementById('ct-limite').value),
      fechamento: fech, vencimento: venc,
      bandeira: document.getElementById('ct-bandeira').value,
      corInicio: usaCorPersonalizada ? document.getElementById('ct-cor-inicio').value : null,
      corFim: usaCorPersonalizada ? document.getElementById('ct-cor-fim').value : null
    };
    if(existing){ Object.assign(existing, data); } else { DB.cartoes.push(data); }
    saveData(); closeModal(); toast('Cartão salvo', data.nome, 'success'); refreshCurrentView();
  });
}

/* ---- Conta ---- */
function modalConta(existing){
  const tipoOptions = TIPOS_CONTA.map(t=>({value:t,label:t}));
  const body = `<form id="form-conta" class="form-grid" novalidate>
    ${fieldHtml({label:'Nome da conta', id:'cn-nome', value:existing?.nome||'', full:true, placeholder:'Ex: Conta principal'})}
    ${fieldHtml({label:'Tipo', id:'cn-tipo', type:'select', options:tipoOptions, value:existing?.tipo||tipoOptions[0].value})}
    ${fieldHtml({label:'Saldo inicial (R$)', id:'cn-saldo', type:'number', step:'0.01', value:existing?.saldoInicial??0, required:false})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-conta" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar conta</button>
    </div>
  </form>`;
  openModal(existing?'Editar conta':'Nova conta', body);
  document.getElementById('form-conta').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['cn-nome','cn-tipo'])) return;
    const data = { id: existing?existing.id:uid(), nome: document.getElementById('cn-nome').value.trim(), tipo: document.getElementById('cn-tipo').value, saldoInicial: Number(document.getElementById('cn-saldo').value||0) };
    if(existing){ Object.assign(existing, data); } else { DB.contas.push(data); }
    saveData(); closeModal(); toast('Conta salva', data.nome, 'success'); refreshCurrentView();
  });
}

/* ---- Meta ---- */
function modalMeta(existing){
  const tipoOptions = TIPOS_META.map(t=>({value:t,label:t}));
  const temCorPersonalizada = !!existing?.cor;
  const corIni = existing?.cor || TIPO_META_COLOR[existing?.tipo||tipoOptions[0].value];
  const body = `<form id="form-meta" class="form-grid" novalidate>
    ${fieldHtml({label:'Nome da meta', id:'mt-nome', value:existing?.nome||'', full:true, placeholder:'Ex: Comprar computador'})}
    ${fieldHtml({label:'Tipo', id:'mt-tipo', type:'select', options:tipoOptions, value:existing?.tipo||tipoOptions[0].value})}
    ${fieldHtml({label:'Valor alvo (R$)', id:'mt-alvo', type:'number', step:'0.01', value:existing?.valorAlvo??''})}
    ${fieldHtml({label:'Valor já guardado (R$)', id:'mt-guardado', type:'number', step:'0.01', value:existing?existing.valorGuardado:0, required:false})}
    ${fieldHtml({label:'Prazo', id:'mt-prazo', type:'month', value:existing?.prazo||'', required:false})}
    ${fieldHtml({label:'Descrição', id:'mt-desc', type:'textarea', value:existing?.descricao||'', full:true, required:false})}
    <div class="field full">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:12.5px;color:var(--text-secondary)">
        <input type="checkbox" id="mt-custom-color" ${temCorPersonalizada?'checked':''}> Personalizar cor da meta
      </label>
    </div>
    <div class="field full" id="mt-cor-wrap" ${temCorPersonalizada?'':'style="display:none"'}>
      <label for="mt-cor">Cor da meta</label>
      <input type="color" id="mt-cor" value="${corIni}" style="width:100%;height:42px;border:1px solid var(--border);border-radius:10px;padding:2px;background:var(--bg-elevated)">
    </div>
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-meta" data-id="${existing.id}">Excluir meta</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar meta</button>
    </div>
  </form>`;
  openModal(existing?'Editar meta':'Nova meta', body);

  document.getElementById('mt-tipo').addEventListener('change', (e)=>{
    if(!document.getElementById('mt-custom-color').checked){
      document.getElementById('mt-cor').value = TIPO_META_COLOR[e.target.value] || '#7C4DFF';
    }
  });
  document.getElementById('mt-custom-color').addEventListener('change', (e)=>{
    document.getElementById('mt-cor-wrap').style.display = e.target.checked?'':'none';
  });

  document.getElementById('form-meta').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['mt-nome','mt-tipo','mt-alvo'])) return;
    const data = {
      id: existing?existing.id:uid(),
      nome: document.getElementById('mt-nome').value.trim(),
      tipo: document.getElementById('mt-tipo').value,
      valorAlvo: Number(document.getElementById('mt-alvo').value),
      valorGuardado: Number(document.getElementById('mt-guardado').value||0),
      dataCriacao: existing?existing.dataCriacao:todayISO(),
      prazo: document.getElementById('mt-prazo').value || null,
      descricao: document.getElementById('mt-desc').value.trim(),
      cor: document.getElementById('mt-custom-color').checked ? document.getElementById('mt-cor').value : null,
      movimentacoes: existing?existing.movimentacoes:[]
    };
    if(existing){ Object.assign(existing, data); } else { DB.metas.push(data); }
    saveData(); closeModal(); toast('Meta salva', data.nome, 'success'); refreshCurrentView();
  });
}

function modalMetaDetalhe(meta){
  const c = goalCalc(meta);
  const hist = (meta.movimentacoes||[]).slice().reverse().slice(0,10);
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><div class="lbl">Alvo</div><div class="val">${formatCurrency(c.alvo)}</div></div>
      <div class="detail-item"><div class="lbl">Guardado</div><div class="val" style="color:var(--success)">${formatCurrency(c.guardado)}</div></div>
      <div class="detail-item"><div class="lbl">Restante</div><div class="val">${formatCurrency(c.restante)}</div></div>
      <div class="detail-item"><div class="lbl">Progresso</div><div class="val">${formatNumber(c.progresso,2)}%</div></div>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${c.progresso}%;background:${metaColor(meta)}"></div></div>
    <div class="detail-grid" style="margin-top:16px">
      <div class="detail-item"><div class="lbl">Criada em</div><div class="val" style="font-size:13.5px">${formatDate(meta.dataCriacao)}</div></div>
      <div class="detail-item"><div class="lbl">Prazo</div><div class="val" style="font-size:13.5px">${meta.prazo?formatMonthYear(meta.prazo):'Sem prazo'}</div></div>
      <div class="detail-item"><div class="lbl">Meses restantes</div><div class="val" style="font-size:13.5px">${c.mesesRestantes===null?'—':c.mesesRestantes}</div></div>
      <div class="detail-item"><div class="lbl">Recomendado/mês</div><div class="val" style="font-size:13.5px">${formatCurrency(c.valorRecomendado)}</div></div>
    </div>
    <div style="margin:14px 0"><span class="badge ${c.status==='Concluída'?'green':(c.status==='Atrasada'?'red':(c.status==='Próxima do prazo'?'yellow':'purple'))}">${c.status}${c.status==='Concluída'?' 🎉':''}</span></div>
    ${meta.descricao?`<p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">${escapeHtml(meta.descricao)}</p>`:''}
    <div class="modal-section-title">Histórico</div>
    <div class="history-list">${hist.length?hist.map(h=>`<div class="history-row"><span>${h.tipo==='add'?'+ ':'- '}${formatCurrency(h.valor)} ${h.observacao?'· '+escapeHtml(h.observacao):''}</span><span>${formatDate(h.data)}</span></div>`).join(''):'<div class="empty-inline">Nenhuma movimentação ainda.</div>'}</div>
    <div class="form-actions">
      <button type="button" class="btn btn-outline" data-action="edit-meta" data-id="${meta.id}"><span data-lucide="pencil"></span>Editar</button>
      <button type="button" class="btn btn-outline" data-action="meta-retirar" data-id="${meta.id}">Retirar dinheiro</button>
      <button type="button" class="btn btn-primary" data-action="meta-adicionar" data-id="${meta.id}"><span data-lucide="plus"></span>Adicionar dinheiro</button>
    </div>`;
  openModal(meta.nome, body);
}

function modalMetaMovimento(meta, tipo){
  const body = `<form id="form-meta-mov" class="form-grid" novalidate>
    ${fieldHtml({label:'Valor (R$)', id:'mv-valor', type:'number', step:'0.01', full:true})}
    ${fieldHtml({label:'Data', id:'mv-data', type:'date', value:todayISO()})}
    ${fieldHtml({label:'Observação', id:'mv-obs', required:false, full:true})}
    <div class="form-actions full">
      <button type="button" class="btn btn-ghost" data-action="open-meta" data-id="${meta.id}">Voltar</button>
      <button type="submit" class="btn btn-primary">${tipo==='add'?'Adicionar':'Retirar'}</button>
    </div>
  </form>`;
  openModal(tipo==='add'?'Adicionar dinheiro':'Retirar dinheiro', body);
  document.getElementById('form-meta-mov').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['mv-valor','mv-data'])) return;
    const valor = Number(document.getElementById('mv-valor').value);
    if(tipo==='retirada' && valor>meta.valorGuardado){
      document.getElementById('mv-valor').closest('.field').classList.add('has-error');
      document.querySelector('#mv-valor + .field-error, #mv-valor ~ .field-error').textContent = 'Você não pode retirar mais do que o valor disponível na meta.';
      toast('Valor inválido', 'Você não pode retirar mais do que o valor disponível na meta.', 'error');
      return;
    }
    meta.movimentacoes = meta.movimentacoes||[];
    meta.movimentacoes.push({ id:uid(), tipo, valor, data:document.getElementById('mv-data').value, observacao:document.getElementById('mv-obs').value.trim() });
    meta.valorGuardado = tipo==='add' ? Number(meta.valorGuardado)+valor : Number(meta.valorGuardado)-valor;
    saveData();
    toast(tipo==='add'?'Dinheiro adicionado':'Dinheiro retirado', meta.nome, 'success');
    const c = goalCalc(meta);
    if(c.status==='Concluída' && tipo==='add') toast('Meta concluída! 🎉', meta.nome, 'success');
    refreshCurrentView();
    modalMetaDetalhe(meta);
  });
}

/* ---- Orçamento ---- */
function modalOrcamento(existing){
  const catOptions = DB.categoriasDespesa.map(c=>({value:c,label:c}));
  const body = `<form id="form-orcamento" class="form-grid" novalidate>
    ${fieldHtml({label:'Categoria', id:'or-categoria', type:'select', options:catOptions, value:existing?.categoria||catOptions[0]?.value, full:true})}
    ${fieldHtml({label:'Limite mensal (R$)', id:'or-limite', type:'number', step:'0.01', value:existing?.limite??'', full:true})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-orcamento" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar orçamento</button>
    </div>
  </form>`;
  openModal(existing?'Editar orçamento':'Novo orçamento', body);
  document.getElementById('form-orcamento').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['or-categoria','or-limite'])) return;
    const categoria = document.getElementById('or-categoria').value;
    if(!existing && DB.orcamentos.some(o=>o.categoria===categoria)){ toast('Já existe', 'Já existe um orçamento para esta categoria.', 'error'); return; }
    const data = { id: existing?existing.id:uid(), categoria, limite:Number(document.getElementById('or-limite').value) };
    if(existing){ Object.assign(existing, data); } else { DB.orcamentos.push(data); }
    saveData(); closeModal(); toast('Orçamento salvo', categoria, 'success'); refreshCurrentView();
  });
}

/* ---- Parcelamento ---- */
function modalParcelamento(existing){
  const cartaoOptions = DB.cartoes.map(c=>({value:c.id,label:c.nome}));
  const body = `<form id="form-parcelamento" class="form-grid" novalidate>
    ${fieldHtml({label:'Descrição', id:'pc-descricao', value:existing?.descricao||'', full:true, placeholder:'Ex: Notebook'})}
    ${fieldHtml({label:'Valor total (R$)', id:'pc-valor', type:'number', step:'0.01', value:existing?.valorTotal??''})}
    ${fieldHtml({label:'Quantidade de parcelas', id:'pc-qtd', type:'number', step:'1', value:existing?.qtdParcelas??''})}
    ${fieldHtml({label:'Cartão', id:'pc-cartao', type:'select', options:cartaoOptions.length?cartaoOptions:[{value:'',label:'Cadastre um cartão primeiro'}], value:existing?.cartaoId||''})}
    ${fieldHtml({label:'Data da compra', id:'pc-data', type:'date', value:existing?.dataCompra||todayISO()})}
    ${fieldHtml({label:'Categoria', id:'pc-categoria', type:'select', options:DB.categoriasDespesa.map(c=>({value:c,label:c})), value:existing?.categoria||DB.categoriasDespesa[0]})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-parcelamento" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>
  </form>`;
  openModal(existing?'Editar compra parcelada':'Nova compra parcelada', body);
  document.getElementById('form-parcelamento').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['pc-descricao','pc-valor','pc-qtd','pc-cartao','pc-data','pc-categoria'])) return;
    const data = {
      id: existing?existing.id:uid(),
      descricao: document.getElementById('pc-descricao').value.trim(),
      valorTotal: Number(document.getElementById('pc-valor').value),
      qtdParcelas: Math.max(1, Number(document.getElementById('pc-qtd').value)),
      cartaoId: document.getElementById('pc-cartao').value,
      dataCompra: document.getElementById('pc-data').value,
      categoria: document.getElementById('pc-categoria').value
    };
    // parcelas pagas: mantém o que já foi pago manualmente ao editar; ao criar,
    // considera já vencidas as parcelas cujo mês já passou desde a data da compra.
    data.parcelasPagas = existing
      ? clamp(Number(existing.parcelasPagas||0), 0, data.qtdParcelas)
      : clamp(monthsBetween(data.dataCompra, todayISO()), 0, data.qtdParcelas);
    if(existing){ Object.assign(existing, data); } else { DB.parcelamentos.push(data); }
    saveData(); closeModal(); toast('Compra parcelada salva', data.descricao, 'success'); refreshCurrentView();
  });
}

/* ---- Recorrente ---- */
function modalRecorrente(existing){
  const freqOptions = ['Mensal','Semanal','Anual'].map(f=>({value:f,label:f}));
  const body = `<form id="form-recorrente" class="form-grid" novalidate>
    ${fieldHtml({label:'Descrição', id:'rr-descricao', value:existing?.descricao||'', full:true, placeholder:'Ex: Netflix'})}
    ${fieldHtml({label:'Categoria', id:'rr-categoria', type:'select', options:DB.categoriasDespesa.map(c=>({value:c,label:c})), value:existing?.categoria||DB.categoriasDespesa[0]})}
    ${fieldHtml({label:'Valor (R$)', id:'rr-valor', type:'number', step:'0.01', value:existing?.valor??''})}
    ${fieldHtml({label:'Frequência', id:'rr-freq', type:'select', options:freqOptions, value:existing?.frequencia||'Mensal'})}
    ${fieldHtml({label:'Próxima cobrança', id:'rr-proxima', type:'date', value:existing?.proximaData||todayISO(), full:true})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-recorrente" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>
  </form>`;
  openModal(existing?'Editar despesa recorrente':'Nova despesa recorrente', body);
  document.getElementById('form-recorrente').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['rr-descricao','rr-categoria','rr-valor','rr-freq','rr-proxima'])) return;
    const data = { id: existing?existing.id:uid(), descricao: document.getElementById('rr-descricao').value.trim(), categoria: document.getElementById('rr-categoria').value, valor: Number(document.getElementById('rr-valor').value), frequencia: document.getElementById('rr-freq').value, proximaData: document.getElementById('rr-proxima').value };
    if(existing){ Object.assign(existing, data); } else { DB.recorrentes.push(data); }
    saveData(); closeModal(); toast('Despesa recorrente salva', data.descricao, 'success'); refreshCurrentView();
  });
}

/* ---- Patrimônio ---- */
function modalPatrimonio(existing){
  const catOptions = CATS_PATRIMONIO.map(c=>({value:c,label:c}));
  const body = `<form id="form-patrimonio" class="form-grid" novalidate>
    ${fieldHtml({label:'Nome do item', id:'pt-nome', value:existing?.nome||'', full:true, placeholder:'Ex: Reserva em poupança'})}
    ${fieldHtml({label:'Categoria', id:'pt-categoria', type:'select', options:catOptions, value:existing?.categoria||catOptions[0].value})}
    ${fieldHtml({label:'Valor (R$)', id:'pt-valor', type:'number', step:'0.01', value:existing?.valor??''})}
    <div class="form-actions full">
      ${existing?`<button type="button" class="btn btn-danger-outline" data-action="delete-patrimonio" data-id="${existing.id}">Excluir</button>`:''}
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>
  </form>`;
  openModal(existing?'Editar item de patrimônio':'Novo item de patrimônio', body);
  document.getElementById('form-patrimonio').addEventListener('submit', e=>{
    e.preventDefault();
    if(!validateForm(['pt-nome','pt-categoria','pt-valor'])) return;
    const data = { id: existing?existing.id:uid(), nome: document.getElementById('pt-nome').value.trim(), categoria: document.getElementById('pt-categoria').value, valor: Number(document.getElementById('pt-valor').value) };
    if(existing){ Object.assign(existing, data); } else { DB.patrimonio.push(data); }
    snapshotPatrimonio();
    saveData(); closeModal(); toast('Patrimônio salvo', data.nome, 'success'); refreshCurrentView();
  });
}
function snapshotPatrimonio(){
  const hoje = todayISO();
  DB.patrimonioHistorico = DB.patrimonioHistorico||[];
  const idx = DB.patrimonioHistorico.findIndex(h=>h.data===hoje);
  const total = patrimonioTotal();
  if(idx>=0) DB.patrimonioHistorico[idx].total = total;
  else DB.patrimonioHistorico.push({ data:hoje, total });
}

/* ---- Confirmação de exclusão ---- */
function confirmDelete(msg, onConfirm){
  const body = `<p style="font-size:13.5px;color:var(--text-secondary);margin-bottom:18px">${escapeHtml(msg)}</p>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="button" class="btn btn-danger" id="btn-confirm-delete">Excluir</button>
    </div>`;
  openModal('Confirmar exclusão', body);
  document.getElementById('btn-confirm-delete').addEventListener('click', ()=>{ onConfirm(); closeModal(); });
}

/* ---- Menu rápido "Adicionar" ---- */
function modalQuickAdd(){
  const opts = [
    {label:'Receita', action:'new-receita', icon:'trending-up'},
    {label:'Despesa', action:'new-despesa', icon:'trending-down'},
    {label:'Cartão', action:'new-cartao', icon:'credit-card'},
    {label:'Conta', action:'new-conta', icon:'landmark'},
    {label:'Meta', action:'new-meta', icon:'target'},
    {label:'Compra parcelada', action:'new-parcelamento', icon:'layers'}
  ];
  const body = `<div class="tag-list" style="gap:10px">
    ${opts.map(o=>`<button type="button" class="btn btn-outline" data-action="${o.action}" style="flex:1 1 45%"><span data-lucide="${o.icon}"></span>${o.label}</button>`).join('')}
  </div>`;
  openModal('O que você quer adicionar?', body, {wide:true});
}

/* ============================== 20. AÇÕES (event delegation) ====================== */

function handleAction(action, id, target){
  switch(action){
    case 'new-receita': return modalReceita();
    case 'edit-receita': return modalReceita(DB.receitas.find(r=>r.id===id));
    case 'delete-receita': return confirmDelete('Excluir esta receita? Essa ação não pode ser desfeita.', ()=>{ DB.receitas = DB.receitas.filter(r=>r.id!==id); saveData(); toast('Receita excluída'); refreshCurrentView(); });

    case 'new-despesa': return modalDespesa();
    case 'edit-despesa': return modalDespesa(DB.despesas.find(d=>d.id===id));
    case 'delete-despesa': return confirmDelete('Excluir esta despesa? O limite do cartão vinculado será recalculado.', ()=>{ DB.despesas = DB.despesas.filter(d=>d.id!==id); saveData(); toast('Despesa excluída'); refreshCurrentView(); });

    case 'new-categoria': return modalCategoria('despesa');
    case 'delete-categoria': return confirmDelete(`Remover a categoria "${id}"? Despesas já cadastradas manterão o nome antigo.`, ()=>{ DB.categoriasDespesa = DB.categoriasDespesa.filter(c=>c!==id); saveData(); toast('Categoria removida'); refreshCurrentView(); });

    case 'new-cartao': return modalCartao();
    case 'edit-cartao': return modalCartao(getCartao(id));
    case 'open-cartao': return modalCartao(getCartao(id));
    case 'delete-cartao': return confirmDelete('Excluir este cartão? Despesas vinculadas a ele permanecerão cadastradas.', ()=>{ DB.cartoes = DB.cartoes.filter(c=>c.id!==id); saveData(); toast('Cartão excluído'); refreshCurrentView(); });

    case 'new-conta': return modalConta();
    case 'edit-conta': return modalConta(getConta(id));
    case 'open-conta': return modalConta(getConta(id));
    case 'delete-conta': return confirmDelete('Excluir esta conta?', ()=>{ DB.contas = DB.contas.filter(c=>c.id!==id); saveData(); toast('Conta excluída'); refreshCurrentView(); });

    case 'new-meta': return modalMeta();
    case 'edit-meta': return modalMeta(getMeta(id));
    case 'open-meta': return modalMetaDetalhe(getMeta(id));
    case 'delete-meta': return confirmDelete('Excluir esta meta e todo o seu histórico?', ()=>{ DB.metas = DB.metas.filter(m=>m.id!==id); saveData(); toast('Meta excluída'); closeModal(); refreshCurrentView(); });
    case 'meta-adicionar': return modalMetaMovimento(getMeta(id), 'add');
    case 'meta-retirar': return modalMetaMovimento(getMeta(id), 'retirada');

    case 'new-orcamento': return modalOrcamento();
    case 'edit-orcamento': return modalOrcamento(DB.orcamentos.find(o=>o.id===id));
    case 'delete-orcamento': return confirmDelete('Excluir este orçamento?', ()=>{ DB.orcamentos = DB.orcamentos.filter(o=>o.id!==id); saveData(); toast('Orçamento excluído'); refreshCurrentView(); });

    case 'new-parcelamento': return modalParcelamento();
    case 'edit-parcelamento': return modalParcelamento(DB.parcelamentos.find(p=>p.id===id));
    case 'delete-parcelamento': return confirmDelete('Excluir esta compra parcelada?', ()=>{ DB.parcelamentos = DB.parcelamentos.filter(p=>p.id!==id); saveData(); toast('Compra parcelada excluída'); refreshCurrentView(); });
    case 'pagar-parcela': return pagarParcela(id);

    case 'new-recorrente': return modalRecorrente();
    case 'edit-recorrente': return modalRecorrente(DB.recorrentes.find(r=>r.id===id));
    case 'delete-recorrente': return confirmDelete('Excluir esta despesa recorrente?', ()=>{ DB.recorrentes = DB.recorrentes.filter(r=>r.id!==id); saveData(); toast('Despesa recorrente excluída'); refreshCurrentView(); });
    case 'lancar-recorrente': return lancarRecorrente(id);

    case 'new-patrimonio': return modalPatrimonio();
    case 'edit-patrimonio': return modalPatrimonio(DB.patrimonio.find(p=>p.id===id));
    case 'delete-patrimonio': return confirmDelete('Excluir este item de patrimônio?', ()=>{ DB.patrimonio = DB.patrimonio.filter(p=>p.id!==id); snapshotPatrimonio(); saveData(); toast('Item excluído'); refreshCurrentView(); });

    case 'close-modal': return closeModal();
    case 'quick-add': return modalQuickAdd();
    case 'google-login': return googleLogin();
    case 'google-logout': return googleLogout();
  }
}

function lancarRecorrente(id){
  const r = DB.recorrentes.find(x=>x.id===id);
  if(!r) return;
  DB.despesas.push({ id:uid(), descricao:r.descricao, valor:r.valor, data:todayISO(), categoria:r.categoria, formaPagamento:'Débito', cartaoId:null, contaId:null, observacao:'Lançado a partir de despesa recorrente' });
  if(r.frequencia==='Mensal') r.proximaData = addMonthsToISO(r.proximaData, 1);
  else if(r.frequencia==='Anual') r.proximaData = addMonthsToISO(r.proximaData, 12);
  else r.proximaData = addDaysToISO(r.proximaData, 7);
  saveData();
  toast('Despesa lançada', r.descricao, 'success');
  refreshCurrentView();
}

function pagarParcela(id){
  const p = DB.parcelamentos.find(x=>x.id===id);
  if(!p) return;
  p.parcelasPagas = clamp(Number(p.parcelasPagas||0)+1, 0, p.qtdParcelas);
  saveData();
  const st = parcelamentoStatus(p);
  toast(st.concluido ? 'Parcelamento quitado! 🎉' : 'Parcela paga', p.descricao, 'success');
  refreshCurrentView();
}

/* ============================== 21. LIMPAR DADOS ======================== */

function clearAllData(){
  confirmDelete('Isso vai apagar TODOS os seus dados permanentemente. Tem certeza?', ()=>{
    DB = defaultDB();
    saveData();
    applyTheme(DB.config.tema);
    switchView('dashboard');
    toast('Dados limpos', 'Todos os dados foram removidos.', 'success');
  });
}

/* ============================== 22. INICIALIZAÇÃO =================================== */

function initApp(){
  document.documentElement.setAttribute('data-theme', DB.config.tema||'light');
  if(DB.config.sidebarCollapsed) document.querySelector('.app-shell').classList.add('collapsed');

  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=> switchView(btn.dataset.view));
  });

  document.getElementById('btn-mobile-menu').addEventListener('click', ()=>{
    document.querySelector('.app-shell').classList.add('mobile-open');
    document.getElementById('sidebar-overlay').classList.add('show');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);
  document.getElementById('btn-collapse-sidebar').addEventListener('click', ()=>{
    const shell = document.querySelector('.app-shell');
    shell.classList.toggle('collapsed');
    DB.config.sidebarCollapsed = shell.classList.contains('collapsed');
    saveData();
  });

  document.getElementById('btn-theme-toggle').addEventListener('click', ()=>{
    applyTheme(DB.config.tema==='dark' ? 'light' : 'dark');
  });
  document.getElementById('btn-set-light').addEventListener('click', ()=>applyTheme('light'));
  document.getElementById('btn-set-dark').addEventListener('click', ()=>applyTheme('dark'));

  document.getElementById('btn-quick-add').addEventListener('click', modalQuickAdd);
  document.getElementById('btn-clear-data').addEventListener('click', clearAllData);

  document.getElementById('btn-modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e=>{ if(e.target.id==='modal-overlay') closeModal(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

  // Delegação de eventos para toda a ação da aplicação
  document.addEventListener('click', e=>{
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    handleAction(action, id, el);
  });

  // Busca global
  const searchInput = document.getElementById('global-search');
  searchInput.addEventListener('input', ()=> runGlobalSearch(searchInput.value));
  document.getElementById('search-results').addEventListener('click', e=>{
    const item = e.target.closest('.search-result-item');
    if(!item) return;
    switchView(item.dataset.view);
    searchInput.value=''; document.getElementById('search-results').classList.remove('show');
  });
  document.addEventListener('click', e=>{
    if(!e.target.closest('.topbar-search')) document.getElementById('search-results').classList.remove('show');
  });

  // Notificações
  document.getElementById('btn-notifications').addEventListener('click', e=>{
    e.stopPropagation();
    document.getElementById('notif-panel').classList.toggle('show');
  });
  document.addEventListener('click', e=>{
    if(!e.target.closest('.notif-wrap')) document.getElementById('notif-panel').classList.remove('show');
  });

  // Dashboard: filtro rápido de período (semana/mês/ano)
  document.getElementById('dashboard-period').addEventListener('click', e=>{
    const chip = e.target.closest('.chip'); if(!chip) return;
    dashboardPeriod = chip.dataset.period;
    // usar o atalho rápido desativa o filtro de calendário, para não haver ambiguidade
    dashboardDateFilter.mode = 'all'; dashboardDateFilter.value = null;
    document.getElementById('dash-filter-mode').value = 'all';
    document.getElementById('dash-filter-day').hidden = true;
    document.getElementById('dash-filter-month').hidden = true;
    document.getElementById('dash-filter-year').hidden = true;
    document.querySelectorAll('#dashboard-period .chip').forEach(c=>c.classList.toggle('active', c===chip));
    renderDashboard();
  });

  // Dashboard: filtro de calendário (dia / mês / ano específico)
  wireDateFilter('dash-filter-mode','dash-filter-day','dash-filter-month','dash-filter-year', dashboardDateFilter, renderDashboard);

  // Filtros de listas (receitas/despesas)
  ['filtro-receitas-busca','filtro-receitas-categoria','filtro-receitas-ordenar'].forEach(id=>{
    document.getElementById(id).addEventListener('input', renderReceitas);
    document.getElementById(id).addEventListener('change', renderReceitas);
  });
  wireDateFilter('filtro-receitas-data-mode','filtro-receitas-data-day','filtro-receitas-data-month','filtro-receitas-data-year', receitasDateFilter, renderReceitas);
  document.getElementById('btn-limpar-filtros-receitas').addEventListener('click', ()=>{
    document.getElementById('filtro-receitas-busca').value = '';
    document.getElementById('filtro-receitas-categoria').value = '';
    document.getElementById('filtro-receitas-ordenar').value = 'data-desc';
    document.getElementById('filtro-receitas-data-mode').value = 'all';
    receitasDateFilter.mode = 'all'; receitasDateFilter.value = null;
    document.getElementById('filtro-receitas-data-day').hidden = true;
    document.getElementById('filtro-receitas-data-month').hidden = true;
    document.getElementById('filtro-receitas-data-year').hidden = true;
    renderReceitas();
  });

  ['filtro-despesas-busca','filtro-despesas-categoria','filtro-despesas-ordenar'].forEach(id=>{
    document.getElementById(id).addEventListener('input', renderDespesas);
    document.getElementById(id).addEventListener('change', renderDespesas);
  });
  wireDateFilter('filtro-despesas-data-mode','filtro-despesas-data-day','filtro-despesas-data-month','filtro-despesas-data-year', despesasDateFilter, renderDespesas);
  document.getElementById('btn-limpar-filtros-despesas').addEventListener('click', ()=>{
    document.getElementById('filtro-despesas-busca').value = '';
    document.getElementById('filtro-despesas-categoria').value = '';
    document.getElementById('filtro-despesas-ordenar').value = 'data-desc';
    document.getElementById('filtro-despesas-data-mode').value = 'all';
    despesasDateFilter.mode = 'all'; despesasDateFilter.value = null;
    document.getElementById('filtro-despesas-data-day').hidden = true;
    document.getElementById('filtro-despesas-data-month').hidden = true;
    document.getElementById('filtro-despesas-data-year').hidden = true;
    renderDespesas();
  });

  // Categoria de receita (botão dedicado não existe na UI principal, mas despesa sim)
  document.getElementById('view-despesas').addEventListener('click', e=>{
    if(e.target.closest('[data-action="new-categoria"]')) modalCategoria('despesa');
  });

  // Relatórios
  document.getElementById('relatorio-periodo').addEventListener('change', renderRelatorios);
  document.getElementById('relatorio-data-inicio').addEventListener('change', renderRelatorios);
  document.getElementById('relatorio-data-fim').addEventListener('change', renderRelatorios);

  refreshIcons();
  renderDashboard();
  renderNotifications();
  initFirebaseAuth();

  // Service worker (PWA) — não deve quebrar o funcionamento caso indisponível
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('service-worker.js').catch(()=>{ /* PWA opcional: falha silenciosa */ });
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);