import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/config';
import { LoginHandler } from '../navigation/LoginHandler';
import { SystemProfile } from '../profiles/SystemProfile';
import { PageConfig } from '../types/index';
import { PageDocData, BusinessRule, FlowTransition } from '../types/documenter';
import { DocGenerator } from '../report/DocGenerator';
import { PdfGenerator } from '../report/PdfGenerator';

export class DocumenterEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private profile: SystemProfile;
  private pagesDocData: PageDocData[] = [];
  private transitions: FlowTransition[] = [];
  private allBusinessRules: BusinessRule[] = [];
  private logCallback?: (msg: string) => void;
  private isCancelled = false;

  constructor(profile: SystemProfile) {
    this.profile = profile;
  }

  private log(msg: string) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const formattedMsg = `[${timestamp}] ${msg}`;
    console.log(formattedMsg);
    if (this.logCallback) {
      this.logCallback(formattedMsg);
    }
  }

  /**
   * Executa o fluxo de mapeamento e documentação
   */
  async run(
    filterPages?: string[],
    onPageProcessed?: (result: PageDocData) => void,
    onLog?: (msg: string) => void
  ): Promise<string> {
    if (onLog) this.logCallback = onLog;
    this.isCancelled = false;
    this.pagesDocData = [];
    this.transitions = [];
    this.allBusinessRules = [];

    const startedAt = new Date();
    this.log('📘 Iniciando motor do SYSTEM DOCUMENTER...');
    
    try {
      // 1. Iniciar navegador
      this.log('🚀 Inicializando navegador (headless: false para simulações de UI)...');
      this.browser = await chromium.launch({
        headless: config.headed === false ? true : false,
        slowMo: 300
      });

      const statePath = path.resolve(config.reportsDir, 'auth_state.json');
      const options: any = {
        viewport: { width: 1366, height: 768 },
        ignoreHTTPSErrors: true,
        locale: 'pt-BR',
      };
      if (fs.existsSync(statePath)) {
        options.storageState = statePath;
      }

      const context = await this.browser.newContext(options);
      this.page = await context.newPage();

      // 2. Fazer Login
      this.log('🔐 Efetuando login...');
      const loginHandler = new LoginHandler((m) => this.log(`[Login] ${m}`));
      const isLoggedIn = await loginHandler.login(this.page);
      if (!isLoggedIn) {
        throw new Error('Falha na autenticação do sistema.');
      }
      this.log('✅ Login efetuado com sucesso!');

      // Salva estado para futuras execuções
      const reportsDir = path.resolve(config.reportsDir);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      await context.storageState({ path: statePath }).catch(() => {});

      // 3. Obter páginas do escopo
      let scopePages = this.profile.pages || [];
      if (scopePages.length === 0) {
        this.log('🔍 Nenhuma página pré-configurada. Executando descoberta automática...');
        // Navega para base para descobrir links
        await this.page.goto(this.profile.baseUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        // Descoberta simples de links da mesma origem
        const urls = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          return links
            .map(l => l.getAttribute('href') || '')
            .filter(href => href.startsWith('/') && href.length > 1 && !href.includes('logout') && !href.includes('sair'));
        });
        const uniqueUrls = Array.from(new Set(urls));
        scopePages = uniqueUrls.map((url, index) => ({
          path: url,
          name: `Tela Descoberta ${index + 1}`,
          requiresAuth: true
        }));
        this.log(`✅ Descoberta automática concluída: Encontradas ${scopePages.length} páginas.`);
      }

      if (filterPages && filterPages.length > 0) {
        scopePages = scopePages.filter(p =>
          filterPages.some(f => p.path.toLowerCase().includes(f.toLowerCase()) || p.name.toLowerCase().includes(f.toLowerCase()))
        );
        this.log(`📌 Filtrado para ${scopePages.length} páginas de escopo.`);
      }

      // 4. Mapear cada página
      const contextsList = this.profile.contexts?.list || [null];
      let previousPagePath = '/dashboard'; // Começa simulado no dashboard

      for (const contextName of contextsList) {
        if (this.isCancelled) break;

        if (contextName) {
          this.log(`🏫 Aplicando contexto/unidade: "${contextName}"`);
          if (this.profile.contexts?.apply) {
            // Ir para dashboard antes de aplicar contexto
            const firstPath = scopePages[0]?.path || '/';
            await this.page.goto(this.profile.baseUrl + firstPath, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
            await this.profile.contexts.apply(this.page, contextName).catch(() => {});
          }
        }

        for (const pageConfig of scopePages) {
          if (this.isCancelled) break;

          this.log(`📄 Mapeando tela: "${pageConfig.name}" (Rota: ${pageConfig.path})`);
          
          try {
            const url = this.profile.baseUrl + pageConfig.path;
            
            // Registra transição de fluxo (Interactive System Flow Generator)
            this.transitions.push({
              fromPage: previousPagePath,
              toPage: pageConfig.path,
              actionTrigger: `Navegar para ${pageConfig.name}`
            });

            // Navegar para a página
            await this.page.goto(url, { waitUntil: 'load', timeout: pageConfig.timeout || 30000 });
            await this.page.waitForTimeout(2000); // Aguarda rendering Angular/React

            // Executa interações com filtros se existirem (para preencher tela)
            if (this.profile.interactWithFilters) {
              this.log('   Preenchendo filtros de tela para carregar formulários...');
              await this.profile.interactWithFilters(this.page, contextName || '').catch(() => {});
              await this.page.waitForTimeout(1500);
            }

            // Capturar screenshot
            const screenshotFilename = `doc_${pageConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.png`;
            const screenshotPath = path.resolve(config.screenshotsDir, screenshotFilename);
            if (!fs.existsSync(config.screenshotsDir)) {
              fs.mkdirSync(config.screenshotsDir, { recursive: true });
            }
            await this.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

            // Extrair dados básicos da página (inputs, botões, h1)
            const docData = await this.extractPageMetadata(pageConfig.path, pageConfig.name, screenshotFilename);

            // Executa o Business Rule Validation Mapper nesta tela
            this.log('   🔎 Analisando regras de validação e restrições de formulário...');
            const rules = await this.mapBusinessRules(pageConfig.path, pageConfig.name);
            docData.businessRules = rules;
            this.allBusinessRules.push(...rules);

            this.pagesDocData.push(docData);
            
            if (onPageProcessed) {
              onPageProcessed(docData);
            }

            previousPagePath = pageConfig.path;
            this.log(`   ✅ Tela mapeada com sucesso: ${docData.inputs.length} campos, ${docData.buttons.length} botões, ${rules.length} regras.`);
          } catch (pageErr: any) {
            this.log(`   ❌ Erro ao mapear página "${pageConfig.name}": ${pageErr.message}`);
          }
        }
      }

      // 5. Compilar documentação final (Markdown)
      this.log('✍️ Compilando manual técnico Markdown e fluxogramas...');
      const docGenerator = new DocGenerator();
      const docsFilePath = docGenerator.generate(
        this.profile.name,
        this.profile.baseUrl,
        this.pagesDocData,
        this.transitions,
        this.allBusinessRules
      );
      this.log(`📄 Manual Markdown gerado: ${docsFilePath}`);

      // 6. Gerar PDF premium A4
      this.log('📘 Gerando manual técnico em PDF (A4)...');
      try {
        const pdfGenerator = new PdfGenerator();
        const pdfPath = await pdfGenerator.generate(
          this.profile.name,
          this.profile.baseUrl,
          this.pagesDocData,
          this.transitions,
          this.allBusinessRules
        );
        this.log(`✅ Manual PDF gerado com sucesso: ${pdfPath}`);
      } catch (pdfErr: any) {
        this.log(`⚠️ Aviso: Não foi possível gerar o PDF: ${pdfErr.message}`);
      }

      this.log(`🏆 Mapeamento concluído! Documentação completa salva.`);
      return docsFilePath;

    } catch (err: any) {
      this.log(`❌ ERRO CRÍTICO NO MOTOR DE DOCUMENTAÇÃO: ${err.message}`);
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  async cancel() {
    this.isCancelled = true;
    this.log('🛑 Cancelamento solicitado pelo usuário.');
    await this.cleanup();
  }

  private async cleanup() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Extrai dados básicos do DOM (inputs, botões, títulos)
   */
  private async extractPageMetadata(routePath: string, pageName: string, screenshotFilename: string): Promise<PageDocData> {
    if (!this.page) throw new Error('Página não inicializada.');

    const title = await this.page.title().catch(() => '');
    const h1 = await this.page.locator('h1').first().innerText().catch(() => '');
    const description = await this.page.locator('meta[name="description"]').first().getAttribute('content').catch(() => '') || '';

    // Mapeia inputs
    const inputs = await this.page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'));
      return els.map((el: any) => {
        // Encontra label correspondente
        let labelText = '';
        if (el.id) {
          const labelEl = document.querySelector(`label[for="${el.id}"]`);
          if (labelEl) labelText = (labelEl.textContent || '').trim();
        }
        if (!labelText) {
          const parentLabel = el.closest('label');
          if (parentLabel) labelText = (parentLabel.textContent || '').trim();
        }
        if (!labelText) {
          let prev = el.previousElementSibling;
          while (prev) {
            if (['LABEL', 'SPAN', 'STRONG'].includes(prev.tagName) && prev.textContent) {
              labelText = prev.textContent.trim();
              break;
            }
            prev = prev.previousElementSibling;
          }
        }

        // Limpa asteriscos de labels que indicam obrigatório
        labelText = labelText.replace(/\s*\*$/, '').trim();

        // Extrai validações estáticas HTML5
        const htmlRules: string[] = [];
        if (el.hasAttribute('required')) htmlRules.push('required');
        if (el.getAttribute('maxlength')) htmlRules.push(`maxlength: ${el.getAttribute('maxlength')}`);
        if (el.getAttribute('minlength')) htmlRules.push(`minlength: ${el.getAttribute('minlength')}`);
        if (el.getAttribute('min')) htmlRules.push(`min: ${el.getAttribute('min')}`);
        if (el.getAttribute('max')) htmlRules.push(`max: ${el.getAttribute('max')}`);
        if (el.getAttribute('pattern')) htmlRules.push(`pattern: ${el.getAttribute('pattern')}`);

        return {
          label: labelText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || 'Campo sem rótulo',
          type: el.tagName.toLowerCase() === 'input' ? (el.getAttribute('type') || 'text') : el.tagName.toLowerCase(),
          placeholder: el.getAttribute('placeholder') || '',
          name: el.getAttribute('name') || el.id || '',
          validationRules: htmlRules
        };
      });
    });

    // Mapeia botões
    const buttons = await this.page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
      return els.map((el: any) => {
        return {
          text: (el.innerText || el.textContent || el.value || '').trim(),
          type: el.getAttribute('type') || 'button'
        };
      }).filter(b => b.text.length > 0);
    });

    return {
      pageName,
      path: routePath,
      title,
      h1,
      description,
      inputs,
      buttons,
      screenshotFilename
    };
  }

  /**
   * BUSINESS RULE VALIDATION MAPPER
   * Tenta disparar validações no formulário (submetendo vazio) e captura erros no DOM
   */
  private async mapBusinessRules(pagePath: string, pageName: string): Promise<BusinessRule[]> {
    if (!this.page) return [];

    // 1. Mapeia regras estáticas baseadas no HTML5 primeiro
    const staticRules = await this.page.evaluate((args) => {
      const { path: pPath, name: pName } = args;
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
      const rulesList: any[] = [];

      inputs.forEach((el: any) => {
        let labelText = '';
        if (el.id) {
          const labelEl = document.querySelector(`label[for="${el.id}"]`);
          if (labelEl) labelText = (labelEl.textContent || '').trim();
        }
        if (!labelText) {
          const parentLabel = el.closest('label');
          if (parentLabel) labelText = (parentLabel.textContent || '').trim();
        }
        labelText = labelText.replace(/\s*\*$/, '').trim() || el.getAttribute('placeholder') || el.name || el.id || 'Campo';

        if (el.hasAttribute('required')) {
          rulesList.push({
            id: `br_${Math.random().toString(36).substr(2, 9)}`,
            pagePath: pPath,
            pageName: pName,
            fieldName: el.name || el.id || '',
            fieldLabel: labelText,
            validationRule: 'Campo Obrigatório (HTML5 required)',
            triggeredMessage: 'Preencha este campo.'
          });
        }

        const maxL = el.getAttribute('maxlength');
        if (maxL) {
          rulesList.push({
            id: `br_${Math.random().toString(36).substr(2, 9)}`,
            pagePath: pPath,
            pageName: pName,
            fieldName: el.name || el.id || '',
            fieldLabel: labelText,
            validationRule: `Tamanho Máximo: ${maxL} caracteres (HTML5)`,
            triggeredMessage: `O valor deve ter no máximo ${maxL} caracteres.`
          });
        }
      });

      return rulesList;
    }, { path: pagePath, name: pageName });

    // 2. Tenta disparar erros dinâmicos no formulário submetendo-o
    try {
      // Procura botão de salvar / enviar / submeter
      const submitButton = this.page.locator('button[type="submit"], input[type="submit"], button:has-text("Salvar"), button:has-text("Confirmar"), button:has-text("Gravar"), button:has-text("Gerar")').first();
      
      const hasSubmit = await submitButton.isVisible().catch(() => false);
      if (hasSubmit) {
        this.log('     -> Formulário detectado. Clicando em "Salvar" com campos vazios para disparar validações de negócio...');
        
        // Clica no botão (geralmente dispara mensagens de erro no DOM)
        await submitButton.click({ timeout: 4000 }).catch(() => {});
        await this.page.waitForTimeout(1000); // Aguarda renderizar mensagens de erro

        // Captura mensagens de erro no DOM e as associa aos inputs mais próximos
        const dynamicRules = await this.page.evaluate((args) => {
          const { path: pPath, name: pName } = args;
          const rulesList: any[] = [];

          // 1. Captura validações nativas do navegador (HTML5 API)
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')) as HTMLInputElement[];
          inputs.forEach(el => {
            if (el.validationMessage && el.validationMessage.length > 0) {
              let labelText = '';
              if (el.id) {
                const labelEl = document.querySelector(`label[for="${el.id}"]`);
                if (labelEl) labelText = (labelEl.textContent || '').trim();
              }
              if (!labelText) {
                const parentLabel = el.closest('label');
                if (parentLabel) labelText = (parentLabel.textContent || '').trim();
              }
              labelText = labelText.replace(/\s*\*$/, '').trim() || el.getAttribute('placeholder') || el.name || el.id || 'Campo';

              rulesList.push({
                id: `br_dyn_html5_${Math.random().toString(36).substr(2, 9)}`,
                pagePath: pPath,
                pageName: pName,
                fieldName: el.name || el.id || '',
                fieldLabel: labelText,
                validationRule: 'Validação Ativa do Navegador',
                triggeredMessage: el.validationMessage
              });
            }
          });

          // 2. Busca elementos de erro injetados pelo framework/customizados no DOM (.invalid-feedback, .error-message, .alert-danger, etc.)
          const errorSelectors = [
            '.invalid-feedback', 
            '.error-message', 
            '.text-danger', 
            '.alert-danger', 
            '.validation-msg', 
            '[class*="error"]', 
            '[class*="validation"]'
          ];
          
          const errorElements: HTMLElement[] = [];
          errorSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach((el: any) => {
              // Garante que é um elemento visível e possui texto
              if (el.offsetWidth > 0 && el.offsetHeight > 0 && el.textContent && el.textContent.trim().length > 1) {
                // Evita duplicados
                if (!errorElements.includes(el)) {
                  errorElements.push(el);
                }
              }
            });
          });

          // Associa cada mensagem de erro encontrada ao input correspondente por proximidade do DOM
          errorElements.forEach((errEl) => {
            const errorText = errEl.textContent!.trim();
            
            // Busca o input mais próximo desse elemento de erro
            let closestInput: any = null;
            let minDistance = Infinity;

            // Busca inputs vizinhos ou dentro do mesmo container
            const container = errEl.closest('.form-group, .col-md-*, div') || document.body;
            const containerInputs = Array.from(container.querySelectorAll('input:not([type="hidden"]), select, textarea'));
            
            if (containerInputs.length > 0) {
              // Calcula distância no DOM (diferença de posição no array de todos os elementos ou distância visual simples)
              // Usamos coordenadas para achar o mais próximo
              const errRect = errEl.getBoundingClientRect();
              
              containerInputs.forEach((inpEl: any) => {
                const inpRect = inpEl.getBoundingClientRect();
                // Distância euclidiana simples entre os centros
                const dx = (inpRect.left + inpRect.width/2) - (errRect.left + errRect.width/2);
                const dy = (inpRect.top + inpRect.height/2) - (errRect.top + errRect.height/2);
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < minDistance) {
                  minDistance = dist;
                  closestInput = inpEl;
                }
              });
            }

            if (closestInput) {
              let labelText = '';
              if (closestInput.id) {
                const labelEl = document.querySelector(`label[for="${closestInput.id}"]`);
                if (labelEl) labelText = (labelEl.textContent || '').trim();
              }
              if (!labelText) {
                const parentLabel = closestInput.closest('label');
                if (parentLabel) labelText = (parentLabel.textContent || '').trim();
              }
              labelText = labelText.replace(/\s*\*$/, '').trim() || closestInput.getAttribute('placeholder') || closestInput.name || closestInput.id || 'Campo';

              rulesList.push({
                id: `br_dyn_dom_${Math.random().toString(36).substr(2, 9)}`,
                pagePath: pPath,
                pageName: pName,
                fieldName: closestInput.name || closestInput.id || '',
                fieldLabel: labelText,
                validationRule: 'Validação Dinâmica do Sistema',
                triggeredMessage: errorText
              });
            }
          });

          return rulesList;
        }, { path: pagePath, name: pageName });

        // Une as regras removendo duplicadas (mesmo campo e mesma mensagem)
        const combined = [...staticRules];
        dynamicRules.forEach(dRule => {
          const isDup = combined.some(cRule => 
            cRule.fieldName === dRule.fieldName && 
            cRule.triggeredMessage === dRule.triggeredMessage
          );
          if (!isDup) {
            combined.push(dRule);
          }
        });

        return combined;
      }
    } catch (e: any) {
      this.log(`     ⚠️ Erro ao simular submissão do formulário: ${e.message}`);
    }

    return staticRules;
  }

  public getTransitions(): FlowTransition[] {
    return this.transitions;
  }

  public getBusinessRules(): BusinessRule[] {
    return this.allBusinessRules;
  }
}
