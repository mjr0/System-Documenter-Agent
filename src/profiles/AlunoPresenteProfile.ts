import { Page } from 'playwright';
import { SystemProfile } from './SystemProfile';
import { config } from '../config/config';
import { LoginHandler } from '../navigation/LoginHandler';

/**
 * Perfil de Sistema do Aluno Presente.
 * Contém o escopo de páginas, a lista de escolas (contextos)
 * e a lógica específica de filtros locais da tela.
 */
export const AlunoPresenteProfile: SystemProfile = {
  name: 'QA Auditor Agent - Aluno Presente',
  baseUrl: config.baseUrl,

  // Lógica de Autenticação padrão do Aluno Presente
  auth: {
    loginPath: '/login',
    loginEmail: config.loginEmail,
    loginPassword: config.loginPassword,
  },

  // Telas a serem auditadas no Aluno Presente
  pages: [
    { path: '/alunopresente/dashboard-unidadeEscolar', name: 'Dashboard - Unidade Escolar', requiresAuth: true },
    { path: '/alunopresente/dashboard-analise-diaria', name: 'Dashboard - Análise Diária', requiresAuth: true },
    { path: '/alunopresente/dashboard-refeitorio-diario', name: 'Dashboard - Refeitório Diário', requiresAuth: true },
    { path: '/alunopresente/dashboard-secretario', name: 'Dashboard - Visão Secretaria', requiresAuth: true },
    { path: '/alunopresente/dashboard-aluno', name: 'Dashboard - Analítico Aluno', requiresAuth: true },
    { path: '/alunopresente/dashboard-analitico-recorrencia', name: 'Dashboard - Analítico Recorrência', requiresAuth: true },
    { path: '/alunopresente/dashboard-analitico-ausencia', name: 'Dashboard - Analítico Ausências', requiresAuth: true },
    { path: '/alunopresente/dashboard-analitico-atrasos', name: 'Dashboard - Analítico Atrasos', requiresAuth: true },
    { path: '/alunopresente/listar-monitoramento-fotos', name: 'Dashboard - Monitoramento Fotos', requiresAuth: true },
    { path: '/mapa/situacao-operacional', name: 'Dashboard - Situação Operacional', requiresAuth: true },
    { path: '/mapa/acompanhamento-operacional', name: 'Acompanhamento Operacional', requiresAuth: true },
    { path: '/relatorios/evolucao-fotos', name: 'Relatório - Evolução de fotos', requiresAuth: true },
    { path: '/relatorios/evolucao-mensal', name: 'Relatório - Evolução Mensal', requiresAuth: true }
  ],

  // Contextos Dinâmicos: Unidades Escolares
  contexts: {
    list: [
      'EMEB CONSTANCA FIGUEIREDO PALMA BEM BEM',
      'EMEB MINISTRO MARCOS FREIRE'
    ],
    apply: async (page: Page, schoolName: string): Promise<boolean> => {
      const loginHandler = new LoginHandler();
      return loginHandler.selectSchoolUnit(page, schoolName);
    }
  },

  /**
   * Interage com os filtros na página do Aluno Presente
   */
  interactWithFilters: async (page: Page, targetSchool?: string): Promise<string[]> => {
    const filterActions: string[] = [];
    try {
      console.log('   🔍 [Filtros] Buscando filtros na tela...');

      // Função utilitária para descobrir o nome amigável do filtro na tela
      const getFriendlyLabel = async (elLocator: any) => {
        try {
          const labelText = await elLocator.evaluate((el: HTMLElement) => {
            const placeholder = el.getAttribute('placeholder');
            if (placeholder && placeholder.trim()) return placeholder.trim();

            const innerInput = el.querySelector('input');
            if (innerInput) {
              const innerPlaceholder = innerInput.getAttribute('placeholder');
              if (innerPlaceholder && innerPlaceholder.trim()) return innerPlaceholder.trim();
            }

            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

            if (el.id) {
              const labelEl = document.querySelector(`label[for="${el.id}"]`);
              if (labelEl && labelEl.textContent && labelEl.textContent.trim()) {
                return labelEl.textContent.trim();
              }
            }

            let prev = el.previousElementSibling;
            while (prev) {
              if (['LABEL', 'SPAN', 'STRONG', 'H6'].includes(prev.tagName) && prev.textContent && prev.textContent.trim()) {
                return prev.textContent.trim();
              }
              prev = prev.previousElementSibling;
            }

            let parent = el.parentElement;
            for (let depth = 0; depth < 3 && parent; depth++) {
              const labelEl = parent.querySelector('label');
              if (labelEl && labelEl.textContent && labelEl.textContent.trim()) {
                return labelEl.textContent.trim();
              }
              const titleEl = parent.querySelector('.filter-label, .control-label, .title');
              if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
                return titleEl.textContent.trim();
              }
              parent = parent.parentElement;
            }

            return '';
          }).catch(() => '');

          return labelText || '';
        } catch {
          return '';
        }
      };

      let interactedCount = 0;

      // 1. Tentar encontrar selects nativos
      const selectLocator = page.locator('select:visible');
      const selectCount = await selectLocator.count().catch(() => 0);

      for (let i = 0; i < selectCount && interactedCount < 10; i++) {
        const sel = selectLocator.nth(i);
        const isEnabled = await sel.isEnabled().catch(() => false);
        if (!isEnabled) continue;

        // Previne dupla interação no mesmo elemento
        const alreadyInteracted = await sel.getAttribute('data-auditor-interacted').catch(() => null);
        if (alreadyInteracted === 'true') continue;
        await sel.evaluate((node) => node.setAttribute('data-auditor-interacted', 'true')).catch(() => {});

        const options = sel.locator('option');
        const optCount = await options.count().catch(() => 0);
        if (optCount > 1) {
          const val = await options.nth(1).getAttribute('value').catch(() => '');
          const text = await options.nth(1).innerText().catch(() => '');
          const label = await getFriendlyLabel(sel);

          console.log(`   [Filtros] Alterando select nativo #${i+1} para a opção "${text.trim() || val}"`);
          await sel.selectOption({ index: 1 }).catch(() => {});

          const name = label ? `"${label}"` : `de seleção nº ${i+1}`;
          filterActions.push(`Altere o filtro ${name} para a opção "${text.trim() || val}"`);
          
          await page.waitForTimeout(1000);
          interactedCount++;
        }
      }

      // 2. Tentar encontrar dropdown-filtro customizados (.dropdown-filtro)
      const dropdownFiltroLoc = page.locator('.dropdown-filtro:visible');
      const dropdownFiltroCount = await dropdownFiltroLoc.count().catch(() => 0);
      
      for (let i = 0; i < dropdownFiltroCount; i++) {
        const dd = dropdownFiltroLoc.nth(i);
        const trigger = dd.locator('.btn-filtro-select, button').first();
        if (!await trigger.isVisible().catch(() => false)) continue;

        // Previne dupla interação no mesmo elemento
        const alreadyInteracted = await dd.getAttribute('data-auditor-interacted').catch(() => null);
        if (alreadyInteracted === 'true') continue;
        await dd.evaluate((node) => node.setAttribute('data-auditor-interacted', 'true')).catch(() => {});
        
        const label = await getFriendlyLabel(dd);
        const currentText = await trigger.innerText().catch(() => '');
        
        const triggerId = await trigger.getAttribute('id').catch(() => '') || '';
        const isSchoolDropdown = label.toLowerCase().includes('unidade') || 
                                 label.toLowerCase().includes('escola') || 
                                 triggerId.toLowerCase().includes('unidade');
        
        if (isSchoolDropdown && targetSchool) {
          console.log(`   [Filtros] Unidade Escolar detectada. Buscando "${targetSchool}" no dropdown...`);
          await trigger.click().catch(() => {});
          await page.waitForTimeout(600);
          
          const itemsLoc = dd.locator('.dropdown-filtro-item');
          const itemCount = await itemsLoc.count().catch(() => 0);
          let schoolSelected = false;
          
          for (let j = 0; j < itemCount; j++) {
            const item = itemsLoc.nth(j);
            const itemText = await item.innerText().catch(() => '');
            
            const normText = itemText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const normTarget = targetSchool.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            if (normText.includes(normTarget)) {
              console.log(`   [Filtros] Selecionando "${itemText}" no dropdown de unidade...`);
              await item.click().catch(() => {});
              filterActions.push(`Selecione a Unidade Escolar "${itemText}" no filtro local da página.`);
              schoolSelected = true;
              break;
            }
          }
          
          if (!schoolSelected) {
            console.log(`   [Filtros] Unidade "${targetSchool}" não encontrada no dropdown. Fechando...`);
            await page.click('body').catch(() => {});
          } else {
            await page.waitForTimeout(1000);
            interactedCount++;
          }
        } else {
          // Outro dropdown normal (ex: Período, Condição Operacional) ou sem targetSchool
          if (interactedCount >= 10) continue;
          
          console.log(`   [Filtros] Abrindo dropdown "${label || 'sem rótulo'}"...`);
          await trigger.click().catch(() => {});
          await page.waitForTimeout(600);
          
          const itemsLoc = dd.locator('.dropdown-filtro-item');
          const itemCount = await itemsLoc.count().catch(() => 0);
          
          if (itemCount > 1) {
            let itemToClick = itemsLoc.nth(1);
            let chosenText = '';
            for (let j = 0; j < itemCount; j++) {
              const item = itemsLoc.nth(j);
              const text = await item.innerText().catch(() => '');
              const val = await item.getAttribute('data-value').catch(() => '');
              if (text !== currentText && val !== 'all' && val !== 'all-schools') {
                itemToClick = item;
                chosenText = text;
                break;
              }
            }
            if (!chosenText) {
              chosenText = await itemsLoc.nth(1).innerText().catch(() => 'segunda opção');
            }
            
            console.log(`   [Filtros] Clicando na opção "${chosenText}"`);
            await itemToClick.click().catch(() => {});
            const name = label ? `"${label}"` : `de filtro`;
            filterActions.push(`Altere o filtro ${name} para a opção "${chosenText}"`);
            await page.waitForTimeout(1000);
            interactedCount++;
          } else {
            await page.click('body').catch(() => {});
          }
        }
      }

      // 3. Tentar encontrar ng-select / outros custom dropdowns legados
      const customSelectSelectors = [
        'ng-select:visible',
        '.select-pure__select:visible',
        '.choices:visible',
        '.select2-container:visible',
        '.form-select:visible:not(select)',
        '.dropdown-toggle:visible'
      ];

      for (const cssSel of customSelectSelectors) {
        if (interactedCount >= 10) break;

        const locators = page.locator(cssSel);
        const count = await locators.count().catch(() => 0);
        
        for (let i = 0; i < count && interactedCount < 10; i++) {
          const el = locators.nth(i);
          const isVisible = await el.isVisible().catch(() => false);
          if (!isVisible) continue;

          // Previne dupla interação no mesmo elemento
          const alreadyInteracted = await el.getAttribute('data-auditor-interacted').catch(() => null);
          if (alreadyInteracted === 'true') continue;
          await el.evaluate((node) => node.setAttribute('data-auditor-interacted', 'true')).catch(() => {});

          const label = await getFriendlyLabel(el);
          const valText = await el.innerText().catch(() => '');

          console.log(`   [Filtros] Interagindo com seletor customizado: "${cssSel}" #${i+1}`);
          // Clicar para abrir o dropdown
          await el.click().catch(() => {});
          await page.waitForTimeout(600);

          // Buscar opções reais no painel do ng-select no DOM para clicar com o mouse, simulando o usuário de forma real
          const optionLocator = page.locator('.ng-dropdown-panel .ng-option:visible, .ng-option:visible, [role="option"]:visible');
          const optionCount = await optionLocator.count().catch(() => 0);

          if (optionCount > 1) {
            // Clica na segunda opção (índice 1) para mudar o valor selecionado
            const optionToClick = optionLocator.nth(1);
            const optionText = await optionToClick.innerText().catch(() => 'outra opção');
            await optionToClick.click().catch(() => {});
            
            const name = label ? `"${label}"` : `de opções`;
            filterActions.push(`Selecione a opção "${optionText.trim()}" no filtro ${name}`);
          } else if (optionCount === 1) {
            // Se só houver uma única opção, clica nela
            const optionToClick = optionLocator.nth(0);
            const optionText = await optionToClick.innerText().catch(() => 'opção');
            await optionToClick.click().catch(() => {});
            
            const name = label ? `"${label}"` : `de opções`;
            filterActions.push(`Selecione a opção "${optionText.trim()}" no filtro ${name}`);
          } else {
            // Se as opções não puderem ser mapeadas no DOM, usa o fallback de teclado
            await page.keyboard.press('ArrowDown').catch(() => {});
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter').catch(() => {});
            
            const name = label ? `"${label}"` : (valText.trim() ? `"${valText.trim()}"` : `nº ${interactedCount+1}`);
            filterActions.push(`Clique no filtro de opções ${name}, aperte a tecla "Seta para Baixo" (ArrowDown) do teclado e pressione "Enter" para alterar o valor.`);
          }
          
          await page.waitForTimeout(1000);
          interactedCount++;
        }
      }

      // 4. Tentar encontrar inputs de data
      const dateSelectors = [
        'input[type="date"]:visible',
        'input.datepicker:visible',
        'input.datepicker-input:visible',
        'input[id*="data"]:visible',
        'input[name*="data"]:visible',
        'input[placeholder*="data"]:visible',
        'input[placeholder*="Data"]:visible'
      ];

      for (const cssSel of dateSelectors) {
        if (interactedCount >= 10) break;

        const locators = page.locator(cssSel);
        const count = await locators.count().catch(() => 0);

        for (let i = 0; i < count && interactedCount < 10; i++) {
          const el = locators.nth(i);
          const isVisible = await el.isVisible().catch(() => false);
          const isEnabled = await el.isEnabled().catch(() => false);
          if (!isVisible || !isEnabled) continue;

          // Previne dupla interação no mesmo elemento
          const alreadyInteracted = await el.getAttribute('data-auditor-interacted').catch(() => null);
          if (alreadyInteracted === 'true') continue;
          await el.evaluate((node) => node.setAttribute('data-auditor-interacted', 'true')).catch(() => {});

          const currentValue = await el.inputValue().catch(() => '');
          const label = await getFriendlyLabel(el);

          console.log(`   [Filtros] Interagindo com input de data #${i+1} (valor atual: "${currentValue}")`);

          await el.click().catch(() => {});
          const typeAttr = await el.getAttribute('type').catch(() => '');
          
          const name = label ? `"${label}"` : `de data nº ${i+1}`;
          
          if (typeAttr === 'date') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().split('T')[0];
            const datePtBr = dateStr.split('-').reverse().join('/'); // dd/mm/yyyy
            await el.fill(dateStr).catch(() => {});
            filterActions.push(`No campo de data ${name}, escolha ou preencha a data "${datePtBr}"`);
          } else {
            await el.fill('').catch(() => {});
            await el.type('01/05/2026').catch(() => {});
            await page.keyboard.press('Enter').catch(() => {});
            filterActions.push(`No campo de data ${name} (valor anterior era "${currentValue || 'vazio'}"), limpe o campo, digite a data "01/05/2026" e aperte "Enter" no teclado.`);
          }

          await page.waitForTimeout(1000);
          interactedCount++;
        }
      }

      // 5. Clicar no botão de ação/submissão para carregar os dados/relatório (ex: "Filtrar", "Visualizar", "Gerar", "Pesquisar")
      const submitButtons = [
        'button:has-text("Gerar Relatório PDF")',
        'button:has-text("Gerar Relatório CSV")',
        'button:has-text("Gerar Relatório")',
        'button:has-text("Filtrar")',
        'button:has-text("Visualizar")',
        'button:has-text("Gerar")',
        'button:has-text("Pesquisar")',
        'button:has-text("Buscar")',
        'input[type="submit"]',
        '.btn-filtrar',
        '.btn-gerar'
      ];

      let clickedSubmit = false;
      for (const btnSelector of submitButtons) {
        const btn = page.locator(btnSelector).first();
        if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
          const btnText = await btn.innerText().catch(() => '');
          
          // SALVAGUARDA DE SEGURANÇA: Bloqueia botões de cadastro/mudança de dados se não autorizado
          const mutatingWords = ['salvar', 'cadastrar', 'criar', 'excluir', 'enviar', 'confirmar', 'delete', 'save', 'submit', 'create', 'register'];
          const normText = btnText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const isMutating = mutatingWords.some(word => normText.includes(word));
          
          const allowReg = process.env.ALLOW_REGISTRATIONS === 'true';

          if (isMutating && !allowReg) {
            console.log(`⚠️ [Segurança] Clique no botão "${btnText}" foi bloqueado para prevenir cadastros indesejados.`);
            continue;
          }

          console.log(`   [Filtros] Clicando no botão de submissão/ação: "${btnText || btnSelector}"`);
          await btn.click().catch(() => {});
          filterActions.push(`Clique no botão "${btnText.trim() || 'Filtrar/Visualizar'}" para gerar os dados.`);
          clickedSubmit = true;
          await page.waitForTimeout(1500); // Aguarda pequeno cooldown inicial após clique
          break;
        }
      }

      if (interactedCount > 0 || clickedSubmit) {
        console.log(`   [Filtros] ${interactedCount} filtro(s) alterados/submetidos. Aguardando 3s de estabilização inicial...`);
        await page.waitForTimeout(3000);
      } else {
        console.log('   [Filtros] Nenhum filtro ou botão de ação interativo visível foi encontrado.');
      }

    } catch (err) {
      console.warn('⚠️ [Filtros] Erro ao interagir com os filtros da tela:', err);
    }
    return filterActions;
  }
};
