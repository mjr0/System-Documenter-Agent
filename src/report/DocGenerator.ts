import * as fs from 'fs';
import * as path from 'path';
import { PageDocData, BusinessRule, FlowTransition } from '../types/documenter';

export class DocGenerator {
  /**
   * Compila todas as informações coletadas pelo robô em um manual Markdown completo.
   */
  generate(
    systemName: string,
    baseUrl: string,
    pagesData: PageDocData[],
    transitions: FlowTransition[],
    allRules: BusinessRule[]
  ): string {
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const safeSystemName = systemName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docFilePath = path.join(docsDir, `documentacao_${safeSystemName}.md`);

    let mdContent = '';
    mdContent += `# 📘 Especificação e Documentação Técnica do Sistema\n\n`;
    mdContent += `Este manual técnico detalha as telas, formulários, fluxos de navegação e regras de validação mapeados de forma automatizada.\n\n`;
    
    mdContent += `## ⚙️ Informações Gerais do Sistema\n\n`;
    mdContent += `*   **Sistema**: \`${systemName}\`\n`;
    mdContent += `*   **URL Base**: [${baseUrl}](${baseUrl})\n`;
    mdContent += `*   **Data de Geração**: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n`;
    mdContent += `*   **Total de Telas Mapeadas**: ${pagesData.length}\n`;
    mdContent += `*   **Total de Regras de Validação Catalogadas**: ${allRules.length}\n\n`;
    
    mdContent += `---\n\n`;

    // 1. SEÇÃO: FLUXOGRAMA DE NAVEGAÇÃO INTERATIVO
    mdContent += `## 🗺️ Mapa de Navegação e Rotas do Sistema (Fluxograma)\n\n`;
    mdContent += `Abaixo está o diagrama visual gerado automaticamente que ilustra os caminhos e transições de tela rastreados no sistema.\n\n`;
    
    if (transitions.length > 0) {
      mdContent += `\`\`\`mermaid\ngraph TD\n`;
      // Criar nós limpos e únicos
      const nodes = new Set<string>();
      
      // Mapeamento para nomes amigáveis
      const getPageNameForPath = (pPath: string) => {
        const found = pagesData.find(p => p.path === pPath);
        return found ? found.pageName : pPath;
      };

      transitions.forEach(t => {
        const fromName = getPageNameForPath(t.fromPage);
        const toName = getPageNameForPath(t.toPage);
        const fromId = t.fromPage.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = t.toPage.replace(/[^a-zA-Z0-9]/g, '_');

        if (!nodes.has(fromId)) {
          mdContent += `  ${fromId}["${fromName} (${t.fromPage})"]\n`;
          nodes.add(fromId);
        }
        if (!nodes.has(toId)) {
          mdContent += `  ${toId}["${toName} (${t.toPage})"]\n`;
          nodes.add(toId);
        }

        // Adiciona a transição
        mdContent += `  ${fromId} -->|"${t.actionTrigger}"| ${toId}\n`;
      });
      mdContent += `\`\`\`\n\n`;
    } else {
      mdContent += `*ℹ️ Nenhuma transição de tela foi capturada durante o mapeamento (execução de tela única).*\n\n`;
    }

    mdContent += `---\n\n`;

    // 2. SEÇÃO: MATRIZ GLOBAL DE REGRAS DE VALIDAÇÃO (BUSINESS RULES)
    mdContent += `## 📋 Catálogo de Regras de Negócio e Validações\n\n`;
    mdContent += `Validações identificadas nos campos de entrada do sistema (regras do HTML5 ou geradas por comportamentos e mensagens de erro do sistema):\n\n`;

    if (allRules.length > 0) {
      mdContent += `| Tela | Campo / Input | Tipo de Regra | Mensagem de Erro Disparada no Sistema |\n`;
      mdContent += `| :--- | :--- | :--- | :--- |\n`;
      allRules.forEach(rule => {
        const message = rule.triggeredMessage ? `"${rule.triggeredMessage}"` : '*(Mensagem não disparada/apenas regra HTML5)*';
        mdContent += `| ${rule.pageName} | **${rule.fieldLabel}** (name: \`${rule.fieldName}\`) | \`${rule.validationRule}\` | ${message} |\n`;
      });
      mdContent += `\n`;
    } else {
      mdContent += `*ℹ️ Nenhuma validação ou regra de preenchimento foi mapeada nesta execução.*\n\n`;
    }

    mdContent += `---\n\n`;

    // 3. SEÇÃO: DETALHAMENTO DAS TELAS E SEUS ELEMENTOS
    mdContent += `## 🖥️ Detalhamento Técnico das Telas\n\n`;

    pagesData.forEach((page) => {
      mdContent += `### Tela: ${page.pageName}\n\n`;
      mdContent += `*   **Rota**: \`${page.path}\`\n`;
      mdContent += `*   **Título HTML da Página**: \`${page.title || 'Sem título'}\`\n`;
      mdContent += `*   **Cabeçalho Principal (H1)**: \`${page.h1 || 'Nenhum'}\`\n`;
      if (page.description) {
        mdContent += `*   **Descrição**: *${page.description}*\n`;
      }
      mdContent += `\n`;

      // Subseção: Campos de Entrada
      if (page.inputs.length > 0) {
        mdContent += `#### 📝 Campos de Entrada (Formulário)\n\n`;
        mdContent += `| Rótulo / Descrição | Tipo | Atributo Name | Placeholder / Exemplo | Validações Mapeadas |\n`;
        mdContent += `| :--- | :--- | :--- | :--- | :--- |\n`;
        page.inputs.forEach((input) => {
          const label = input.label || '*(Sem rótulo)*';
          const type = input.type || 'text';
          const name = input.name ? `\`${input.name}\`` : '*(Nenhum)*';
          const placeholder = input.placeholder ? `"${input.placeholder}"` : '*(Vazio)*';
          const rules = input.validationRules && input.validationRules.length > 0 
            ? input.validationRules.map(r => `\`${r}\``).join(', ') 
            : '*(Nenhuma)*';
          mdContent += `| ${label} | \`${type}\` | ${name} | ${placeholder} | ${rules} |\n`;
        });
        mdContent += `\n`;
      } else {
        mdContent += `*ℹ️ Nenhum campo de formulário editável identificado nesta tela.*\n\n`;
      }

      // Subseção: Botões de Ação
      if (page.buttons.length > 0) {
        mdContent += `#### ⚡ Ações Disponíveis (Botões)\n\n`;
        mdContent += `| Texto do Botão | Tipo de Ação |\n`;
        mdContent += `| :--- | :--- |\n`;
        page.buttons.forEach((btn) => {
          const type = btn.type === 'submit' ? 'Submissão de Formulário (`submit`)' : 'Ação de Clique comum (`button`)';
          mdContent += `| **${btn.text}** | ${type} |\n`;
        });
        mdContent += `\n`;
      }

      // Subseção: Regras de Validação desta Tela
      const screenRules = allRules.filter(r => r.pagePath === page.path);
      if (screenRules.length > 0) {
        mdContent += `#### 🔍 Validações Disparadas nesta Tela\n\n`;
        mdContent += `| Campo | Regra / Tipo | Mensagem Capturada no Sistema |\n`;
        mdContent += `| :--- | :--- | :--- |\n`;
        screenRules.forEach(sr => {
          const message = sr.triggeredMessage ? `"${sr.triggeredMessage}"` : '*(Não disparada)*';
          mdContent += `| **${sr.fieldLabel}** | \`${sr.validationRule}\` | ${message} |\n`;
        });
        mdContent += `\n`;
      }

      // Subseção: Screenshot
      if (page.screenshotFilename) {
        const relativeImgPath = `../screenshots/${page.screenshotFilename}`;
        mdContent += `#### 🖼️ Prévia Visual da Tela\n\n`;
        mdContent += `![Captura de Tela de ${page.pageName}](${relativeImgPath})\n\n`;
      }

      mdContent += `\n---\n\n`;
    });

    fs.writeFileSync(docFilePath, mdContent, 'utf-8');
    return docFilePath;
  }
}
