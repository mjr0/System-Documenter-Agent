import express from 'express';
import cors from 'cors';
import { DocumenterEngine } from './documenter/DocumenterEngine';
import { config } from './config/config';
import * as path from 'path';
import * as fs from 'fs';
import { chromium, Browser } from 'playwright';
import { LoginHandler } from './navigation/LoginHandler';
import { AlunoPresenteProfile } from './profiles/AlunoPresenteProfile';
import { SystemProfile } from './profiles/SystemProfile';
import { PageDocData, FlowTransition } from './types/documenter';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Configura para que as execuções iniciadas via servidor/extensão sejam headless por padrão
config.headed = false;

interface SystemRunState {
  isRunning: boolean;
  logBuffer: string[];
  pageResults: PageDocData[];
  transitions: FlowTransition[];
  activeReplayBrowser: Browser | null;
  activeEngine?: DocumenterEngine | null;
}

const systemStates = new Map<string, SystemRunState>();

const profiles: { [key: string]: SystemProfile } = {};
const profilesPath = path.resolve(__dirname, '../profiles.json');

// Função auxiliar para carregar perfis do profiles.json
function loadProfiles() {
  const savedDynamic = profiles['dynamic'];
  for (const key in profiles) {
    if (key !== 'dynamic') delete profiles[key];
  }
  
  if (fs.existsSync(profilesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
      for (const key in data) {
        const lowerKey = key.toLowerCase();
        profiles[lowerKey] = {
          name: data[key].name || key,
          baseUrl: data[key].baseUrl,
          allowRegistrations: data[key].allowRegistrations ?? false,
          generateDocumentation: data[key].generateDocumentation ?? false,
          auth: {
            loginPath: data[key].loginPath || '/login',
            loginEmail: data[key].loginEmail || '',
            loginPassword: data[key].loginPassword || ''
          },
          pages: data[key].pages || [],
          contexts: data[key].contexts ? {
            ...data[key].contexts,
            apply: lowerKey === 'alunopresente' ? AlunoPresenteProfile.contexts?.apply : undefined
          } : undefined,
          interactWithFilters: lowerKey === 'alunopresente' ? AlunoPresenteProfile.interactWithFilters : undefined,
          rules: data[key].rules || [],
          discoveredTables: data[key].discoveredTables || []
        };
      }
      console.log(`[Servidor] Perfis carregados com sucesso do profiles.json: ${Object.keys(profiles).filter(k => k !== 'dynamic').join(', ')}`);
    } catch (e: any) {
      console.error('[Servidor] Erro ao analisar profiles.json, usando AlunoPresente como fallback:', e.message);
      profiles['alunopresente'] = AlunoPresenteProfile;
    }
  } else {
    profiles['alunopresente'] = AlunoPresenteProfile;
  }
  
  if (savedDynamic) {
    profiles['dynamic'] = savedDynamic;
  }
}

// Salva as regras e flags de volta no profiles.json
function saveProfilesToJson() {
  if (!fs.existsSync(profilesPath)) return;
  try {
    const rawData = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    for (const key in rawData) {
      const lowerKey = key.toLowerCase();
      if (profiles[lowerKey]) {
        rawData[key].allowRegistrations = profiles[lowerKey].allowRegistrations;
        rawData[key].generateDocumentation = profiles[lowerKey].generateDocumentation;
        rawData[key].rules = profiles[lowerKey].rules;
        rawData[key].discoveredTables = profiles[lowerKey].discoveredTables;
      }
    }
    fs.writeFileSync(profilesPath, JSON.stringify(rawData, null, 2), 'utf-8');
    console.log('[Servidor] profiles.json atualizado com sucesso.');
  } catch (err: any) {
    console.error('[Servidor] Erro ao salvar profiles.json:', err.message);
  }
}

// Carregar inicialmente
loadProfiles();

function getProfile(systemName: string): SystemProfile {
  return profiles[systemName.toLowerCase()] || AlunoPresenteProfile;
}

function getSystemState(systemName: string): SystemRunState {
  const key = systemName.toLowerCase();
  let state = systemStates.get(key);
  if (!state) {
    state = {
      isRunning: false,
      logBuffer: [],
      pageResults: [],
      transitions: [],
      activeReplayBrowser: null,
      activeEngine: null
    };
    systemStates.set(key, state);
  }
  return state;
}

/**
 * Rota para verificar se o servidor está ativo
 */
app.get('/status', (req, res) => {
  const system = (req.query.system as string) || 'alunopresente';
  const profile = getProfile(system);
  const state = getSystemState(system);
  res.json({
    status: 'online',
    running: state.isRunning,
    baseUrl: profile.baseUrl,
    systemName: profile.name,
    pages: profile.pages || [],
    discoveredTables: profile.discoveredTables || []
  });
});

/**
 * Rota para retornar a lista de sistemas/perfis configurados
 */
app.get('/profiles', (req, res) => {
  loadProfiles();
  const list = Object.keys(profiles)
    .filter(key => key !== 'dynamic')
    .map(key => ({
      key: key,
      name: profiles[key].name,
      baseUrl: profiles[key].baseUrl
    }));
  res.json({ profiles: list });
});

/**
 * Rota para baixar arquivos de especificação técnica gerados (.md)
 */
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  // Validar nome para evitar path traversal (apenas letras, números, hífen, underline e ponto)
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
    return res.status(400).send('Nome de arquivo inválido.');
  }
  const filePath = path.resolve(__dirname, '../', filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Arquivo não encontrado.');
  }
});

/**
 * Rota para listar documentos gerados (PDFs e Markdowns)
 */
app.get('/reports', (req, res) => {
  const reportsDir = path.resolve(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    return res.json({ files: [] });
  }
  try {
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.endsWith('.pdf') || f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(reportsDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          type: f.endsWith('.pdf') ? 'pdf' : 'markdown',
          downloadUrl: `/download/reports/${f}`
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar relatórios: ' + err.message });
  }
});

/**
 * Rota para baixar arquivos da pasta reports/
 */
app.get('/download/reports/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
    return res.status(400).send('Nome de arquivo inválido.');
  }
  const filePath = path.resolve(__dirname, '../reports', filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Arquivo não encontrado.');
  }
});

/**
 * Rota para obter as regras de integridade de um sistema
 */
app.get('/rules', (req, res) => {
  const system = (req.query.system as string) || 'alunopresente';
  loadProfiles();
  const profile = getProfile(system);
  res.json({ rules: profile.rules || [] });
});

/**
 * Rota para salvar ou atualizar uma regra
 */
app.post('/rules', (req, res) => {
  const { system, rule } = req.body || {};
  const systemName = system || 'alunopresente';
  
  if (!rule || !rule.pagePath || !rule.conditionColumn || !rule.verifyColumn) {
    return res.status(400).json({ error: 'Dados da regra incompletos.' });
  }

  loadProfiles();
  const profile = getProfile(systemName);
  
  if (!profile.rules) {
    profile.rules = [];
  }

  const existingIndex = profile.rules.findIndex(r => r.id === rule.id);
  if (existingIndex !== -1) {
    profile.rules[existingIndex] = rule;
  } else {
    if (!rule.id) {
      rule.id = 'rule_' + Math.random().toString(36).substr(2, 9);
    }
    profile.rules.push(rule);
  }

  saveProfilesToJson();
  res.json({ success: true, rule });
});

/**
 * Rota para excluir uma regra por ID
 */
app.delete('/rules/:id', (req, res) => {
  const { id } = req.params;
  const system = (req.query.system as string) || 'alunopresente';

  loadProfiles();
  const profile = getProfile(system);

  if (!profile.rules) {
    profile.rules = [];
  }

  const initialCount = profile.rules.length;
  profile.rules = profile.rules.filter(r => r.id !== id);

  if (profile.rules.length !== initialCount) {
    saveProfilesToJson();
    res.json({ success: true, message: 'Regra excluída com sucesso.' });
  } else {
    res.status(404).json({ error: 'Regra não encontrada.' });
  }
});

/**
 * Rota para importar regras a partir de um Git Card (URL de issue do GitHub/GitLab)
 */
app.post('/import-git-card', async (req, res) => {
  const { system, url } = req.body || {};
  const systemName = system || 'alunopresente';

  if (!url) {
    return res.status(400).json({ error: 'URL do Git Card é obrigatória.' });
  }

  loadProfiles();
  const profile = getProfile(systemName);

  let browser;
  try {
    console.log(`[Servidor] Acessando Git Card URL: ${url}...`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Extrair corpo da descrição do card
    const cardContent = await page.evaluate(() => {
      // GitHub
      const ghBody = document.querySelector('.comment-body');
      if (ghBody) return (ghBody.textContent || '').trim();
      
      // GitLab
      const glBody = document.querySelector('.description .md');
      if (glBody) return (glBody.textContent || '').trim();
      
      // Markdown-body general
      const mdBody = document.querySelector('.markdown-body');
      if (mdBody) return (mdBody.textContent || '').trim();
      
      // Main text
      const main = document.querySelector('main') || document.body;
      return (main.textContent || '').trim();
    });

    console.log(`[Servidor] Conteúdo extraído do Git Card (${cardContent.length} caracteres).`);

    const feedbackList: string[] = [];
    const parsedRules: any[] = [];
    const matchedPages: string[] = [];

    // 1. Detectar páginas mencionadas no texto
    const profilePages = profile.pages || [];
    for (const p of profilePages) {
      if (cardContent.toLowerCase().includes(p.path.toLowerCase()) || cardContent.toLowerCase().includes(p.name.toLowerCase())) {
        if (!matchedPages.includes(p.path)) {
          matchedPages.push(p.path);
        }
      }
    }

    // Se nenhuma página bater, tenta achar rotas genéricas por regex
    if (matchedPages.length === 0) {
      const pathRegex = /\/[a-zA-Z0-9_\-]{2,}(?:\/[a-zA-Z0-9_\-]+)*/g;
      const matches = cardContent.match(pathRegex) || [];
      for (const m of matches) {
        if (!m.includes('http') && m.length > 3 && !matchedPages.includes(m)) {
          matchedPages.push(m);
        }
      }
    }

    if (matchedPages.length === 0) {
      feedbackList.push('⚠️ Não foi possível identificar nenhuma tela/rota do ERP na descrição do card. Maneira correta: cite o caminho relativo (ex: `/mapa/acompanhamento-operacional`).');
    }

    // 2. Extrair regras linha por linha
    const lines = cardContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const norm = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    for (const line of lines) {
      const normLine = norm(line);
      if (normLine.includes('se ') || normLine.includes('verifique') || normLine.includes('validar')) {
        let condCol = '';
        let condOp = 'equals';
        let condVal = '';
        let verCol = '';
        let verOp = 'not_empty';
        let verVal = '';

        // Tentar achar colunas conhecidas na rota atual
        let pageColumns: string[] = [];
        if (matchedPages.length > 0) {
          const discovered = profile.discoveredTables || [];
          const matchTable = discovered.find(t => t.pagePath.toLowerCase() === matchedPages[0].toLowerCase());
          if (matchTable) {
            pageColumns = matchTable.columns;
          }
        }

        if (pageColumns.length > 0) {
          const sortedCols = [...pageColumns].sort((a, b) => b.length - a.length);
          const matchedCols: any[] = [];
          
          sortedCols.forEach(col => {
            const idx = normLine.indexOf(norm(col));
            if (idx !== -1) {
              matchedCols.push({ col, index: idx, length: col.length });
            }
          });
          
          matchedCols.sort((a, b) => a.index - b.index);
          
          if (matchedCols.length >= 2) {
            condCol = matchedCols[0].col;
            verCol = matchedCols[1].col;
            
            const condColEnd = matchedCols[0].index + matchedCols[0].length;
            const verColStart = matchedCols[1].index;
            const between = normLine.substring(condColEnd, verColStart);
            
            let cleanedVal = between
              .replace(/\bse\b/g, '')
              .replace(/\bfor\b/g, '')
              .replace(/\bigual\b/g, '')
              .replace(/\ba\b/g, '')
              .replace(/\bcomo\b/g, '')
              .replace(/=/g, '')
              .replace(/\bseja\b/g, '')
              .replace(/,/g, '')
              .trim();
              
            if (cleanedVal) {
              condVal = cleanedVal;
            }
            
            if (between.includes('diferente') || between.includes('!=') || between.includes('nao seja') || between.includes('nao for')) {
              condOp = 'not_equals';
            } else if (between.includes('contem') || between.includes('contiver')) {
              condOp = 'contains';
            } else if (between.includes('vazio') || between.includes('vazia') || between.includes('nulo')) {
              condOp = 'is_empty';
              condVal = '';
            } else if (between.includes('preenchido') || between.includes('nao vazia') || between.includes('nao vazio')) {
              condOp = 'not_empty';
              condVal = '';
            }
            
            const afterVer = normLine.substring(verColStart + matchedCols[1].length);
            if (afterVer.includes('vazio') || afterVer.includes('vazia') || afterVer.includes('nulo') || afterVer.includes('nula') || afterVer.includes('deve ser vazia') || afterVer.includes('deve estar vazia')) {
              verOp = 'is_empty';
            } else if (afterVer.includes('preenchido') || afterVer.includes('preenchida') || afterVer.includes('nao vazia') || afterVer.includes('nao vazio') || afterVer.includes('nao pode ser vazia') || afterVer.includes('nao pode estar vazia')) {
              verOp = 'not_empty';
            } else {
              const equalMatch = afterVer.match(/(?:igual a|deve ser|for|=)\s*([^\s,]+)/);
              if (equalMatch) {
                verOp = 'equals';
                verVal = equalMatch[1];
              }
            }
          }
        }

        // Regex Fallback
        if (!condCol || !verCol) {
          const regex = /se\s+([^=!\s]+)\s*(=|!=|contem)\s*([^,]+),\s*entao\s+([^\s]+)\s*(=|!=|contem|vazia|nao vazia)\s*(.*)/i;
          const match = line.match(regex);
          if (match) {
            condCol = match[1].trim();
            condOp = match[2] === '!=' ? 'not_equals' : (match[2].includes('contem') ? 'contains' : 'equals');
            condVal = match[3].trim();
            verCol = match[4].trim();
            
            const rawVerOp = match[5].trim().toLowerCase();
            if (rawVerOp === '!=') verOp = 'not_equals';
            else if (rawVerOp.includes('contem')) verOp = 'contains';
            else if (rawVerOp.includes('nao vazia') || rawVerOp.includes('nao_vazia')) verOp = 'not_empty';
            else if (rawVerOp.includes('vazia')) verOp = 'is_empty';
            
            verVal = (match[6] || '').trim();
          }
        }

        if (condCol && verCol && matchedPages.length > 0) {
          const rule = {
            id: 'rule_git_' + Math.random().toString(36).substr(2, 9),
            pagePath: matchedPages[0],
            conditionColumn: condCol,
            conditionOperator: condOp,
            conditionValue: condVal,
            verifyColumn: verCol,
            verifyOperator: verOp,
            verifyValue: verVal || undefined,
            errorMessage: `Divergência de dados importada do Git: Se a coluna "${condCol}" for "${condVal}", a coluna "${verCol}" não deveria estar inválida.`,
            severity: 'warning'
          };
          
          parsedRules.push(rule);
        }
      }
    }

    if (matchedPages.length > 0 && parsedRules.length === 0) {
      feedbackList.push('⚠️ Identificamos a rota, mas não conseguimos estruturar as regras de integridade do texto. Maneira correta: "Se Status = Ativo, então Latitude não pode ser vazia".');
    }

    if (parsedRules.length > 0) {
      if (!profile.rules) {
        profile.rules = [];
      }
      for (const rule of parsedRules) {
        const dup = profile.rules.some(r => 
          r.pagePath === rule.pagePath && 
          r.conditionColumn === rule.conditionColumn && 
          r.verifyColumn === rule.verifyColumn
        );
        if (!dup) {
          profile.rules.push(rule);
        }
      }
      saveProfilesToJson();
      feedbackList.push(`✅ Sucesso: ${parsedRules.length} regra(s) de integridade importada(s) e ativada(s) para a rota "${matchedPages[0]}".`);
    }

    // Gerar sugestão de reescrita 100% correta
    let suggestion = '';
    const suggestedPage = matchedPages[0] || '/mapa/acompanhamento-operacional';
    const suggestedCondCol = parsedRules[0]?.conditionColumn || 'Status';
    const suggestedCondVal = parsedRules[0]?.conditionValue || 'Ativo';
    const suggestedVerCol = parsedRules[0]?.verifyColumn || 'Latitude';
    const suggestedVerOp = parsedRules[0]?.verifyOperator || 'not_empty';
    
    const suggestedVerOpText = suggestedVerOp === 'not_empty' ? 'não pode ser vazia' : 
                               suggestedVerOp === 'is_empty' ? 'deve ser vazia' : `deve ser igual a "${parsedRules[0]?.verifyValue || 'Ativo'}"`;

    suggestion = `### 🕵️ Especificação de Teste Automático (100% Correta)
- **Tela / Rota**: \`${suggestedPage}\`
- **Regra**: Se a coluna \`${suggestedCondCol}\` for igual a \`${suggestedCondVal}\`, então a coluna \`${suggestedVerCol}\` ${suggestedVerOpText}.`;

    res.json({
      success: true,
      rules: parsedRules,
      feedbacks: feedbackList,
      suggestion: suggestion,
      matchedPages
    });

  } catch (err: any) {
    console.error('[Servidor] Erro ao ler Git Card via Playwright:', err.message);
    res.status(500).json({ error: 'Falha ao acessar ou analisar o Git Card. Certifique-se de que a URL é pública ou acessível.' });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

// Servir screenshots de forma estática para exibição no painel
app.use('/screenshots', express.static(config.screenshotsDir));

/**
 * Rota para servir a tela do DevTools do Auditor (interface de logs e erros)
 */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../src/public/dashboard.html'));
});

/**
 * Rota para retornar as linhas de log acumuladas
 */
app.get('/logs', (req, res) => {
  const system = (req.query.system as string) || 'alunopresente';
  const state = getSystemState(system);
  res.json({ logs: state.logBuffer });
});

/**
 * Rota para retornar os resultados das páginas auditadas e erros em tempo real
 */
app.get('/results', (req, res) => {
  const system = (req.query.system as string) || 'alunopresente';
  const state = getSystemState(system);
  res.json({
    running: state.isRunning,
    pages: state.pageResults,
    transitions: state.transitions || []
  });
});

/**
 * Rota para reproduzir interativamente o cenário de um erro em janela headed
 */
app.post('/replay', async (req, res) => {
  const { path: routePath, school, system } = req.body || {};
  const systemName = system || (req.query.system as string) || 'alunopresente';
  const profile = getProfile(systemName);
  const state = getSystemState(systemName);
  
  if (!routePath) {
    return res.status(400).json({ error: 'Caminho da rota é obrigatório para replicação.' });
  }

  const systemReplayLogPath = path.resolve(config.reportsDir, `replay_log_${systemName}.txt`);

  function logReplay(msg: string) {
    try {
      const dir = path.dirname(systemReplayLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const timestamp = new Date().toISOString();
      fs.appendFileSync(systemReplayLogPath, `[${timestamp}] ${msg}\n`, 'utf-8');
    } catch (e) {
      // ignora erros de escrita do log
    }
    console.log(`[Replay ${systemName}] ${msg}`);
  }

  logReplay(`Solicitação recebida para rota "${routePath}" na escola "${school || 'Padrão'}"`);

  // Se já houver uma janela de replay aberta para esse sistema, fecha a anterior antes de abrir a nova
  if (state.activeReplayBrowser) {
    logReplay('Fechando janela de replay anterior...');
    await state.activeReplayBrowser.close().catch((err) => {
      logReplay(`Erro ao fechar navegador anterior: ${err.message}`);
    });
    state.activeReplayBrowser = null;
  }

  res.json({ message: 'Janela headed aberta para reproduzir os passos do erro!' });

  (async () => {
    try {
      logReplay('Iniciando Chromium headed (headless: false)...');
      state.activeReplayBrowser = await chromium.launch({ 
        headless: false,
        slowMo: 800 
      });
      logReplay('Chromium iniciado com sucesso.');

      const statePath = path.resolve(config.reportsDir, 'auth_state.json');
      const options: any = {
        viewport: { width: 1366, height: 768 },
        ignoreHTTPSErrors: true,
        locale: 'pt-BR',
      };
      if (fs.existsSync(statePath)) {
        logReplay(`Carregando estado de autenticação de: ${statePath}`);
        options.storageState = statePath;
      } else {
        logReplay('Arquivo de estado de autenticação não encontrado. Será necessário fazer login comum.');
      }

      logReplay('Criando novo contexto e página...');
      const context = await state.activeReplayBrowser.newContext(options);
      const page = await context.newPage();

      // Limpar a referência global se o usuário fechar a página manualmente
      page.on('close', () => {
        logReplay('Página fechada pelo usuário.');
        state.activeReplayBrowser = null;
      });

      const loginHandler = new LoginHandler(logReplay);
      logReplay('Executando login...');
      const isLoggedIn = await loginHandler.login(page);
      logReplay(`Login concluído. Status: ${isLoggedIn ? 'Logado' : 'Falha no login'}`);

      if (school && loginHandler.selectSchoolUnit) {
        logReplay(`Selecionando unidade escolar: "${school}"...`);
        const selectSuccess = await loginHandler.selectSchoolUnit(page, school);
        logReplay(`Seleção da escola concluída. Status: ${selectSuccess ? 'Sucesso' : 'Falha'}`);
      }

      logReplay(`Navegando para a rota do erro: ${routePath}...`);
      try {
        await page.goto(profile.baseUrl + routePath, { waitUntil: 'load', timeout: 20000 });
        
        // Aguarda estabilização de rede inicial (não fatal)
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
          logReplay('Aguardando estabilização da rede inicial...');
        });
        
        // Pausa curta para garantir que o Angular bootstrappou e renderizou os elementos na tela
        await page.waitForTimeout(3000);
        
        // Executa interação com os filtros locais da página passando a escola selecionada
        logReplay('Aplicando filtros locais na página...');
        if (profile.interactWithFilters) {
          await profile.interactWithFilters(page, school);
        }
        
        // Pausa adicional para carregar os dados atualizados pós-filtros
        await page.waitForTimeout(2000);
        logReplay('Navegação e filtros aplicados com sucesso!');
      } catch (gotoErr: any) {
        logReplay(`Alerta de navegação/filtros: ${gotoErr.message}. Continuando mesmo assim...`);
      }

    } catch (err: any) {
      logReplay(`ERRO FATAL DURANTE REPLAY: ${err.message}`);
      if (err.stack) {
        logReplay(`Stack trace: ${err.stack}`);
      }
      if (state.activeReplayBrowser) {
        await state.activeReplayBrowser.close().catch(() => {});
        state.activeReplayBrowser = null;
      }
    }
  })();
});

/**
 * Rota para iniciar a varredura
 */
app.post('/run', async (req, res) => {
  const { system, generateDocumentation, allowRegistrations, runUsabilityChecks } = req.body || {};
  const systemName = system || (req.query.system as string) || 'alunopresente';
  
  loadProfiles();
  const profile = getProfile(systemName);

  // Sobrescreve flag de documentação se passado na chamada
  if (generateDocumentation !== undefined) {
    profile.generateDocumentation = generateDocumentation === true || generateDocumentation === 'true';
  } else {
    const genDocQuery = req.query.generateDocumentation;
    if (genDocQuery !== undefined) {
      profile.generateDocumentation = genDocQuery === 'true';
    }
  }

  // Sobrescreve flag de permissão de gravação/cadastro se passado na chamada
  if (allowRegistrations !== undefined) {
    profile.allowRegistrations = allowRegistrations === true || allowRegistrations === 'true';
  } else {
    const allowRegQuery = req.query.allowRegistrations;
    if (allowRegQuery !== undefined) {
      profile.allowRegistrations = allowRegQuery === 'true';
    }
  }

  // Sobrescreve flag de usabilidade se passado na chamada
  if (runUsabilityChecks !== undefined) {
    profile.runUsabilityChecks = runUsabilityChecks === true || runUsabilityChecks === 'true';
  } else {
    const runUsabilityQuery = req.query.runUsabilityChecks;
    if (runUsabilityQuery !== undefined) {
      profile.runUsabilityChecks = runUsabilityQuery === 'true';
    }
  }

  // Configurar variável de ambiente ALLOW_REGISTRATIONS para o safeguard
  process.env.ALLOW_REGISTRATIONS = profile.allowRegistrations ? 'true' : 'false';

  const state = getSystemState(systemName);

  if (state.isRunning) {
    return res.status(400).json({ error: `A documentação já está em execução para o sistema ${systemName}.` });
  }

  // Limpa o buffer de logs e resultados para a nova execução
  state.logBuffer = [];
  state.pageResults = [];
  state.transitions = [];

  state.isRunning = true;
  res.json({ message: `Mapeamento de documentação iniciado para o sistema ${profile.name}!` });

  // Executa em background para não travar a requisição HTTP
  (async () => {
    try {
      console.log(`\n[Servidor] Requisição recebida da extensão. Iniciando documentação para o sistema: ${systemName}...`);
      
      let filterPages: string[] | undefined;
      const pagesParam = req.query.pages as string;
      
      if (pagesParam) {
        filterPages = pagesParam.split(',').map(p => p.trim());
        console.log(`[Servidor] Filtrando páginas solicitadas: ${filterPages.join(', ')}`);
      }

      const engine = new DocumenterEngine(profile);
      state.activeEngine = engine;
      // Executa passando callbacks que atualizam o status de cada página concluída e os logs
      const docPath = await engine.run(
        filterPages,
        (result) => {
          const idx = state.pageResults.findIndex(r => r.pageName === result.pageName);
          if (idx !== -1) {
            state.pageResults[idx] = result;
          } else {
            state.pageResults.push(result);
          }
        },
        (msg) => {
          state.logBuffer.push(msg);
          if (state.logBuffer.length > 2000) state.logBuffer.shift();
        }
      );
      
      state.transitions = engine.getTransitions();
      
      // Copia a documentação gerada para a raiz do projeto como 'documentacao_<systemName>.md'
      const destPath = path.resolve(__dirname, `../documentacao_${systemName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`);
      fs.copyFileSync(docPath, destPath);
      console.log(`[Servidor] Documentação copiada para: ${destPath}`);
      
      // Salva as tabelas e colunas descobertas no profiles.json
      saveProfilesToJson();
      console.log(`[Servidor] Documentação do sistema ${systemName} concluída com sucesso!`);
    } catch (error) {
      console.error(`[Servidor] Erro durante a documentação de ${systemName}:`, error);
    } finally {
      state.activeEngine = null;
      state.isRunning = false;
    }
  })();
});

/**
 * Rota para iniciar a varredura dinâmica em qualquer sistema por URL e credenciais
 */
app.post('/run-dynamic', async (req, res) => {
  const { baseUrl, loginEmail, loginPassword, loginPath, generateDocumentation, allowRegistrations, runUsabilityChecks } = req.body || {};

  if (!baseUrl) {
    return res.status(400).json({ error: 'URL base do sistema é obrigatória.' });
  }

  const systemName = 'dynamic';
  const state = getSystemState(systemName);

  if (state.isRunning) {
    return res.status(400).json({ error: 'Um mapeamento dinâmico já está em execução.' });
  }

  // Limpa o buffer de logs e resultados para a nova execução
  state.logBuffer = [];
  state.pageResults = [];
  state.transitions = [];

  // Criamos o perfil dinâmico em tempo real
  const dynamicProfile: SystemProfile = {
    name: `Mapeamento Dinâmico - ${new URL(baseUrl).hostname}`,
    baseUrl: baseUrl,
    allowRegistrations: allowRegistrations === true || allowRegistrations === 'true',
    generateDocumentation: true, // Sempre verdadeiro no Documenter
    runUsabilityChecks: runUsabilityChecks === true || runUsabilityChecks === 'true',
    auth: {
      loginPath: loginPath || '/login',
      loginEmail: loginEmail || '',
      loginPassword: loginPassword || '',
    },
    pages: [], // Vazia para forçar o crawler a descobrir as páginas automaticamente
  };

  // Configurar variável de ambiente ALLOW_REGISTRATIONS para o safeguard
  process.env.ALLOW_REGISTRATIONS = dynamicProfile.allowRegistrations ? 'true' : 'false';

  // Salva no mapa de perfis para que o status e resultados consigam resolver o nome correto do sistema
  profiles['dynamic'] = dynamicProfile;

  state.isRunning = true;
  res.json({ message: `Mapeamento dinâmico iniciado para ${dynamicProfile.name}!` });

  // Executa em background para não travar a requisição HTTP
  (async () => {
    try {
      console.log(`\n[Servidor] Requisição recebida da extensão. Iniciando documentação dinâmica para: ${baseUrl}...`);
      
      const engine = new DocumenterEngine(dynamicProfile);
      state.activeEngine = engine;
      
      const docPath = await engine.run(
        undefined,
        (result) => {
          const idx = state.pageResults.findIndex(r => r.pageName === result.pageName);
          if (idx !== -1) {
            state.pageResults[idx] = result;
          } else {
            state.pageResults.push(result);
          }
        },
        (msg) => {
          state.logBuffer.push(msg);
          if (state.logBuffer.length > 2000) state.logBuffer.shift();
        }
      );
      
      state.transitions = engine.getTransitions();
      
      const destPath = path.resolve(__dirname, `../documentacao_dynamic.md`);
      fs.copyFileSync(docPath, destPath);
      console.log(`[Servidor] Documentação copiada para: ${destPath}`);
      console.log(`[Servidor] Documentação dinâmica concluída com sucesso!`);
    } catch (error) {
      console.error(`[Servidor] Erro durante a documentação dinâmica:`, error);
    } finally {
      state.activeEngine = null;
      state.isRunning = false;
    }
  })();
});

/**
 * Rota para cancelar uma auditoria ativa
 */
app.post('/stop', async (req, res) => {
  const { system } = req.body || {};
  const systemName = system || (req.query.system as string) || 'alunopresente';
  const state = getSystemState(systemName);

  if (!state.isRunning) {
    return res.status(400).json({ error: 'Nenhuma auditoria em execução para este sistema.' });
  }

  if (state.activeEngine) {
    console.log(`[Servidor] Solicitando cancelamento da auditoria para o sistema: ${systemName}...`);
    await state.activeEngine.cancel();
  }

  state.isRunning = false;
  state.activeEngine = null;
  res.json({ success: true, message: 'Auditoria cancelada com sucesso.' });
});

app.listen(PORT, () => {
  console.log('');
  console.log(`🚀 Servidor do Documentador rodando em http://localhost:${PORT}`);
  console.log('🔌 Conectado e aguardando chamadas da Extensão do Chrome...');
  console.log('🖥️  Acesse a Tela do Documentador (DevTools) em: http://localhost:3001/dashboard');
  console.log('');
});
