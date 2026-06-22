import { PageDocData, BusinessRule, FlowTransition } from '../types/documenter';
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/config';
import { ScreenDescriber } from '../documenter/ScreenDescriber';

export class PdfGenerator {
  /**
   * Constrói um HTML premium com as especificações do sistema
   * e o converte em um PDF de alta qualidade.
   */
  async generate(
    systemName: string,
    baseUrl: string,
    pagesData: PageDocData[],
    transitions: FlowTransition[],
    allRules: BusinessRule[]
  ): Promise<string> {
    const reportsDir = path.resolve(config.reportsDir);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const safeSystemName = systemName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const pdfPath = path.join(reportsDir, `manual_${safeSystemName}.pdf`);

    // Constrói o HTML do manual técnico
    const htmlContent = this.buildHtml(systemName, baseUrl, pagesData, transitions, allRules);

    let browser = null;
    try {
      console.log('📄 [PDF Generator] Iniciando navegador headless para gerar o manual técnico...');
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Define o conteúdo HTML
      await page.setContent(htmlContent, { waitUntil: 'networkidle' });

      // Aguarda o Mermaid renderizar o fluxograma (se houver transições)
      if (transitions.length > 0) {
        console.log('📄 [PDF Generator] Aguardando renderização do fluxograma Mermaid...');
        await page.waitForSelector('.mermaid svg', { timeout: 10000 }).catch(() => {
          console.warn('⚠️ [PDF Generator] Timeout ao aguardar renderização do Mermaid no PDF.');
        });
      }

      // Imprime em PDF A4
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 7pt; font-family: 'Segoe UI', sans-serif; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px; margin: 0 15mm; box-sizing: border-box;">
            <span style="font-weight: 700; color: #7c3aed;">ESPECIFICAÇÃO DE SISTEMA — DOCUMENTER</span>
            <span style="color: #64748b;">SISTEMA: ${systemName.toUpperCase()}</span>
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 7pt; font-family: 'Segoe UI', sans-serif; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 5px; margin: 0 15mm; box-sizing: border-box;">
            <span>Propriedade Privada — Marcelo Junior</span>
            <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>
        `,
        margin: {
          top: '25mm',
          right: '15mm',
          bottom: '25mm',
          left: '15mm',
        },
      });

      console.log(`✅ [PDF Generator] Manual técnico PDF gerado com sucesso em: ${pdfPath}`);
    } catch (error) {
      console.error('❌ [PDF Generator] Erro na geração do manual PDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return pdfPath;
  }

  private buildHtml(
    systemName: string,
    baseUrl: string,
    pagesData: PageDocData[],
    transitions: FlowTransition[],
    allRules: BusinessRule[]
  ): string {
    // 1. Gera código Mermaid do Fluxograma
    let mermaidBlock = '';
    if (transitions.length > 0) {
      mermaidBlock = 'graph TD\n';
      const nodes = new Set<string>();
      const getPageNameForPath = (pPath: string) => {
        const found = pagesData.find(p => p.path === pPath);
        return found ? found.pageName : pPath;
      };

      transitions.forEach(t => {
        const fromId = t.fromPage.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = t.toPage.replace(/[^a-zA-Z0-9]/g, '_');
        const fromName = getPageNameForPath(t.fromPage);
        const toName = getPageNameForPath(t.toPage);

        if (!nodes.has(fromId)) {
          mermaidBlock += `  ${fromId}["${fromName} (${t.fromPage})"]\n`;
          nodes.add(fromId);
        }
        if (!nodes.has(toId)) {
          mermaidBlock += `  ${toId}["${toName} (${t.toPage})"]\n`;
          nodes.add(toId);
        }
        mermaidBlock += `  ${fromId} -->|"${t.actionTrigger}"| ${toId}\n`;
      });
    }

    // 2. Constrói HTML
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Especificação Técnica - ${systemName}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  </script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      line-height: 1.5;
      font-size: 10pt;
      -webkit-print-color-adjust: exact;
    }
    
    .page {
      padding: 10mm 5mm;
      page-break-after: always;
      position: relative;
    }
    
    .page:last-child {
      page-break-after: avoid;
    }
    
    /* Cover Page */
    .cover {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 240mm;
      padding: 25mm 20mm;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #3b0764 100%);
      color: #ffffff;
      border-radius: 16px;
      position: relative;
      overflow: hidden;
    }

    .cover::before {
      content: '';
      position: absolute;
      top: -10%;
      right: -10%;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(0,0,0,0) 70%);
      border-radius: 50%;
    }
    
    .cover-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo-badge {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 8px 16px;
      border-radius: 30px;
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #e2e8f0;
    }
    
    .cover-body {
      margin-top: 35mm;
      margin-bottom: auto;
    }
    
    .project-name {
      font-size: 13pt;
      font-weight: 800;
      color: #c084fc;
      text-transform: uppercase;
      letter-spacing: 4px;
      margin-bottom: 12px;
    }
    
    .title {
      font-size: 26pt;
      font-weight: 800;
      line-height: 1.25;
      background: linear-gradient(to right, #ffffff, #c7d2fe, #f472b6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 20px;
    }
    
    .subtitle {
      font-size: 12pt;
      font-weight: 400;
      color: #94a3b8;
      max-width: 540px;
      line-height: 1.5;
    }
    
    .cover-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 25px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .metadata-block {
      display: flex;
      flex-direction: column;
    }

    .metadata-label {
      font-size: 7.5pt;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 1.2px;
      margin-bottom: 5px;
      font-weight: 700;
    }
    
    .metadata-value {
      font-size: 9.5pt;
      font-weight: 600;
      color: #e2e8f0;
    }
    
    /* Document Elements */
    .section-title {
      font-size: 15pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .section-title::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 18px;
      background: linear-gradient(to bottom, #7c3aed, #a855f7);
      border-radius: 2px;
    }
    
    .intro-box {
      background: #f8fafc;
      border-left: 4px solid #7c3aed;
      padding: 16px;
      border-radius: 0 8px 8px 0;
      font-size: 9.5pt;
      color: #475569;
      margin-bottom: 25px;
      line-height: 1.6;
    }
    
    /* Feature Card styles */
    .feature-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      page-break-inside: avoid;
    }
    
    .feature-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 6px;
    }
    
    .feature-title {
      font-size: 12pt;
      font-weight: 700;
      color: #0f172a;
    }

    .feature-desc {
      font-size: 9pt;
      color: #64748b;
      margin-bottom: 8px;
      font-family: monospace;
    }
    
    .table-container {
      margin-bottom: 20px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      text-align: left;
    }
    
    th {
      background-color: #f8fafc;
      color: #334155;
      font-weight: 700;
      padding: 8px 10px;
      border-bottom: 2px solid #e2e8f0;
      text-transform: uppercase;
      font-size: 7.5pt;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #475569;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    .badge {
      display: inline-block;
      background: #f3e8ff;
      color: #6b21a8;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 7pt;
      text-transform: uppercase;
      margin-right: 4px;
      margin-bottom: 4px;
    }

    .screenshot-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 15px;
      max-width: 100%;
      page-break-inside: avoid;
    }

    .screenshot-title {
      background-color: #f8fafc;
      padding: 6px 10px;
      font-size: 7.5pt;
      font-weight: bold;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
      text-transform: uppercase;
    }

    .screenshot-img {
      display: block;
      width: 100%;
      height: auto;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: COVER -->
  <div class="page">
    <div class="cover">
      <div class="cover-header">
        <div class="logo-badge">SYSTEM DOCUMENTER AGENT</div>
        <div style="font-size: 8.5pt; color: #c084fc; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Manual Técnico Automático</div>
      </div>
      
      <div class="cover-body">
        <div class="project-name">${systemName}</div>
        <div class="title">Especificação Funcional & Documentação Técnica</div>
        <div class="subtitle">Documento estruturado mapeando rotas, formulários, botões de ação e regras de validação de negócios de forma 100% autônoma.</div>
      </div>
      
      <div class="cover-footer">
        <div class="metadata-block">
          <div class="metadata-label">Gerado Por</div>
          <div class="metadata-value">System Documenter - Agent Core</div>
        </div>
        <div class="metadata-block" style="text-align: right;">
          <div class="metadata-label">Data de Geração</div>
          <div class="metadata-value">${new Date().toLocaleDateString('pt-BR')}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 2: MAPA DE FLUXO -->
  <div class="page" style="padding-top: 15mm;">
    <h2 class="section-title">Mapa de Navegação do Sistema</h2>
    <div class="intro-box">
      <strong>Visão de Fluxos:</strong> O diagrama abaixo representa as rotas e transições mapeadas pelo robô durante a varredura do sistema. As setas indicam as ações e links que conectam as respectivas telas.
    </div>

    ${mermaidBlock ? `
    <div style="display: flex; justify-content: center; margin-top: 20px;">
      <pre class="mermaid" style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
        ${mermaidBlock}
      </pre>
    </div>
    ` : `
    <p style="color: #64748b; font-style: italic;">Nenhuma transição capturada (execução de tela única ou sem links mapeados).</p>
    `}
  </div>

  <!-- PAGE 3: MATRIZ DE REGRAS DE VALIDAÇÃO -->
  <div class="page" style="padding-top: 15mm;">
    <h2 class="section-title">Catálogo Consolidado de Regras de Validação</h2>
    <div class="intro-box">
      Esta tabela consolida todas as regras de preenchimento e restrições de validação encontradas nos formulários das telas catalogadas, incluindo mensagens de erro exibidas no DOM ao simular o envio.
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Tela</th>
            <th style="width: 25%;">Campo / Input</th>
            <th style="width: 20%;">Tipo de Regra</th>
            <th style="width: 30%;">Mensagem de Erro do Sistema</th>
          </tr>
        </thead>
        <tbody>
          ${allRules.length > 0 ? allRules.map(rule => `
            <tr>
              <td><strong>${this.escapeHtml(rule.pageName)}</strong></td>
              <td><strong>${this.escapeHtml(rule.fieldLabel)}</strong> <code>(name: ${this.escapeHtml(rule.fieldName)})</code></td>
              <td><span class="badge">${this.escapeHtml(rule.validationRule)}</span></td>
              <td style="color: #b91c1c; font-weight: 600;">${rule.triggeredMessage ? `"${this.escapeHtml(rule.triggeredMessage)}"` : '*(Apenas regra nativa HTML5)*'}</td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="4" style="color: #94a3b8; font-style: italic; text-align: center; padding: 15px;">Nenhuma regra catalogada.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>

  <!-- DETALHES DE CADA TELA -->
  ${pagesData.map(page => {
    const desc = ScreenDescriber.describe(page);
    return `
    <div class="page" style="padding-top: 15mm;">
      <h2 class="section-title">Tela: ${this.escapeHtml(page.pageName)}</h2>
      <div class="feature-desc">Rota: ${this.escapeHtml(page.path)}</div>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 8.5pt;">
        <strong>Título HTML da Tela:</strong> <code>${this.escapeHtml(page.title || 'Sem título')}</code><br/>
        <strong>Cabeçalho H1:</strong> <code>${this.escapeHtml(page.h1 || 'Nenhum')}</code>
      </div>

      <!-- Descrição Funcional da Tela -->
      <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-left: 4px solid #7c3aed; padding: 12px 16px; border-radius: 4px; background-color: #faf5ff; page-break-inside: avoid;">
        <h3 style="font-size: 9.5pt; font-weight: 800; color: #6b21a8; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">🎯 Objetivo e Funcionalidade</h3>
        <p style="font-size: 9pt; color: #475569; margin-bottom: 8px; line-height: 1.5;">${this.escapeHtml(desc.objective)}</p>
        <div style="font-size: 8pt; color: #64748b; margin-bottom: 8px;">
          <strong>Perfis / Papéis de Acesso Recomendados:</strong> ${desc.roles.map(r => `<span style="background-color: #f3e8ff; color: #6b21a8; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-right: 4px; font-size: 7.5pt; display: inline-block;">${this.escapeHtml(r)}</span>`).join('')}
        </div>
        <strong style="font-size: 8.5pt; color: #334155; display: block; margin-top: 8px; margin-bottom: 4px;">Principais Ações e Recursos Mapeados:</strong>
        <ul style="font-size: 8.5pt; color: #475569; padding-left: 18px; margin-bottom: 0;">
          ${desc.features.map(f => `<li style="margin-bottom: 2px;">${this.escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>

      <!-- Tabela de Inputs -->
      <h3 style="font-size: 10pt; font-weight: 700; color: #1e293b; margin-top: 15px; margin-bottom: 8px;">📝 Campos de Entrada (Formulário)</h3>
      ${page.inputs.length > 0 ? `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width: 25%;">Rótulo / Label</th>
                <th style="width: 15%;">Tipo</th>
                <th style="width: 20%;">Atributo Name</th>
                <th style="width: 20%;">Placeholder</th>
                <th style="width: 20%;">Validações HTML5</th>
              </tr>
            </thead>
            <tbody>
              ${page.inputs.map(input => {
                const rules = input.validationRules && input.validationRules.length > 0
                  ? input.validationRules.map(r => `<span class="badge">${this.escapeHtml(r)}</span>`).join('')
                  : '*(Nenhuma)*';
                return `
                  <tr>
                    <td><strong>${this.escapeHtml(input.label || '(Sem Rótulo)')}</strong></td>
                    <td><code>${this.escapeHtml(input.type)}</code></td>
                    <td><code>${this.escapeHtml(input.name || '(Nenhum)')}</code></td>
                    <td><span style="color: #64748b;">${this.escapeHtml(input.placeholder || '(Nenhum)')}</span></td>
                    <td>${rules}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <p style="color: #64748b; font-style: italic; margin-bottom: 15px; font-size: 9pt;">Nenhum campo de formulário identificado nesta tela.</p>
      `}

      <!-- Tabela de Botões -->
      <h3 style="font-size: 10pt; font-weight: 700; color: #1e293b; margin-top: 15px; margin-bottom: 8px;">⚡ Ações Disponíveis (Botões)</h3>
      ${page.buttons.length > 0 ? `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Texto do Botão</th>
                <th style="width: 50%;">Tipo de Ação</th>
              </tr>
            </thead>
            <tbody>
              ${page.buttons.map(btn => `
                <tr>
                  <td><strong>${this.escapeHtml(btn.text)}</strong></td>
                  <td><code>${this.escapeHtml(btn.type)}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <p style="color: #64748b; font-style: italic; margin-bottom: 15px; font-size: 9pt;">Nenhum botão de ação mapeado nesta tela.</p>
      `}

      <!-- Imagem / Screenshot -->
      ${page.screenshotFilename ? `
        <div class="screenshot-box">
          <div class="screenshot-title">Captura Visual da Tela</div>
          <img class="screenshot-img" src="${path.resolve(config.screenshotsDir, page.screenshotFilename)}" alt="Print de ${this.escapeHtml(page.pageName)}"/>
        </div>
      ` : ''}
    </div>
  `;
  }).join('')}

</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
