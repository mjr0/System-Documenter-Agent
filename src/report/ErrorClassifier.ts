// ============================================================
// ErrorClassifier — Classificação e formatação de erros
// Agrupa erros por severidade e gera rótulos legíveis em PT-BR
// ============================================================

import { AuditError, Severity } from '../types/index';

/**
 * Classe utilitária com métodos estáticos para classificar,
 * categorizar e formatar os erros encontrados na auditoria.
 */
export class ErrorClassifier {
  // --------------------------------------------------------
  // Mapa de emojis por severidade
  // --------------------------------------------------------
  private static readonly SEVERITY_EMOJI: Record<Severity, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🟢',
  };

  // --------------------------------------------------------
  // Mapa de rótulos em português por categoria de erro
  // --------------------------------------------------------
  private static readonly CATEGORY_LABELS: Record<string, string> = {
    console_error: 'Erro JavaScript (Console)',
    console_warning: 'Aviso do Console',
    network_error: 'Falha de Requisição HTTP',
    broken_link: 'Link Quebrado',
    broken_image: 'Imagem Quebrada',
    visual_issue: 'Problema Visual',
    performance: 'Performance',
  };

  /**
   * Agrupa uma lista de erros por nível de severidade.
   * @param errors - Lista de erros da auditoria
   * @returns Objeto com três arrays: critical, warning e info
   */
  static classify(errors: AuditError[]): {
    critical: AuditError[];
    warning: AuditError[];
    info: AuditError[];
  } {
    const classified = {
      critical: [] as AuditError[],
      warning: [] as AuditError[],
      info: [] as AuditError[],
    };

    for (const error of errors) {
      switch (error.severity) {
        case 'critical':
          classified.critical.push(error);
          break;
        case 'warning':
          classified.warning.push(error);
          break;
        case 'info':
          classified.info.push(error);
          break;
        default:
          // Caso a severidade não seja reconhecida, trata como info
          classified.info.push(error);
          break;
      }
    }

    return classified;
  }

  /**
   * Retorna o emoji correspondente ao nível de severidade.
   * @param severity - Nível de severidade ('critical' | 'warning' | 'info')
   * @returns Emoji colorido representando a severidade
   */
  static getSeverityEmoji(severity: Severity): string {
    return this.SEVERITY_EMOJI[severity] ?? '⚪';
  }

  /**
   * Retorna o rótulo legível em português para uma categoria de erro.
   * @param category - Identificador da categoria (ex: 'console_error')
   * @returns Texto descritivo em português
   */
  static getCategoryLabel(category: string): string {
    return this.CATEGORY_LABELS[category] ?? category;
  }

  /**
   * Formata um erro em uma string legível com emoji, categoria e mensagem.
   * Exemplo: "🔴 [Erro JavaScript (Console)] Uncaught TypeError: ..."
   * @param error - Erro a ser formatado
   * @returns String formatada para exibição
   */
  static formatError(error: AuditError): string {
    const emoji = this.getSeverityEmoji(error.severity);
    const label = this.getCategoryLabel(error.category);
    return `${emoji} [${label}] ${error.message}`;
  }

  /**
   * Converte uma mensagem técnica de erro para termos fáceis e descritivos para um QA analista.
   */
  static translateToFriendly(error: AuditError): AuditError {
    const friendly = { ...error };

    // 1. Falhas de Rede (network_error)
    if (error.category === 'network_error') {
      const urlMatch = error.message.match(/https?:\/\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : '';
      let apiName = 'painel';
      if (url) {
        const parts = url.split('/');
        apiName = parts[parts.length - 1] || parts[parts.length - 2] || 'dados';
      }

      friendly.message = `Falha de conexão: não foi possível carregar os dados de "${apiName}"`;
      
      let motivo = 'A requisição foi recusada, cancelada pelo navegador ou o servidor demorou muito a responder.';
      if (error.details && error.details.includes('404')) {
        motivo = 'O endereço solicitado não foi encontrado no servidor (Erro 404).';
      } else if (error.details && error.details.includes('500')) {
        motivo = 'Ocorreu um erro interno no servidor ao processar os dados (Erro 500).';
      } else if (error.details && error.details.includes('CORS')) {
        motivo = 'Bloqueio de segurança do navegador (Erro de CORS/Compartilhamento entre origens).';
      } else if (error.details && error.details.includes('ERR_ABORTED')) {
        motivo = 'A requisição foi abortada pelo navegador (tempo de resposta esgotado ou cancelamento).';
      }

      friendly.details = `O sistema tentou se conectar com o servidor para obter dados da funcionalidade "${apiName}" através do endereço:\n${url || error.message}\n\nMotivo da falha: ${motivo}`;
    }

    // 2. Erros de Programação / Console (console_error)
    else if (error.category === 'console_error') {
      friendly.message = 'Falha no funcionamento da página (Erro interno de programação)';
      friendly.details = `Ocorreu um erro interno no código de funcionamento desta tela. Isso pode fazer com que botões parem de responder ou que elementos gráficos não sejam exibidos corretamente.\n\nDetalhes técnicos do erro:\n${error.message}\n${error.details || ''}`;
    }

    // 3. Avisos do Console (console_warning)
    else if (error.category === 'console_warning') {
      friendly.message = 'Aviso de otimização ou alerta interno da tela';
      friendly.details = `O navegador registrou um aviso na tela. Embora isso geralmente não impeça o uso básico, pode sinalizar problemas de compatibilidade ou lentidão no futuro.\n\nDetalhes técnicos:\n${error.message}\n${error.details || ''}`;
    }

    // 4. Imagens Quebradas (broken_image)
    else if (error.category === 'broken_image') {
      friendly.message = 'Imagem quebrada (não carregou na tela)';
      friendly.details = `O sistema tentou carregar uma imagem, mas o arquivo não foi encontrado no servidor ou o link está quebrado.\n\nCaminho da imagem:\n${error.message}`;
    }

    // 5. Problemas Visuais (visual_issue)
    else if (error.category === 'visual_issue') {
      if (error.message.includes('overflow')) {
        friendly.message = 'Elemento saindo dos limites da tela (Transbordo/Overflow)';
        friendly.details = `Algum elemento ou texto desta página é maior do que a largura da tela do usuário. Isso cria uma barra de rolagem horizontal indesejada e prejudica a visualização.\n\nDetalhes técnicos:\n${error.details || error.message}`;
      } else {
        friendly.message = 'Botão ou link sem texto ou descrição acessível';
        friendly.details = `Encontramos um botão ou link clicável na tela que está vazio (não possui texto visível e nem etiqueta de acessibilidade "aria-label"). Usuários com leitores de tela ou ferramentas de acessibilidade não conseguirão identificar o que este botão faz.\n\nCódigo do elemento:\n${error.message}`;
      }
    }

    // 6. Problemas de Performance (performance)
    else if (error.category === 'performance') {
      friendly.message = 'Tela com carregamento lento';
      friendly.details = `Esta tela demorou mais de 3 segundos para carregar por completo e ficar disponível para uso, o que ultrapassa o limite aceitável de experiência do usuário.\n\nTempo registrado: ${error.message}`;
    }

    return friendly;
  }
}

