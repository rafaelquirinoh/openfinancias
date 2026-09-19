// --- ESTADO GLOBAL & LOCALSTORAGE ---
let state = {
    theme: localStorage.getItem('open_finance_theme') || 'dark',
    despesas: JSON.parse(localStorage.getItem('open_finance_despesas')) || [],
    receitas: JSON.parse(localStorage.getItem('open_finance_receitas')) || [],
    cartoes: JSON.parse(localStorage.getItem('open_finance_cartoes')) || [
        { id: '1', nome: 'Nubank', banco: 'Nubank', limite: 2000, fechamento: 10, vencimento: 17, cor: '#820ad1' }
    ],
    cofrinhos: JSON.parse(localStorage.getItem('open_finance_cofrinhos')) || [
        { id: '1', nome: 'Computador', alvo: 6000, guardado: 3200, prazo: '2026-12-31' }
    ]
};

let charts = {};

// Variáveis de Filtro de Período
let filtroResumoInicio = null;
let filtroResumoFim = null;
let filtroReceitasInicio = null;
let filtroReceitasFim = null;

function salvarEstado() {
    localStorage.setItem('open_finance_despesas', JSON.stringify(state.despesas));
    localStorage.setItem('open_finance_receitas', JSON.stringify(state.receitas));
    localStorage.setItem('open_finance_cartoes', JSON.stringify(state.cartoes));
    localStorage.setItem('open_finance_cofrinhos', JSON.stringify(state.cofrinhos));
    localStorage.setItem('open_finance_theme', state.theme);
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    aplicarTema();
    configurarNavegacao();
    atualizarTudo();
    
    // Definir data padrão nos formulários para hoje
    const hoje = new Date().toISOString().split('T')[0];
    if(document.getElementById('despesa-data')) document.getElementById('despesa-data').value = hoje;
    if(document.getElementById('receita-data')) document.getElementById('receita-data').value = hoje;
});

function aplicarTema() {
    const html = document.documentElement;
    if (state.theme === 'light') {
        html.classList.remove('dark');
        html.classList.add('light');
        document.querySelector('#theme-toggle span').innerText = 'Modo Claro';
    } else {
        html.classList.remove('light');
        html.classList.add('dark');
        document.querySelector('#theme-toggle span').innerText = 'Modo Escuro';
    }
}

document.getElementById('theme-toggle').addEventListener('click', alternarTema);
document.getElementById('config-theme-btn').addEventListener('click', alternarTema);

function alternarTema() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    salvarEstado();
    aplicarTema();
}

// --- NAVEGAÇÃO ---
function configurarNavegacao() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const pageId = item.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${pageId}`).classList.add('active');
            
            document.getElementById('page-title').innerText = item.innerText.trim();
            
            // Fechar sidebar mobile se aberta
            document.getElementById('sidebar').classList.remove('mobile-open');
        });
    });

    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    });
}

// --- MODAIS ---
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    if(modalId === 'modal-despesa') popularSelectCartoes();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if(modalId === 'modal-cartao') {
        document.getElementById('form-cartao').reset();
        document.getElementById('cartao-id').value = '';
        document.getElementById('modal-cartao-titulo').innerText = 'Novo Cartão de Crédito';
    }
}

function popularSelectCartoes() {
    const select = document.getElementById('despesa-cartao');
    select.innerHTML = '';
    state.cartoes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nome;
        select.appendChild(opt);
    });
}

function toggleCartaoSelect() {
    const forma = document.getElementById('despesa-formapg').value;
    const grupo = document.getElementById('grupo-cartao-select');
    grupo.style.display = forma === 'Cartão de Crédito' ? 'block' : 'none';
}

// --- CÁLCULOS E ATUALIZAÇÃO GERAL ---
function atualizarTudo() {
    atualizarDashboard();
    renderizarDespesas();
    renderizarReceitas();
    renderizarCartoes();
    renderizarCofrinhos();
    salvarEstado();
}

// --- MOTOR DE PARCELAS & DESPESAS ---
function salvarDespesa(e) {
    e.preventDefault();
    const id = document.getElementById('despesa-id').value || Date.now().toString();
    const desc = document.getElementById('despesa-desc').value;
    const valorTotal = parseFloat(document.getElementById('despesa-valor').value);
    const categoria = document.getElementById('despesa-cat').value;
    const data = document.getElementById('despesa-data').value;
    const formaPagamento = document.getElementById('despesa-formapg').value;
    const cartaoId = formaPagamento === 'Cartão de Crédito' ? document.getElementById('despesa-cartao').value : null;
    const parcelasTotal = parseInt(document.getElementById('despesa-parcelas').value) || 1;
    const obs = document.getElementById('despesa-obs').value;

    state.despesas = state.despesas.filter(d => d.paiId !== id && d.id !== id);

    const valorParcela = valorTotal / parcelasTotal;
    const dataBase = new Date(data + 'T00:00:00');

    for (let i = 1; i <= parcelasTotal; i++) {
        let dataParcela = new Date(dataBase);
        dataParcela.setMonth(dataBase.getMonth() + (i - 1));

        const novaDespesa = {
            id: parcelasTotal > 1 ? `${id}_p${i}` : id,
            paiId: parcelasTotal > 1 ? id : null,
            desc: parcelasTotal > 1 ? `${desc} — Parcela ${i}/${parcelasTotal}` : desc,
            valor: valorParcela,
            categoria,
            data: dataParcela.toISOString().split('T')[0],
            formaPagamento,
            cartaoId,
            parcelaAtual: i,
            parcelasTotal,
            obs
        };
        state.despesas.push(novaDespesa);
    }

    closeModal('modal-despesa');
    document.getElementById('form-despesa').reset();
    document.getElementById('despesa-id').value = '';
    atualizarTudo();
}

function excluirDespesa(id) {
    const despesa = state.despesas.find(d => d.id === id);
    if (!despesa) return;
    
    if (despesa.paiId) {
        state.despesas = state.despesas.filter(d => d.paiId !== despesa.paiId);
    } else {
        state.despesas = state.despesas.filter(d => d.id !== id);
    }
    atualizarTudo();
}

// --- RECEITAS & FILTRO DE PERÍODO ---
function salvarReceita(e) {
    e.preventDefault();
    const id = document.getElementById('receita-id').value || Date.now().toString();
    const novaReceita = {
        id,
        desc: document.getElementById('receita-desc').value,
        valor: parseFloat(document.getElementById('receita-valor').value),
        categoria: document.getElementById('receita-cat').value,
        data: document.getElementById('receita-data').value,
        conta: document.getElementById('receita-conta').value
    };

    const index = state.receitas.findIndex(r => r.id === id);
    if (index >= 0) state.receitas[index] = novaReceita;
    else state.receitas.push(novaReceita);

    closeModal('modal-receita');
    document.getElementById('form-receita').reset();
    document.getElementById('receita-id').value = '';
    atualizarTudo();
}

function excluirReceita(id) {
    state.receitas = state.receitas.filter(r => r.id !== id);
    atualizarTudo();
}

function aplicarFiltroReceitas() {
    filtroReceitasInicio = document.getElementById('receitas-data-inicio').value;
    filtroReceitasFim = document.getElementById('receitas-data-fim').value;
    renderizarReceitas();
}

function limparFiltroReceitas() {
    document.getElementById('receitas-data-inicio').value = '';
    document.getElementById('receitas-data-fim').value = '';
    filtroReceitasInicio = null;
    filtroReceitasFim = null;
    renderizarReceitas();
}

function renderizarReceitas() {
    const tbody = document.querySelector('#tabela-geral-receitas tbody');
    tbody.innerHTML = '';

    const receitasFiltradas = state.receitas.filter(r => {
        if (!filtroReceitasInicio && !filtroReceitasFim) return true;
        const dataR = r.data;
        if (filtroReceitasInicio && dataR < filtroReceitasInicio) return false;
        if (filtroReceitasFim && dataR > filtroReceitasFim) return false;
        return true;
    });

    receitasFiltradas.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.desc}</td>
            <td>${r.categoria}</td>
            <td style="color: var(--green);">${formatarMoeda(r.valor)}</td>
            <td>${formatarData(r.data)}</td>
            <td>${r.conta}</td>
            <td>
                <button class="btn-danger" style="padding: 6px 10px; font-size: 0.8rem;" onclick="excluirReceita('${r.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- CARTÕES & LIMITES & EDIÇÃO ---
function salvarCartao(e) {
    e.preventDefault();
    const id = document.getElementById('cartao-id').value || Date.now().toString();
    const novoCartao = {
        id,
        nome: document.getElementById('cartao-nome').value,
        banco: document.getElementById('cartao-banco').value,
        limite: parseFloat(document.getElementById('cartao-limite').value),
        fechamento: parseInt(document.getElementById('cartao-fechamento').value),
        vencimento: parseInt(document.getElementById('cartao-vencimento').value),
        cor: document.getElementById('cartao-cor').value
    };

    const index = state.cartoes.findIndex(c => c.id === id);
    if (index >= 0) {
        state.cartoes[index] = novoCartao;
    } else {
        state.cartoes.push(novoCartao);
    }

    closeModal('modal-cartao');
    document.getElementById('form-cartao').reset();
    document.getElementById('cartao-id').value = '';
    atualizarTudo();
}

function editarCartao(id) {
    const cartao = state.cartoes.find(c => c.id === id);
    if (!cartao) return;

    document.getElementById('cartao-id').value = cartao.id;
    document.getElementById('cartao-nome').value = cartao.nome;
    document.getElementById('cartao-banco').value = cartao.banco;
    document.getElementById('cartao-limite').value = cartao.limite;
    document.getElementById('cartao-fechamento').value = cartao.fechamento;
    document.getElementById('cartao-vencimento').value = cartao.vencimento;
    document.getElementById('cartao-cor').value = cartao.cor;

    document.getElementById('modal-cartao-titulo').innerText = 'Editar Cartão de Crédito';
    openModal('modal-cartao');
}

function excluirCartao(id) {
    state.cartoes = state.cartoes.filter(c => c.id !== id);
    state.despesas.forEach(d => { if(d.cartaoId === id) d.cartaoId = null; });
    atualizarTudo();
}

// --- COFRINHOS ---
function salvarCofrinho(e) {
    e.preventDefault();
    const id = document.getElementById('cofrinho-id').value || Date.now().toString();
    const novoCof = {
        id,
        nome: document.getElementById('cofrinho-nome').value,
        alvo: parseFloat(document.getElementById('cofrinho-alvo').value),
        guardado: 0,
        prazo: document.getElementById('cofrinho-prazo').value
    };

    const index = state.cofrinhos.findIndex(c => c.id === id);
    if (index >= 0) {
        novoCof.guardado = state.cofrinhos[index].guardado;
        state.cofrinhos[index] = novoCof;
    } else {
        state.cofrinhos.push(novoCof);
    }

    closeModal('modal-cofrinho');
    document.getElementById('form-cofrinho').reset();
    document.getElementById('cofrinho-id').value = '';
    atualizarTudo();
}

function abrirMovCofrinho(id, tipo) {
    document.getElementById('mov-cofrinho-id').value = id;
    document.getElementById('mov-cofrinho-tipo').value = tipo;
    document.getElementById('titulo-mov-cofrinho').innerText = tipo === 'add' ? 'Adicionar Dinheiro ao Cofrinho' : 'Retirar Dinheiro do Cofrinho';
    openModal('modal-mov-cofrinho');
}

function salvarMovCofrinho(e) {
    e.preventDefault();
    const id = document.getElementById('mov-cofrinho-id').value;
    const tipo = document.getElementById('mov-cofrinho-tipo').value;
    const valor = parseFloat(document.getElementById('mov-cofrinho-valor').value);

    const cof = state.cofrinhos.find(c => c.id === id);
    if (cof) {
        if (tipo === 'add') cof.guardado += valor;
        else {
            if (valor > cof.guardado) { alert('Valor superior ao guardado!'); return; }
            cof.guardado -= valor;
        }
    }
    closeModal('modal-mov-cofrinho');
    document.getElementById('form-mov-cofrinho').reset();
    atualizarTudo();
}

function excluirCofrinho(id) {
    state.cofrinhos = state.cofrinhos.filter(c => c.id !== id);
    atualizarTudo();
}

// --- RENDERIZAÇÃO & DASHBOARD COM FILTRO DE PERÍODO ---
function aplicarFiltroResumo() {
    filtroResumoInicio = document.getElementById('resumo-data-inicio').value;
    filtroResumoFim = document.getElementById('resumo-data-fim').value;
    atualizarDashboard();
}

function limparFiltroResumo() {
    document.getElementById('resumo-data-inicio').value = '';
    document.getElementById('resumo-data-fim').value = '';
    filtroResumoInicio = null;
    filtroResumoFim = null;
    atualizarDashboard();
}

function atualizarDashboard() {
    // Filtrar Receitas pelo Período se definido
    const receitasFiltradas = state.receitas.filter(r => {
        if (!filtroResumoInicio && !filtroResumoFim) return true;
        if (filtroResumoInicio && r.data < filtroResumoInicio) return false;
        if (filtroResumoFim && r.data > filtroResumoFim) return false;
        return true;
    });
    const totalReceitas = receitasFiltradas.reduce((acc, r) => acc + r.valor, 0);
    
    // Filtrar Despesas pelo Período se definido, senão mês atual por padrão
    let despesasFiltradas = state.despesas;
    if (filtroResumoInicio || filtroResumoFim) {
        despesasFiltradas = state.despesas.filter(d => {
            if (filtroResumoInicio && d.data < filtroResumoInicio) return false;
            if (filtroResumoFim && d.data > filtroResumoFim) return false;
            return true;
        });
    } else {
        const mesAtual = new Date().toISOString().slice(0, 7);
        despesasFiltradas = state.despesas.filter(d => d.data.startsWith(mesAtual));
    }

    const totalDespesas = despesasFiltradas.reduce((acc, d) => acc + d.valor, 0);
    const saldo = totalReceitas - totalDespesas;
    const totalCofrinhos = state.cofrinhos.reduce((acc, c) => acc + c.guardado, 0);

    // Faturas de cartões no período/mês
    let totalCartoesVal = 0;
    state.cartoes.forEach(cartao => {
        const gastosCartao = despesasFiltradas
            .filter(d => d.cartaoId === cartao.id)
            .reduce((acc, d) => acc + d.valor, 0);
        totalCartoesVal += gastosCartao;
    });

    document.getElementById('resumo-saldo').innerText = formatarMoeda(saldo);
    document.getElementById('resumo-receitas').innerText = formatarMoeda(totalReceitas);
    document.getElementById('resumo-despesas').innerText = formatarMoeda(totalDespesas);
    document.getElementById('resumo-economia').innerText = formatarMoeda(saldo > 0 ? saldo : 0);
    document.getElementById('resumo-cartoes-val').innerText = formatarMoeda(totalCartoesVal);
    document.getElementById('resumo-cofrinhos-val').innerText = formatarMoeda(totalCofrinhos);

    // Tabela Despesas/Movimentações no Dashboard
    const tbody = document.querySelector('#table-despesas-mes tbody');
    tbody.innerHTML = '';
    despesasFiltradas.forEach(d => {
        const cartaoObj = state.cartoes.find(c => c.id === d.cartaoId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.desc}</td>
            <td>${d.categoria}</td>
            <td style="color: var(--red);">${formatarMoeda(d.valor)}</td>
            <td>${formatarData(d.data)}</td>
            <td>${cartaoObj ? `<i class="fa-solid fa-credit-card"></i> ${cartaoObj.nome}` : d.formaPagamento}</td>
        `;
        tbody.appendChild(tr);
    });

    // Resumo Cartões no Dashboard
    const listaCartoesResumo = document.getElementById('resumo-cartoes-lista');
    listaCartoesResumo.innerHTML = '';
    state.cartoes.forEach(cartao => {
        const utilizado = state.despesas
            .filter(d => d.cartaoId === cartao.id)
            .reduce((acc, d) => acc + d.valor, 0);
        const disponivel = cartao.limite - utilizado;

        const div = document.createElement('div');
        div.style.cssText = `padding: 12px; border-left: 4px solid ${cartao.cor}; background: var(--bg-main); margin-bottom: 10px; border-radius: 6px;`;
        div.innerHTML = `
            <strong>${cartao.nome}</strong><br>
            <small>Utilizado: ${formatarMoeda(utilizado)} | Disp: ${formatarMoeda(disponivel)}</small>
        `;
        listaCartoesResumo.appendChild(div);
    });

    atualizarGraficos(totalReceitas, totalDespesas, despesasFiltradas, receitasFiltradas);
}

function renderizarDespesas() {
    filtrarDespesas();
}

function filtrarDespesas() {
    const texto = document.getElementById('filtrar-texto').value.toLowerCase();
    const mes = document.getElementById('filtro-mes').value;
    const ano = document.getElementById('filtro-ano').value;
    const cat = document.getElementById('filtro-categoria').value;

    const filtradas = state.despesas.filter(d => {
        const matchTexto = d.desc.toLowerCase().includes(texto);
        const matchMes = mes ? d.data.split('-')[1] === mes : true;
        const matchAno = ano ? d.data.split('-')[0] === ano : true;
        const matchCat = cat ? d.categoria === cat : true;
        return matchTexto && matchMes && matchAno && matchCat;
    });

    const tbody = document.querySelector('#tabela-geral-despesas tbody');
    tbody.innerHTML = '';
    filtradas.forEach(d => {
        const cartaoObj = state.cartoes.find(c => c.id === d.cartaoId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.desc}</td>
            <td>${d.categoria}</td>
            <td style="color: var(--red);">${formatarMoeda(d.valor)}</td>
            <td>${formatarData(d.data)}</td>
            <td>${d.formaPagamento}</td>
            <td>${cartaoObj ? cartaoObj.nome : '-'}</td>
            <td>
                <button class="btn-danger" style="padding: 6px 10px; font-size: 0.8rem;" onclick="excluirDespesa('${d.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function limparFiltrosDespesas() {
    document.getElementById('filtrar-texto').value = '';
    document.getElementById('filtro-mes').value = '';
    document.getElementById('filtro-ano').value = '';
    document.getElementById('filtro-categoria').value = '';
    filtrarDespesas();
}

function renderizarCartoes() {
    const grid = document.getElementById('cartoes-grid');
    grid.innerHTML = '';
    state.cartoes.forEach(cartao => {
        const utilizado = state.despesas
            .filter(d => d.cartaoId === cartao.id)
            .reduce((acc, d) => acc + d.valor, 0);
        const disponivel = cartao.limite - utilizado;

        const card = document.createElement('div');
        card.className = 'credit-card-ui';
        card.style.backgroundColor = cartao.cor;
        card.innerHTML = `
            <div class="card-top">
                <span>${cartao.nome}</span>
                <div>
                    <button onclick="editarCartao('${cartao.id}')" style="background:none; border:none; color:white; cursor:pointer; margin-right: 8px;"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="excluirCartao('${cartao.id}')" style="background:none; border:none; color:white; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="card-limits">
                <div>Limite: <strong>${formatarMoeda(cartao.limite)}</strong></div>
                <div>Utilizado: <strong>${formatarMoeda(utilizado)}</strong></div>
            </div>
            <div class="card-bottom">
                <div>Disponível: <strong>${formatarMoeda(disponivel)}</strong></div>
                <div>Fechamento: Dia ${cartao.fechamento}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderizarCofrinhos() {
    const grid = document.getElementById('cofrinhos-grid');
    grid.innerHTML = '';
    state.cofrinhos.forEach(cof => {
        const restante = Math.max(0, cof.alvo - cof.guardado);
        const percentual = Math.min(100, (cof.guardado / cof.alvo) * 100).toFixed(2);

        const div = document.createElement('div');
        div.className = 'cofrinho-card';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4>${cof.nome}</h4>
                <button class="btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="excluirCofrinho('${cof.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div style="margin: 14px 0; font-size: 0.9rem;">
                <div>Alvo: <strong>${formatarMoeda(cof.alvo)}</strong></div>
                <div>Guardado: <strong style="color:var(--green);">${formatarMoeda(cof.guardado)}</strong></div>
                <div>Restante: <strong>${formatarMoeda(restante)}</strong></div>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${percentual}%;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.85rem;">
                <span>${percentual}% Concluído</span>
                <div>
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="abrirMovCofrinho('${cof.id}', 'add')">+</button>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="abrirMovCofrinho('${cof.id}', 'sub')">-</button>
                </div>
            </div>
            ${percentual >= 100 ? '<div style="margin-top:10px; color:var(--yellow); font-weight:bold; text-align:center;">🎉 META CONCLUÍDA!</div>' : ''}
        `;
        grid.appendChild(div);
    });
}

// --- GRÁFICOS CHART.JS ---
function atualizarGraficos(totalRec, totalDesp, despesasFiltradas, receitasFiltradas) {
    // 1. Receitas x Despesas
    const ctx1 = document.getElementById('chartRecDesp').getContext('2d');
    if(charts.recDesp) charts.recDesp.destroy();
    charts.recDesp = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{ data: [totalRec, totalDesp], backgroundColor: ['#22c55e', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 2. Gastos por Categoria
    const categorias = {};
    despesasFiltradas.forEach(d => { categorias[d.categoria] = (categorias[d.categoria] || 0) + d.valor; });
    const ctx2 = document.getElementById('chartCategoria').getContext('2d');
    if(charts.categoria) charts.categoria.destroy();
    charts.categoria = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categorias),
            datasets: [{ data: Object.values(categorias), backgroundColor: ['#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#eab308', '#22c55e', '#ef4444', '#14b8a6', '#f97316', '#84cc16'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 3. Evolução das Despesas (Por Mês)
    const mesesMap = {};
    despesasFiltradas.forEach(d => {
        const mesAno = d.data.slice(0, 7);
        mesesMap[mesAno] = (mesesMap[mesAno] || 0) + d.valor;
    });
    const mesesOrdenados = Object.keys(mesesMap).sort();
    const ctx3 = document.getElementById('chartEvolucao').getContext('2d');
    if(charts.evolucao) charts.evolucao.destroy();
    charts.evolucao = new Chart(ctx3, {
        type: 'line',
        data: {
            labels: mesesOrdenados,
            datasets: [{ label: 'Despesas', data: mesesOrdenados.map(m => mesesMap[m]), borderColor: '#6366f1', tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 4. Gastos por Cartão
    const cartoesGastos = {};
    state.cartoes.forEach(c => {
        cartoesGastos[c.nome] = despesasFiltradas.filter(d => d.cartaoId === c.id).reduce((acc, d) => acc + d.valor, 0);
    });
    const ctx4 = document.getElementById('chartCartoes').getContext('2d');
    if(charts.cartoes) charts.cartoes.destroy();
    charts.cartoes = new Chart(ctx4, {
        type: 'bar',
        data: {
            labels: Object.keys(cartoesGastos),
            datasets: [{ label: 'Gasto no Cartão', data: Object.values(cartoesGastos), backgroundColor: state.cartoes.map(c => c.cor) }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// --- UTILITÁRIOS ---
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataStr) {
    if(!dataStr) return '';
    const partes = dataStr.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function limparDadosSistema() {
    if(confirm('Deseja realmente apagar todos os dados do sistema?')) {
        localStorage.clear();
        location.reload();
    }
}