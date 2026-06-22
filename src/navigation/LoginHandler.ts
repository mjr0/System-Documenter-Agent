// ============================================================
// LoginHandler — Login automatizado no sistema Aluno Presente
// ============================================================

import { Page } from 'playwright';
import { config } from '../config/config';
import { SystemProfile } from '../profiles/SystemProfile';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Responsável por realizar o login automatizado no sistema ERP
 * Aluno Presente, tentando múltiplos seletores para garantir
 * compatibilidade com diferentes estruturas de página.
 */
export class LoginHandler {
  // ... rest of selectors remain same ...

  // -------------------------------------------------------
  // Seletores candidatos para cada campo do formulário
  // -------------------------------------------------------

  /** Seletores para o campo de e-mail / usuário (em ordem de prioridade) */
  private static readonly EMAIL_SELECTORS: string[] = [
    "#login-input",
    "input[type='email']",
    "input[name='email']",
    "input[name='username']",
    "input[name='login']",
    "input[id*='email']",
    "input[id*='user']",
    "input[id*='login']",
    "input[type='text']", // fallback: primeiro campo de texto da página
  ];

  /** Seletores para o campo de senha */
  private static readonly PASSWORD_SELECTORS: string[] = [
    "#signin-password",
    "input[type='password']",
    "input[name='password']",
    "input[name='senha']",
    "input[id*='password']",
    "input[id*='senha']",
  ];


  /** Seletores para o botão de envio */
  private static readonly SUBMIT_SELECTORS: string[] = [
    "button[type='submit']",
    "input[type='submit']",
  ];

  /** Textos possíveis no botão de login */
  private static readonly SUBMIT_BUTTON_TEXTS: string[] = [
    'Entrar',
    'Login',
    'Acessar',
    'Sign in',
  ];

  private logger: (msg: string) => void;
  private profile?: SystemProfile;

  constructor(logger?: (msg: string) => void, profile?: SystemProfile) {
    this.logger = logger || ((msg: string) => console.log(msg));
    this.profile = profile;
  }

  private log(msg: string) {
    this.logger(msg);
  }

  private logError(msg: string) {
    this.logger(`❌ [ERROR] ${msg}`);
  }

  private logWarn(msg: string) {
    this.logger(`⚠️ [WARN] ${msg}`);
  }

  private normalizeText(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  // -------------------------------------------------------
  // Métodos públicos
  // -------------------------------------------------------

  /**
   * Realiza o login no sistema.
   * @returns `true` se o login foi bem-sucedido, `false` caso contrário.
   */
  async login(page: Page): Promise<boolean> {
    const statePath = path.resolve(config.reportsDir, 'auth_state.json');
    const baseUrl = this.profile?.baseUrl || config.baseUrl;
    const loginEmail = this.profile?.auth?.loginEmail || config.loginEmail;
    const loginPassword = this.profile?.auth?.loginPassword || config.loginPassword;
    const loginPath = this.profile?.auth?.loginPath || '/login';

    // 1. Tentar reutilizar sessão se o arquivo de estado existir
    if (fs.existsSync(statePath)) {
      try {
        this.log('[LoginHandler] Tentando reutilizar a sessão salva...');
        const firstPagePath = this.profile?.pages[0]?.path || '/';
        const dashboardUrl = `${baseUrl}${firstPagePath}`;
        await page.goto(dashboardUrl, { waitUntil: 'networkidle', timeout: 15000 });
        
        // Se a página não redirecionou para o login, considera logado
        if (!page.url().includes(loginPath)) {
          this.log('✅ [LoginHandler] Sessão reutilizada com sucesso (já autenticado)!');
          return true;
        }
        this.log('[LoginHandler] Sessão antiga expirada. Realizando login comum...');
      } catch (err: any) {
        this.log(`[LoginHandler] Erro ao carregar sessão antiga. Prosseguindo com login comum...`);
      }
    }

    const loginUrl = `${baseUrl}${loginPath}`;

    try {
      let loginSuccess = false;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) {
          this.logWarn(`[LoginHandler] Tentativa de login ${attempt - 1} falhou ou expirou. Aguardando 5 segundos para cooldown antes da tentativa ${attempt}...`);
          await page.waitForTimeout(5000);
        }

        this.log(`[LoginHandler] Navegando para a página de login: ${loginUrl} (Tentativa ${attempt}/2)`);
        await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
        
        // --- Localizar campo de e-mail / usuário ---
        const emailInput = await this.findFirstVisible(page, LoginHandler.EMAIL_SELECTORS);
        if (!emailInput) {
          this.logError('[LoginHandler] Não foi possível encontrar o campo de e-mail/usuário.');
          continue;
        }

        // --- Localizar campo de senha ---
        const passwordInput = await this.findFirstVisible(page, LoginHandler.PASSWORD_SELECTORS);
        if (!passwordInput) {
          this.logError('[LoginHandler] Não foi possível encontrar o campo de senha.');
          continue;
        }

        // --- Preencher os campos ---
        await emailInput.fill(loginEmail);
        await passwordInput.fill(loginPassword);

        // --- Localizar botão de envio ---
        const submitButton = await this.findSubmitButton(page);
        if (!submitButton) {
          this.logError('[LoginHandler] Não foi possível encontrar o botão de envio (submit).');
          continue;
        }

        // --- Clicar e aguardar navegação ---
        this.log('[LoginHandler] Botão de envio encontrado. Clicando...');
        await submitButton.click();
        this.log('[LoginHandler] Botão de envio clicado. Aguardando redirecionamento...');

        // Aguarda a URL mudar (sair da página de login)
        try {
          await page.waitForURL((url) => !url.toString().includes(loginPath), {
            timeout: 120000,
          });
        } catch {
          this.logWarn('[LoginHandler] Timeout aguardando redirecionamento após login.');
        }


        // Espera adicional para a página estabilizar
        await page.waitForTimeout(3000);

        // --- Verificar se ainda está na página de login ---
        if (!this.urlContainsLogin(page)) {
          loginSuccess = true;
          break;
        }
      }

      if (!loginSuccess) {
        this.logError('[LoginHandler] Todas as tentativas de login falharam.');
        return false;
      }

      this.log('[LoginHandler] Login realizado com sucesso!');

      // --- Salvar o estado da sessão para reaproveitamento futuro ---
      try {
        if (!fs.existsSync(path.dirname(statePath))) {
          fs.mkdirSync(path.dirname(statePath), { recursive: true });
        }
        await page.context().storageState({ path: statePath });
        this.log('[LoginHandler] Estado de autenticação salvo com sucesso.');
      } catch (saveStateErr: any) {
        this.logWarn(`[LoginHandler] Alerta: Não foi possível salvar o estado da sessão: ${saveStateErr.message}`);
      }

      // --- Selecionar a Unidade Escolar no Header para carregar os dados ---
      try {
        this.log('[LoginHandler] Procurando dropdown "Escolha a Unidade Escolar"...');
        const dropdownSelectors = [
          'button:has-text("Escolha a Unidade Escolar")',
          'div:has-text("Escolha a Unidade Escolar")',
          '.escolha-unidade',
          'header button',
          '.navbar button'
        ];
        
        let dropdownButton = null;
        const startTime = Date.now();
        while (Date.now() - startTime < 6000) {
          for (const sel of dropdownSelectors) {
            const loc = page.locator(sel).first();
            if (await loc.isVisible().catch(() => false)) {
              dropdownButton = loc;
              break;
            }
          }
          if (dropdownButton) break;
          await page.waitForTimeout(200);
        }

        if (dropdownButton) {
          this.log('[LoginHandler] Dropdown encontrado. Clicando...');
          await dropdownButton.click();
          await page.waitForTimeout(1000);

          const optionSelectors = [
            '.dropdown-menu a',
            '.dropdown-content a',
            '[role="option"]',
            'ul.dropdown-menu li a',
            '.select-items div',
            '.dropdown a',
            'li a'
          ];

          let optionSelected = false;
          for (const optSel of optionSelectors) {
            const options = page.locator(optSel);
            const count = await options.count().catch(() => 0);
            if (count > 0) {
              const firstOpt = options.first();
              if (await firstOpt.isVisible().catch(() => false)) {
                const optText = await firstOpt.innerText().catch(() => '');
                this.log(`[LoginHandler] Clicando na opção de Unidade Escolar: "${optText}"`);
                await firstOpt.click();
                optionSelected = true;
                break;
              }
            }
          }

          if (optionSelected) {
            this.log('[LoginHandler] Unidade Escolar selecionada com sucesso! Aguardando estabilização da rede e dados...');
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
              this.logWarn('[LoginHandler] Rede não estabilizou completamente após seleção da escola (dashboard), prosseguindo...');
            });
            await page.waitForTimeout(2000);
          } else {
            this.logWarn('[LoginHandler] Dropdown aberto, mas nenhum item clicável foi encontrado.');
            await page.click('body').catch(() => {});
          }
        } else {
          this.log('[LoginHandler] Dropdown de Unidade Escolar não foi exibido ou já está selecionado.');
        }
      } catch (err: any) {
        this.logWarn(`[LoginHandler] Alerta: Não foi possível selecionar a Unidade Escolar: ${err.message}`);
      }

      return true;
    } catch (error: any) {
      this.logError(`[LoginHandler] Erro durante o processo de login: ${error.message}`);
      return false;
    }
  }

  /**
   * Seleciona uma unidade escolar específica através do menu suspenso (dropdown) no topo.
   * @param page Instância do Playwright Page
   * @param schoolName Nome completo ou parcial da unidade escolar
   * @returns `true` se selecionado com sucesso, `false` caso contrário.
   */
  async selectSchoolUnit(page: Page, schoolName: string): Promise<boolean> {
    try {
      // 1. Localizar o display da unidade escolar no cabeçalho
      const displaySelectors = [
        '.unidade-escolar-display:visible',
        '.unidade-nome:visible',
        '[title*="selecionar unidade"]:visible',
        'button:has-text("Escolha a Unidade Escolar"):visible',
        'div:has-text("Escolha a Unidade Escolar"):visible',
        'a:has-text("Escolha a Unidade Escolar"):visible',
        'button:has-text("Unidade Escolar"):visible',
        'div:has-text("Unidade Escolar"):visible',
        '.escolha-unidade:visible'
      ];

      let displayBtn = null;
      const startTime = Date.now();
      const timeoutMs = 15000; // 15 segundos de tolerância robusta para Angular e rede lenta
      
      while (Date.now() - startTime < timeoutMs) {
        for (const sel of displaySelectors) {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            displayBtn = loc;
            break;
          }
        }
        if (displayBtn) break;
        await page.waitForTimeout(200);
      }
      
      if (!displayBtn) {
        this.logError(`[LoginHandler] Erro: Nenhum seletor de dropdown de unidade escolar está visível após ${timeoutMs}ms.`);
        return false;
      }

      // Verifica se a escola desejada já está selecionada no botão do cabeçalho
      const currentSelectedText = await displayBtn.innerText().catch(() => '');
      if (currentSelectedText) {
        const normCurrent = this.normalizeText(currentSelectedText);
        const normTarget = this.normalizeText(schoolName);
        if (normCurrent.includes(normTarget)) {
          this.log(`[LoginHandler] A unidade escolar "${schoolName}" já está selecionada no cabeçalho ("${currentSelectedText.trim()}"). Ignorando re-seleção.`);
          return true;
        }
      }

      this.log(`[LoginHandler] Iniciando seleção da unidade escolar: "${schoolName}"`);
      this.log(`[LoginHandler] Clicando no dropdown de escola...`);
      await displayBtn.click();
      
      // 2. Aguardar a exibição do menu de dropdown
      const menuSelectors = [
        '.unidade-dropdown-menu',
        '.dropdown-menu',
        '.dropdown-content',
        '.select-items',
        '.dropdown'
      ];
      
      let menuSelector = '';
      let menu = null;
      const menuStartTime = Date.now();
      while (Date.now() - menuStartTime < 5000) {
        for (const sel of menuSelectors) {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            menuSelector = sel;
            menu = loc;
            break;
          }
        }
        if (menu) break;
        await page.waitForTimeout(200);
      }
      
      if (!menu) {
        this.logError(`[LoginHandler] Erro: Nenhum menu de dropdown de unidade escolar ficou visível.`);
        await page.click('body').catch(() => {});
        return false;
      }
      
      this.log(`[LoginHandler] Menu '${menuSelector}' está visível.`);
      
      // 3. Digitar o nome da escola no input de busca dentro do menu (opcional se não existir)
      const inputSelector = `${menuSelector} input[type="text"]`;
      const searchInput = page.locator(inputSelector).first();
      const hasSearchInput = await searchInput.isVisible().catch(() => false);
      
      if (hasSearchInput) {
        this.log(`[LoginHandler] Preenchendo a busca com "${schoolName}"...`);
        await searchInput.fill(schoolName);
        // Aguardar um breve momento para os resultados serem filtrados
        await page.waitForTimeout(1000);
      } else {
        this.log(`[LoginHandler] Campo de busca não encontrado no menu de dropdown. Buscando item diretamente.`);
      }
      
      // 4. Localizar e clicar no item correspondente com múltiplos candidatos de seletores
      const itemSelectors = [
        `${menuSelector} .dropdown-item`,
        `${menuSelector} a`,
        `${menuSelector} li a`,
        `${menuSelector} li`,
        `${menuSelector} [role="option"]`,
        `${menuSelector} div`
      ];
      
      let dropdownItems = null;
      let count = 0;
      
      for (const itemSel of itemSelectors) {
        const loc = page.locator(itemSel);
        const c = await loc.count().catch(() => 0);
        if (c > 0) {
          dropdownItems = loc;
          count = c;
          this.log(`[LoginHandler] Usando seletor de itens: "${itemSel}" (Encontrados ${count} itens).`);
          break;
        }
      }
      
      if (count === 0 || !dropdownItems) {
        this.logError(`[LoginHandler] Erro: Nenhum item de escola encontrado no menu.`);
        // Se não encontrou, clica no body para fechar o dropdown
        await page.click('body').catch(() => {});
        return false;
      }
      
      const normalizedTarget = this.normalizeText(schoolName);
      for (let i = 0; i < count; i++) {
        const item = dropdownItems.nth(i);
        const itemNameLoc = item.locator('.item-name');
        
        let text = '';
        if (await itemNameLoc.count().catch(() => 0) > 0) {
          text = await itemNameLoc.innerText().catch(() => '');
        } else {
          text = await item.innerText().catch(() => '');
        }
        
        const normalizedText = this.normalizeText(text);
        this.log(`[LoginHandler] Item ${i}: "${text}" (Normalizado: "${normalizedText}")`);
        
        if (normalizedText.includes(normalizedTarget)) {
          this.log(`[LoginHandler] Item correspondente encontrado! Clicando em: "${text}"`);
          await item.click();
          
          // Aguarda o recarregamento de página/dados
          this.log(`[LoginHandler] Aguardando estabilização da rede pós-seleção de escola...`);
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {
            this.logWarn('[LoginHandler] Rede não estabilizou totalmente após selecionar escola, prosseguindo...');
          });
          await page.waitForTimeout(2000);
          return true;
        }
      }
      
      this.logError(`[LoginHandler] Nenhuma escola correspondente a "${schoolName}" encontrada no dropdown.`);
      // Se não encontrou, clica no body para fechar o dropdown
      await page.click('body').catch(() => {});
      return false;
    } catch (err: any) {
      this.logError(`[LoginHandler] Erro ao selecionar a unidade escolar "${schoolName}": ${err.message}`);
      // Tentar clicar no body para fechar o dropdown em caso de falha
      await page.click('body').catch(() => {});
      return false;
    }
  }


  /**
   * Verifica se o usuário está logado, checando se a URL atual
   * NÃO contém "/login".
   */
  async isLoggedIn(page: Page): Promise<boolean> {
    return !this.urlContainsLogin(page);
  }

  // -------------------------------------------------------
  // Métodos privados auxiliares
  // -------------------------------------------------------

  /**
   * Percorre uma lista de seletores e retorna o primeiro elemento
   * visível encontrado na página.
   */
  private async findFirstVisible(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first();
        // Verifica se o elemento está visível (timeout curto)
        if (await element.isVisible({ timeout: 1000 })) {
          return element;
        }
      } catch {
        // Seletor não encontrou nada ou timeout — tenta o próximo
      }
    }
    return null;
  }

  /**
   * Tenta localizar o botão de envio do formulário de login,
   * primeiro por seletores CSS e depois por texto visível.
   */
  private async findSubmitButton(page: Page) {
    // Primeiro tenta pelos seletores padrão
    const bySelector = await this.findFirstVisible(page, LoginHandler.SUBMIT_SELECTORS);
    if (bySelector) return bySelector;

    // Depois tenta por texto do botão
    for (const text of LoginHandler.SUBMIT_BUTTON_TEXTS) {
      try {
        const button = page.getByRole('button', { name: text, exact: false });
        if (await button.isVisible({ timeout: 1000 })) {
          return button;
        }
      } catch {
        // Texto não encontrado — tenta o próximo
      }
    }

    return null;
  }

  /**
   * Retorna `true` se a URL atual da página contém "/login".
   */
  private urlContainsLogin(page: Page): boolean {
    const loginPath = this.profile?.auth?.loginPath || '/login';
    return page.url().includes(loginPath);
  }
}
