const SERVER_URL = 'http://localhost:3001';

// Escapa HTML para exibir os logs em segurança e preencher opções
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Elementos da interface
const btnRun = document.getElementById('btn-run');
const btnRunCurrent = document.getElementById('btn-run-current');
const btnRunDynamic = document.getElementById('btn-run-dynamic');
const btnDashboard = document.getElementById('btn-dashboard');
const btnStop = document.getElementById('btn-stop');

const serverStatus = document.getElementById('server-status');
const auditStatusRow = document.getElementById('audit-status-row');
const auditStatus = document.getElementById('audit-status');

const logViewContainer = document.getElementById('log-view-container');
const logView = document.getElementById('log-view');

// Inputs do formulário padrão/configurado
const selectSystem = document.getElementById('select-system');

// Inputs do formulário dinâmico
const inputUrl = document.getElementById('input-url');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const inputLoginPath = document.getElementById('input-loginpath');

let loadedProfiles = [];

// Identifica qual sistema está ativo com base na tab aberta
function getActiveSystem() {
  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.getAttribute('data-target') === 'tab-dynamic') {
    return 'dynamic';
  }
  return selectSystem ? selectSystem.value : 'alunopresente';
}

// Carrega os perfis configurados a partir do servidor
async function loadConfiguredProfiles() {
  if (!selectSystem) return;
  try {
    const res = await fetch(`${SERVER_URL}/profiles`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.profiles && data.profiles.length > 0) {
      loadedProfiles = data.profiles;
      selectSystem.innerHTML = data.profiles.map(p => 
        `<option value="${escapeHtml(p.key)}">${escapeHtml(p.name)}</option>`
      ).join('');
    }
  } catch (err) {
    console.warn('Não foi possível carregar os perfis dinâmicos do servidor, usando Aluno Presente como fallback.', err);
    loadedProfiles = [{ key: 'alunopresente', name: 'System Documenter - Aluno Presente', baseUrl: 'https://alunopresente.servicent.com.br' }];
  }
}

// Busca logs em tempo real
async function fetchLogs() {
  const activeSystem = getActiveSystem();
  try {
    const res = await fetch(`${SERVER_URL}/logs?system=${activeSystem}`);
    const data = await res.json();
    if (logView && data.logs && data.logs.length > 0) {
      logView.innerHTML = data.logs.map(line => `<div>${escapeHtml(line)}</div>`).join('');
      logView.scrollTop = logView.scrollHeight; // Auto-scroll
    }
  } catch (err) {}
}

// Verifica o status do servidor local e do processo ativo
async function checkServerStatus() {
  const activeSystem = getActiveSystem();
  try {
    const res = await fetch(`${SERVER_URL}/status?system=${activeSystem}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    
    serverStatus.innerText = 'CONECTADO';
    serverStatus.className = 'badge online';
    
    // Atualiza estados dos botões e painel dependendo se está rodando ou não
    if (data.running) {
      if (btnRun) btnRun.disabled = true;
      if (btnRunCurrent) btnRunCurrent.disabled = true;
      if (btnRunDynamic) btnRunDynamic.disabled = true;
      
      // Desabilitar inputs e seleções enquanto roda
      if (selectSystem) selectSystem.disabled = true;
      if (inputUrl) inputUrl.disabled = true;
      if (inputEmail) inputEmail.disabled = true;
      if (inputPassword) inputPassword.disabled = true;
      if (inputLoginPath) inputLoginPath.disabled = true;
      
      if (auditStatusRow) auditStatusRow.style.display = 'flex';
      if (logViewContainer) logViewContainer.style.display = 'block';
      if (btnStop) btnStop.style.display = 'block';
      if (auditStatus) {
        auditStatus.innerText = 'MAPEANDO...';
        auditStatus.className = 'badge running';
      }
      fetchLogs();
    } else {
      // Liberar botões padrão
      if (btnRun) btnRun.disabled = false;
      if (btnRunCurrent) btnRunCurrent.disabled = false;
      
      // Liberar seletores
      if (selectSystem) selectSystem.disabled = false;
      
      // Liberar formulário dinâmico e validar botão dinâmico
      if (inputUrl) {
        inputUrl.disabled = false;
        if (btnRunDynamic) btnRunDynamic.disabled = !inputUrl.value.trim();
      }
      if (inputEmail) inputEmail.disabled = false;
      if (inputPassword) inputPassword.disabled = false;
      if (inputLoginPath) inputLoginPath.disabled = false;
      
      if (auditStatusRow) auditStatusRow.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';
      if (logViewContainer) {
        logViewContainer.style.display = logView && logView.innerText ? 'block' : 'none';
      }
    }
  } catch (err) {
    if (serverStatus) {
      serverStatus.innerText = 'DESCONECTADO';
      serverStatus.className = 'badge offline';
    }
    if (btnRun) btnRun.disabled = true;
    if (btnRunCurrent) btnRunCurrent.disabled = true;
    if (btnRunDynamic) btnRunDynamic.disabled = true;
    if (btnStop) btnStop.style.display = 'none';
    if (auditStatusRow) auditStatusRow.style.display = 'none';
    if (logViewContainer) logViewContainer.style.display = 'none';
  }
}

// --- CONFIGURAÇÃO DE ABAS (TABS) ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Alterna abas
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Alterna conteúdos das abas
    const target = tab.getAttribute('data-target');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(target).classList.add('active');
    
    // Limpar logs ao alternar
    if (logView) logView.innerHTML = '';
    if (logViewContainer) logViewContainer.style.display = 'none';
    
    // Forçar atualização do status
    checkServerStatus();
  });
});

// Habilitar botão dinâmico apenas se houver URL válida preenchida
inputUrl?.addEventListener('input', () => {
  if (btnRunDynamic) {
    btnRunDynamic.disabled = !inputUrl.value.trim();
  }
});

// --- EXECUÇÃO DO PROCESSO PADRÃO (GERAL) ---
btnRun?.addEventListener('click', async () => {
  try {
    if (btnRun) btnRun.disabled = true;
    if (btnRunCurrent) btnRunCurrent.disabled = true;
    if (auditStatusRow) auditStatusRow.style.display = 'flex';
    
    const system = selectSystem.value;
    
    const res = await fetch(`${SERVER_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system })
    });
    const data = await res.json();
    if (data.error) alert(data.error);
  } catch (err) {
    alert('Erro ao comunicar com o servidor de documentação.');
  }
  checkServerStatus();
});

// --- EXECUÇÃO DO PROCESSO PADRÃO (TELA ATUAL) ---
btnRunCurrent?.addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      alert('Nenhuma aba ativa encontrada.');
      return;
    }
    
    const activeTab = tabs[0];
    if (!activeTab.url) {
      alert('Não é possível ler a URL da aba ativa.');
      return;
    }
    
    const url = new URL(activeTab.url);
    let path = url.pathname;
    
    const system = selectSystem.value;
    const activeProfile = loadedProfiles.find(p => p.key === system);
    let hostnameMatch = false;
    
    if (activeProfile && activeProfile.baseUrl) {
      try {
        const profileUrl = new URL(activeProfile.baseUrl);
        hostnameMatch = url.hostname === profileUrl.hostname;
      } catch (e) {
        hostnameMatch = url.href.includes(activeProfile.baseUrl);
      }
    } else {
      hostnameMatch = url.hostname.includes('alunopresente');
    }
    
    if (!hostnameMatch) {
      const confirmRun = confirm(
        `A aba ativa (${url.hostname}) não parece corresponder ao sistema selecionado (${activeProfile ? activeProfile.name : 'Aluno Presente'}).\n` +
        `Deseja iniciar o mapeamento na tela inicial do sistema mesmo assim?`
      );
      if (!confirmRun) return;
      path = '';
    }
    
    if (btnRun) btnRun.disabled = true;
    if (btnRunCurrent) btnRunCurrent.disabled = true;
    if (auditStatusRow) auditStatusRow.style.display = 'flex';
    
    const urlParam = path ? `?pages=${encodeURIComponent(path)}` : '';
    const res = await fetch(`${SERVER_URL}/run${urlParam}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system })
    });
    const data = await res.json();
    if (data.error) alert(data.error);
  } catch (err) {
    alert('Erro ao tentar mapear a tela atual: ' + err.message);
  }
  checkServerStatus();
});

// --- EXECUÇÃO DO PROCESSO DINÂMICO ---
btnRunDynamic?.addEventListener('click', async () => {
  const baseUrl = inputUrl.value.trim();
  const loginEmail = inputEmail.value.trim();
  const loginPassword = inputPassword.value.trim();
  const loginPath = inputLoginPath.value.trim() || '/login';

  if (!baseUrl) {
    alert('A URL base do sistema é obrigatória.');
    return;
  }

  try {
    if (btnRunDynamic) btnRunDynamic.disabled = true;
    if (inputUrl) inputUrl.disabled = true;
    if (inputEmail) inputEmail.disabled = true;
    if (inputPassword) inputPassword.disabled = true;
    if (inputLoginPath) inputLoginPath.disabled = true;
    
    if (auditStatusRow) auditStatusRow.style.display = 'flex';
    if (logViewContainer) logViewContainer.style.display = 'block';

    const res = await fetch(`${SERVER_URL}/run-dynamic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, loginEmail, loginPassword, loginPath })
    });
    
    const data = await res.json();
    if (data.error) alert(data.error);
  } catch (err) {
    alert('Erro ao iniciar mapeamento dinâmico: ' + err.message);
  }
  checkServerStatus();
});

// --- CANCELAR EXECUÇÃO ---
btnStop?.addEventListener('click', async () => {
  const activeSystem = getActiveSystem();
  try {
    if (btnStop) {
      btnStop.disabled = true;
      btnStop.innerText = '🛑 Cancelando...';
    }
    const res = await fetch(`${SERVER_URL}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: activeSystem })
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
    } else {
      alert(data.message || 'Mapeamento cancelado com sucesso.');
    }
  } catch (err) {
    alert('Erro ao tentar cancelar o mapeamento.');
  } finally {
    if (btnStop) {
      btnStop.disabled = false;
      btnStop.innerText = '🛑 Encerrar Execução Ativa';
    }
    checkServerStatus();
  }
});

// --- ABRIR DASHBOARD ---
btnDashboard?.addEventListener('click', () => {
  const activeSystem = getActiveSystem();
  chrome.tabs.create({ url: `${SERVER_URL}/dashboard?system=${activeSystem}` });
});

// Inicialização
(async () => {
  await loadConfiguredProfiles();
  checkServerStatus();
  setInterval(checkServerStatus, 2000);
})();
