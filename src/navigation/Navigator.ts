// ============================================================
// Navigator — Navegação e descoberta de páginas
// ============================================================

import { Page, Response } from 'playwright';
import { config } from '../config/config';
import { PageConfig } from '../types/index';
import { SystemProfile } from '../profiles/SystemProfile';

/** Resultado retornado pela navegação a uma página */
export interface NavigationResult {
  /** Tempo de carregamento em milissegundos (-1 indica falha) */
  loadTimeMs: number;
  /** Código de status HTTP da resposta principal */
  httpStatus: number | undefined;
  /** URL final caso tenha ocorrido redirecionamento */
  redirectedTo: string | undefined;
}

/**
 * Responsável por navegar até páginas do sistema e descobrir
 * links internos disponíveis no menu / corpo da página.
 */
export class Navigator {
  private profile?: SystemProfile;

  constructor(profile?: SystemProfile) {
    this.profile = profile;
  }

  // -------------------------------------------------------
  // Navegação
  // -------------------------------------------------------

  /**
   * Navega até uma página específica e coleta métricas de carregamento.
   *
   * @param page     Instância do Playwright Page
   * @param pageConfig Configuração da página alvo
   * @returns Métricas de navegação (tempo, status HTTP, redirecionamento)
   */
  async navigateTo(page: Page, pageConfig: PageConfig): Promise<NavigationResult> {
    const baseUrl = this.profile?.baseUrl || config.baseUrl;
    const targetUrl = `${baseUrl}${pageConfig.path}`;
    const timeout = pageConfig.timeout ?? config.defaultTimeout;

    console.log(`[Navigator] Navegando para: ${targetUrl}`);

    // Variável para capturar o status HTTP do documento principal
    let httpStatus: number | undefined;

    // Listener que captura a resposta do documento principal (navegação)
    const responseHandler = (response: Response) => {
      try {
        // Considera apenas respostas do tipo "document" (navegação principal)
        const request = response.request();
        if (request.resourceType() === 'document' && response.url().includes(pageConfig.path)) {
          httpStatus = response.status();
        }
      } catch {
        // Ignora erros ao acessar a resposta
      }
    };

    const startTime = Date.now();

    try {
      // Registra o listener antes de navegar
      page.on('response', responseHandler);

      // Realiza a navegação
      try {
        await page.goto(targetUrl, {
          waitUntil: 'networkidle',
          timeout,
        });
      } catch (err) {
        // Se for TimeoutError, ignoramos e continuamos com a página carregada
        if (err instanceof Error && err.name === 'TimeoutError') {
          console.warn(`[Navigator] Alerta: Timeout de networkidle atingido para ${targetUrl}. Prosseguindo com a página no estado atual.`);
        } else {
          throw err;
        }
      }

      // Aguarda seletor específico, se configurado
      if (pageConfig.waitForSelector) {
        console.log(`[Navigator] Aguardando seletor: ${pageConfig.waitForSelector}`);
        await page.waitForSelector(pageConfig.waitForSelector, { timeout });
      }

      const loadTimeMs = Date.now() - startTime;

      // Verifica se houve redirecionamento
      const finalUrl = page.url();
      const expectedNormalized = this.normalizeUrl(targetUrl);
      const finalNormalized = this.normalizeUrl(finalUrl);
      const redirectedTo = finalNormalized !== expectedNormalized ? finalUrl : undefined;

      if (redirectedTo) {
        console.warn(`[Navigator] Redirecionado de ${targetUrl} para ${finalUrl}`);
      }

      console.log(
        `[Navigator] Página carregada em ${loadTimeMs}ms — Status HTTP: ${httpStatus ?? 'desconhecido'}`
      );

      return { loadTimeMs, httpStatus, redirectedTo };
    } catch (error) {
      const loadTimeMs = -1;
      console.error(`[Navigator] Erro ao navegar para ${targetUrl}:`, error);
      return { loadTimeMs, httpStatus, redirectedTo: undefined };
    } finally {
      // Remove o listener para evitar vazamentos de memória
      page.off('response', responseHandler);
    }
  }

  // -------------------------------------------------------
  // Descoberta de páginas
  // -------------------------------------------------------

  /**
   * Descobre todas as páginas internas acessíveis a partir da
   * página atual, coletando links <a> do DOM.
   *
   * @param page Instância do Playwright Page
   * @returns Lista de PageConfig para cada link interno encontrado
   */
  async discoverPages(page: Page): Promise<PageConfig[]> {
    console.log('[Navigator] Iniciando descoberta de páginas internas...');

    try {
      // Extrai todos os hrefs de links <a> presentes na página
      const hrefs: string[] = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => typeof href === 'string' && href.length > 0);
      });

      console.log(`[Navigator] ${hrefs.length} links encontrados no DOM.`);

      const baseUrl = this.profile?.baseUrl || config.baseUrl;
      const origin = new URL(baseUrl).origin;
      const seen = new Set<string>();
      const pages: PageConfig[] = [];

      for (const href of hrefs) {
        try {
          const url = new URL(href);

          // Filtra apenas links internos (mesma origem)
          if (url.origin !== origin) continue;

          // Ignora links do tipo "javascript:"
          if (url.protocol === 'javascript:') continue;

          // Remove hash para evitar duplicatas por âncora
          const pathOnly = url.pathname;

          // Ignora links que são apenas hash na mesma página
          if (!pathOnly || pathOnly === '') continue;

          // Remove duplicatas
          if (seen.has(pathOnly)) continue;
          seen.add(pathOnly);

          // Gera um nome amigável a partir do caminho
          const name = this.pathToName(pathOnly);

          pages.push({
            path: pathOnly,
            name,
            requiresAuth: true, // Por padrão assume que requer autenticação
          });
        } catch {
          // URL inválida — ignora
        }
      }

      // Ordena por caminho para facilitar leitura
      pages.sort((a, b) => a.path.localeCompare(b.path));

      console.log(`[Navigator] ${pages.length} páginas internas únicas descobertas.`);
      return pages;
    } catch (error) {
      console.error('[Navigator] Erro ao descobrir páginas:', error);
      return [];
    }
  }

  // -------------------------------------------------------
  // Utilitários privados
  // -------------------------------------------------------

  /**
   * Normaliza uma URL removendo barra final e parâmetros de query
   * para comparação de redirecionamento.
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove barra final e ignora query/hash para a comparação
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return url.replace(/\/+$/, '');
    }
  }

  /**
   * Converte um caminho de URL em um nome amigável.
   * Exemplo: "/alunos/cadastro" → "Alunos / Cadastro"
   */
  private pathToName(path: string): string {
    return path
      .replace(/^\//, '')       // Remove barra inicial
      .replace(/\/$/, '')       // Remove barra final
      .split('/')               // Divide por segmentos
      .map((segment) =>
        segment
          .replace(/[-_]/g, ' ')                        // Troca hífens e underscores por espaços
          .replace(/\b\w/g, (char) => char.toUpperCase()) // Capitaliza cada palavra
      )
      .join(' / ');             // Junta com separador amigável
  }
}
