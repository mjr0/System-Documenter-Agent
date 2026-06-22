// ============================================================
// ReportGenerator — Gerador de Relatório PDF com Playwright
// Constrói um HTML profissional e o converte em PDF via
// navegador headless do Playwright.
// ============================================================

import { chromium, Browser } from 'playwright';
import { AuditReport, AuditError, PageAuditResult } from '../types/index';
import { ErrorClassifier } from './ErrorClassifier';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Gera relatórios em PDF a partir dos resultados da auditoria.
 * Utiliza um navegador Playwright temporário para renderizar
 * o HTML e exportar como PDF no formato A4.
 */
export class ReportGenerator {
  /**
   * Gera o relatório PDF completo e salva no diretório de relatórios.
   * @param report - Resultado completo da auditoria
   * @returns Caminho absoluto do arquivo PDF gerado
   */
  async generate(report: AuditReport): Promise<string> {
    // Garante que o diretório de relatórios existe
    if (!fs.existsSync(config.reportsDir)) {
      fs.mkdirSync(config.reportsDir, { recursive: true });
    }

    // Monta o nome do arquivo com data/hora atual
    const now = new Date();
    const timestamp = this.formatDateForFilename(now);
    const filename = `auditoria-${timestamp}.pdf`;
    const pdfPath = path.join(config.reportsDir, filename);

    // Constrói o HTML do relatório
    const htmlContent = this.buildHtml(report);

    // Abre navegador temporário para gerar o PDF
    let browser: Browser | null = null;
    try {
      console.log('📄 Iniciando geração do relatório PDF...');
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Define o conteúdo HTML e aguarda o carregamento completo
      await page.setContent(htmlContent, { waitUntil: 'networkidle' });

      // Gera o PDF com formato A4 e margens adequadas
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      });

      console.log(`✅ Relatório PDF gerado com sucesso: ${pdfPath}`);
    } catch (error) {
      console.error('❌ Erro ao gerar relatório PDF:', error);
      throw error;
    } finally {
      // Sempre fecha o navegador temporário
      if (browser) {
        await browser.close();
      }
    }

    return pdfPath;
  }

  // ============================================================
  // Construção do HTML
  // ============================================================

  /**
   * Constrói o documento HTML completo com CSS inline.
   * @param report - Dados da auditoria
   * @returns String HTML completa
   */
  private buildHtml(report: AuditReport): string {
    // Coleta todos os erros de todas as páginas
    const allErrors: AuditError[] = report.pages.flatMap((p) => p.errors);
    const classified = ErrorClassifier.classify(allErrors);

    // Identifica páginas lentas para a seção de performance
    const slowPages = report.pages.filter(
      (p) => p.loadTimeMs > config.slowPageThreshold
    );

    // Lê as anotações de evidência do usuário se existirem
    let userNotesHtml = '';
    const notesPath = path.resolve(config.reportsDir, '../evidencias_usuario.txt');
    if (fs.existsSync(notesPath)) {
      const rawContent = fs.readFileSync(notesPath, 'utf-8');
      let notesLines = rawContent.split('\n');
      if (notesLines.length > 0 && notesLines[0].startsWith('=====')) {
        notesLines = notesLines.slice(4);
      }
      const notesContent = notesLines.join('\n').trim();
      if (notesContent.length > 0) {
        userNotesHtml = `
          <div class="section" style="page-break-inside: avoid; margin-top: 25px;">
            <div class="section-title" style="border-bottom: 2px solid #2563eb; color: #1e3a8a;">📝 ANOTAÇÕES DE EVIDÊNCIA DO USUÁRIO</div>
            <div style="background: #eff6ff; border-left: 4px solid #2563eb; border-radius: 6px; padding: 15px; font-family: monospace; white-space: pre-wrap; font-size: 11px; color: #1e293b; line-height: 1.5; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              ${this.escapeHtml(notesContent)}
            </div>
          </div>
        `;
      }
    }

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Auditoria — QA Auditor Agent</title>
  <style>
    /* ===== Reset e Tipografia ===== */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
      line-height: 1.6;
      background: #f9fafb;
      font-size: 13px;
    }

    /* ===== Cabeçalho Principal ===== */
    .header {
      background: linear-gradient(135deg, #1e293b, #334155);
      color: #fff;
      padding: 30px 40px;
      text-align: center;
    }
    .header h1 {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      font-size: 13px;
      opacity: 0.85;
    }

    /* ===== Contêiner de conteúdo ===== */
    .content { padding: 25px 40px; }

    /* ===== Resumo Executivo ===== */
    .summary-box {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-bottom: 30px;
    }
    .summary-card {
      flex: 1;
      min-width: 150px;
      background: #fff;
      border-radius: 10px;
      padding: 18px 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07);
      text-align: center;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: 700;
      display: block;
      margin-bottom: 4px;
    }
    .summary-card .label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-card.critical .value { color: #dc2626; }
    .summary-card.warning .value  { color: #f59e0b; }
    .summary-card.clean .value    { color: #16a34a; }
    .summary-card.neutral .value  { color: #2563eb; }

    /* ===== Seções ===== */
    .section {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
    }

    /* ===== Cards de Erro por Página ===== */
    .page-errors {
      background: #fff;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 14px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      page-break-inside: avoid;
    }
    .page-errors h3 {
      font-size: 14px;
      color: #1e293b;
      margin-bottom: 4px;
    }
    .page-errors .page-url {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 10px;
      word-break: break-all;
    }
    .error-item {
      padding: 8px 12px;
      margin-bottom: 6px;
      border-radius: 6px;
      background: #f8fafc;
      border-left: 4px solid #e2e8f0;
    }
    .error-item.critical { border-left-color: #dc2626; background: #fef2f2; }
    .error-item.warning  { border-left-color: #f59e0b; background: #fffbeb; }
    .error-item.info     { border-left-color: #16a34a; background: #f0fdf4; }

    .error-item .error-category {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .error-item.critical .error-category { color: #dc2626; }
    .error-item.warning  .error-category { color: #d97706; }
    .error-item.info     .error-category { color: #16a34a; }

    .error-item .error-message {
      font-size: 12px;
      color: #334155;
    }
    .error-item .error-details {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
      font-family: 'Consolas', 'Courier New', monospace;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* ===== Badges de Severidade ===== */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #fff;
    }
    .badge.critical { background: #dc2626; }
    .badge.warning  { background: #f59e0b; }
    .badge.info     { background: #16a34a; }

    /* ===== Tabela de Performance ===== */
    .perf-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .perf-table th {
      background: #f1f5f9;
      text-align: left;
      padding: 10px 14px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
    }
    .perf-table td {
      padding: 10px 14px;
      font-size: 12px;
      border-top: 1px solid #f1f5f9;
    }
    .perf-table tr:hover td { background: #f8fafc; }
    .load-time-slow { color: #dc2626; font-weight: 600; }
    .load-time-ok   { color: #16a34a; }

    /* ===== Screenshots ===== */
    .screenshot {
      margin-top: 10px;
      max-width: 100%;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }

    /* ===== Mensagem vazia ===== */
    .empty-message {
      text-align: center;
      color: #94a3b8;
      padding: 20px;
      font-style: italic;
    }

    /* ===== Rodapé ===== */
    .footer {
      text-align: center;
      padding: 20px 40px;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      margin-top: 30px;
    }

    /* ===== Quebras de página para PDF ===== */
    @media print {
      .section { page-break-inside: avoid; }
      .page-errors { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Cabeçalho -->
  <div class="header">
    <h1>AUDITORIA — QA AUDITOR AGENT</h1>
    <div class="subtitle">
      Ambiente: ${report.baseUrl}<br/>
      Período: ${this.formatDate(report.startedAt)} — ${this.formatDate(report.finishedAt)}
    </div>
  </div>

  <div class="content">

    <!-- Resumo Executivo -->
    <div class="summary-box">
      <div class="summary-card neutral">
        <span class="value">${report.summary.totalPages}</span>
        <span class="label">Páginas Auditadas</span>
      </div>
      <div class="summary-card critical">
        <span class="value">${report.summary.criticalCount}</span>
        <span class="label">Erros Críticos</span>
      </div>
      <div class="summary-card warning">
        <span class="value">${report.summary.warningCount}</span>
        <span class="label">Alertas</span>
      </div>
      <div class="summary-card clean">
        <span class="value">${report.summary.pagesClean}</span>
        <span class="label">Páginas Limpas</span>
      </div>
      <div class="summary-card neutral">
        <span class="value">${(report.summary.avgLoadTimeMs / 1000).toFixed(2)}s</span>
        <span class="label">Tempo Médio de Carga</span>
      </div>
    </div>

    <!-- Seção: Erros Críticos -->
    ${this.buildErrorSection('🔴 ERROS CRÍTICOS', 'critical', classified.critical, report.pages)}

    <!-- Seção: Alertas -->
    ${this.buildErrorSection('🟡 ALERTAS', 'warning', classified.warning, report.pages)}

    <!-- Seção: Informações -->
    ${this.buildErrorSection('🟢 INFORMAÇÕES', 'info', classified.info, report.pages)}

    <!-- Seção: Anotações do Usuário -->
    ${userNotesHtml}

    <!-- Seção: Performance -->
    <div class="section">
      <div class="section-title">⏱️ PERFORMANCE</div>
      ${
        report.pages.length > 0
          ? `
        <table class="perf-table">
          <thead>
            <tr>
              <th>Página</th>
              <th>URL</th>
              <th>Status HTTP</th>
              <th>Tempo de Carga</th>
            </tr>
          </thead>
          <tbody>
            ${report.pages
              .sort((a, b) => b.loadTimeMs - a.loadTimeMs)
              .map(
                (p) => `
              <tr>
                <td><strong>${this.escapeHtml(p.pageName)}</strong></td>
                <td style="font-size:11px;color:#64748b;word-break:break-all;">${this.escapeHtml(p.url)}</td>
                <td>${p.httpStatus ?? '—'}</td>
                <td class="${p.loadTimeMs > config.slowPageThreshold ? 'load-time-slow' : 'load-time-ok'}">
                  ${(p.loadTimeMs / 1000).toFixed(2)}s
                  ${p.loadTimeMs > config.slowPageThreshold ? ' ⚠️ Lenta' : ''}
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`
          : '<p class="empty-message">Nenhuma página auditada.</p>'
      }
    </div>

  </div>

  <!-- Rodapé -->
  <div class="footer">
    Relatório gerado automaticamente em ${this.formatDate(new Date())} · QA Auditor Agent
  </div>

</body>
</html>`;
  }

  // ============================================================
  // Seção de erros agrupados por página
  // ============================================================

  /**
   * Constrói uma seção HTML de erros agrupados por página.
   * @param title - Título da seção (ex: '🔴 ERROS CRÍTICOS')
   * @param severityClass - Classe CSS da severidade
   * @param errors - Lista de erros filtrados por severidade
   * @param pages - Lista de resultados de páginas (para screenshots)
   * @returns String HTML da seção
   */
  private buildErrorSection(
    title: string,
    severityClass: string,
    errors: AuditError[],
    pages: PageAuditResult[]
  ): string {
    if (errors.length === 0) {
      return `
        <div class="section">
          <div class="section-title">${title}</div>
          <p class="empty-message">Nenhum item encontrado nesta categoria. ✅</p>
        </div>`;
    }

    // Agrupa erros por página: encontra em qual página cada erro aparece
    const errorsByPage = new Map<string, { page: PageAuditResult; errors: AuditError[] }>();

    for (const page of pages) {
      // Filtra apenas os erros desta página que correspondem à severidade
      const pageErrors = page.errors.filter((e) => e.severity === severityClass);
      if (pageErrors.length > 0) {
        errorsByPage.set(page.url, { page, errors: pageErrors });
      }
    }

    // Monta os cards de cada página
    const pageCards = Array.from(errorsByPage.values())
      .map(({ page, errors: pageErrors }) => {
        // Agrupar erros repetidos na mesma página para diminuir o tamanho do PDF
        const groupedErrors: { err: AuditError; count: number }[] = [];
        
        for (const err of pageErrors) {
          const existing = groupedErrors.find(
            (g) =>
              g.err.category === err.category &&
              g.err.message === err.message &&
              g.err.details === err.details
          );
          if (existing) {
            existing.count++;
          } else {
            groupedErrors.push({ err, count: 1 });
          }
        }

        // Limita o número de erros a serem mostrados por página para economizar espaço
        const maxUniqueErrorsToShow = 10;
        const errorsToShow = groupedErrors.slice(0, maxUniqueErrorsToShow);
        const omittedCount = groupedErrors.length - maxUniqueErrorsToShow;
        const totalOmittedOccurrences = groupedErrors
          .slice(maxUniqueErrorsToShow)
          .reduce((sum, g) => sum + g.count, 0);

        // Monta os itens de erro
        let errorItems = errorsToShow
          .map(
            ({ err, count }) => `
            <div class="error-item ${severityClass}">
              <div class="error-category" style="display: flex; align-items: center; justify-content: space-between;">
                <span>${ErrorClassifier.getSeverityEmoji(err.severity)} ${ErrorClassifier.getCategoryLabel(err.category)}</span>
                ${count > 1 ? `<span style="background: ${severityClass === 'critical' ? '#ef4444' : '#f59e0b'}; color: white; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">Repetido ${count}x</span>` : ''}
              </div>
              <div class="error-message">${this.escapeHtml(err.message)}</div>
              ${
                err.details
                  ? `<div class="error-details">${this.escapeHtml(err.details)}</div>`
                  : ''
              }
              ${
                err.elementScreenshotPath && fs.existsSync(err.elementScreenshotPath)
                  ? `<div class="error-element-screenshot" style="margin-top: 8px;">
                       <div style="font-weight: 600; color: #475569; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">📸 Elemento com problema:</div>
                       <img src="${this.imageToBase64(err.elementScreenshotPath)}" style="max-height: 100px; max-width: 100%; border: 1px solid #e2e8f0; border-radius: 4px; background-color: #eaeaea; display: block;" />
                     </div>`
                  : ''
              }
              ${
                err.replicationSteps && err.replicationSteps.length > 0
                  ? `
                  <div class="error-replication" style="margin-top: 6px; padding: 6px 10px; background: rgba(0, 0, 0, 0.03); border-radius: 4px; font-size: 11px; border-left: 2px solid #64748b; text-align: left;">
                    <div style="font-weight: 600; color: #475569; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">🛠️ Como Reproduzir / Replicar:</div>
                    ${err.replicationSteps.map(step => `<div style="margin-bottom: 2px; color: #475569;">${this.escapeHtml(step)}</div>`).join('')}
                  </div>`
                  : ''
              }
            </div>`
          )
          .join('');

        if (omittedCount > 0) {
          errorItems += `
            <div class="error-item info" style="border-left-color: #64748b; background: #f1f5f9; font-style: italic; font-size: 11px; padding: 8px 12px; margin-bottom: 6px; border-radius: 6px;">
              ℹ️ Outros ${omittedCount} tipos de erros diferentes (totalizando ${totalOmittedOccurrences} ocorrências repetidas adicionais) foram ocultados para manter o relatório compacto.
            </div>`;
        }

        // Embute screenshot como base64 se existir
        const screenshotHtml = page.screenshotPath
          ? this.buildScreenshotHtml(page.screenshotPath)
          : '';

        let diagnosticBannerHtml = '';
        if (severityClass === 'critical') {
          const isSlowOrTimeout = page.loadTimeMs >= 30000;
          if (isSlowOrTimeout) {
            diagnosticBannerHtml = `
              <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-left: 4px solid #ef4444; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; line-height: 1.4; color: #991b1b; font-size: 11px;">
                <strong>⚠️ DIAGNÓSTICO: INSTABILIDADE POR LENTIDÃO (TIMEOUT)</strong><br/>
                Esta página demorou mais de 30 segundos para responder do servidor (estourou o tempo de rede). Quando as APIs do ERP ficam lentas e dão timeout, o front-end do ERP perde a sincronia e quebra o JavaScript (gerando erros de <em>null</em> ou de conexões abortadas). Isso é uma instabilidade real de infraestrutura/servidor e não do robô auditor. O erro pode não ocorrer ao navegar manualmente em momentos de menor tráfego.
              </div>
            `;
          } else {
            diagnosticBannerHtml = `
              <div style="background-color: #f0f7ff; border: 1px solid #c0e0ff; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; line-height: 1.4; color: #1e40af; font-size: 11px;">
                <strong>💡 NOTA DE DIAGNÓSTICO DO AUDITOR</strong><br/>
                Estes erros foram registrados em tempo real no console/rede no instante exato da varredura automática do robô. Se você abrir a tela manualmente e ela carregar corretamente sem erros, significa que o erro do ERP é <strong>intermitente</strong> (ocorre apenas sob pico de carga ou instabilidade pontual). O auditor serve justamente para registrar essas falhas silenciosas que ocorrem em produção.
              </div>
            `;
          }
        }

        return `
          <div class="page-errors">
            <h3>${this.escapeHtml(page.pageName)}</h3>
            <div class="page-url" style="margin-bottom: 12px;">${this.escapeHtml(page.url)}</div>
            ${diagnosticBannerHtml}
            ${errorItems}
            ${screenshotHtml}
          </div>`;
      })
      .join('');

    return `
      <div class="section">
        <div class="section-title">${title} <span class="badge ${severityClass}">${errors.length}</span></div>
        ${pageCards}
      </div>`;
  }

  // ============================================================
  // Utilitários
  // ============================================================

  /**
   * Formata uma data no padrão brasileiro DD/MM/YYYY HH:mm.
   * @param date - Objeto Date a ser formatado
   * @returns String formatada (ex: "15/06/2026 08:30")
   */
  private formatDate(date: Date): string {
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const ano = date.getFullYear();
    const hora = String(date.getHours()).padStart(2, '0');
    const minuto = String(date.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
  }

  /**
   * Formata data/hora para uso em nomes de arquivo (YYYY-MM-DD-HHmm).
   * @param date - Objeto Date
   * @returns String formatada (ex: "2026-06-15-0830")
   */
  private formatDateForFilename(date: Date): string {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    const hora = String(date.getHours()).padStart(2, '0');
    const minuto = String(date.getMinutes()).padStart(2, '0');
    return `${ano}-${mes}-${dia}-${hora}${minuto}`;
  }

  /**
   * Lê um arquivo de imagem e retorna como string base64 (data URI).
   * @param imagePath - Caminho absoluto da imagem
   * @returns Data URI no formato "data:image/png;base64,..."
   */
  private imageToBase64(imagePath: string): string {
    try {
      const buffer = fs.readFileSync(imagePath);
      const ext = path.extname(imagePath).toLowerCase().replace('.', '');
      // Determina o MIME type com base na extensão
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      console.warn(`⚠️ Não foi possível ler a imagem: ${imagePath}`);
      return '';
    }
  }

  /**
   * Constrói a tag HTML de screenshot com imagem embutida em base64.
   * @param screenshotPath - Caminho do arquivo de screenshot
   * @returns Tag <img> com src em base64 ou string vazia se falhar
   */
  private buildScreenshotHtml(screenshotPath: string): string {
    if (!fs.existsSync(screenshotPath)) {
      return '';
    }

    const base64 = this.imageToBase64(screenshotPath);
    if (!base64) {
      return '';
    }

    return `<img src="${base64}" alt="Screenshot da página" class="screenshot" />`;
  }

  /**
   * Escapa caracteres especiais do HTML para evitar injeção.
   * @param text - Texto a ser escapado
   * @returns Texto seguro para inserção em HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
