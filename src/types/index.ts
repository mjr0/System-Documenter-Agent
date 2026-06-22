// ============================================================
// Tipos e Interfaces — Auditoria Aluno Presente
// ============================================================

/** Nível de severidade de um erro encontrado */
export type Severity = 'critical' | 'warning' | 'info';

/** Categoria do erro */
export type ErrorCategory =
  | 'console_error'
  | 'console_warning'
  | 'network_error'
  | 'broken_link'
  | 'broken_image'
  | 'visual_issue'
  | 'usability'
  | 'performance'
  | 'data_integrity';

/** Um erro encontrado durante a auditoria */
export interface AuditError {
  /** Categoria do erro */
  category: ErrorCategory;
  /** Severidade */
  severity: Severity;
  /** Mensagem descritiva do erro */
  message: string;
  /** Detalhes adicionais (stack trace, URL do recurso, etc.) */
  details?: string;
  /** Timestamp de quando o erro foi capturado */
  timestamp: Date;
  /** Passos detalhados para reproduzir o erro manualmente */
  replicationSteps?: string[];
  /** Caminho do screenshot do elemento específico com problema */
  elementScreenshotPath?: string;
}

/** Resultado da auditoria de uma única página */
export interface PageAuditResult {
  /** URL completa da página */
  url: string;
  /** Nome amigável da página (ex: "Dashboard", "Cadastro de Alunos") */
  pageName: string;
  /** Tempo de carregamento em milissegundos */
  loadTimeMs: number;
  /** Lista de erros encontrados */
  errors: AuditError[];
  /** Caminho do screenshot capturado */
  screenshotPath?: string;
  /** Status HTTP da página */
  httpStatus?: number;
  /** Se a página redirecionou para outro lugar inesperadamente */
  redirectedTo?: string;
  /** Métricas KPI extraídas da tela (cartões de resumo) */
  extractedMetrics?: ExtractedMetric[];
}

/** Resultado completo da auditoria */
export interface AuditReport {
  /** Data/hora de início da auditoria */
  startedAt: Date;
  /** Data/hora de término */
  finishedAt: Date;
  /** URL base do ambiente auditado */
  baseUrl: string;
  /** Resultados por página */
  pages: PageAuditResult[];
  /** Resumo quantitativo */
  summary: AuditSummary;
}

/** Resumo quantitativo da auditoria */
export interface AuditSummary {
  totalPages: number;
  totalErrors: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  pagesWithErrors: number;
  pagesClean: number;
  avgLoadTimeMs: number;
  slowPages: string[];
}

/** Configuração de uma página/rota a ser auditada */
export interface PageConfig {
  /** Caminho relativo (ex: "/dashboard") */
  path: string;
  /** Nome amigável */
  name: string;
  /** Se requer login para acessar */
  requiresAuth: boolean;
  /** Seletor CSS a aguardar antes de considerar a página carregada */
  waitForSelector?: string;
  /** Tempo máximo de espera em ms (padrão: 30000) */
  timeout?: number;
}

/** Regra de Integridade de Dados em Tela */
export interface DataIntegrityRule {
  id: string;
  pagePath: string;
  targetTableSelector?: string;
  conditionColumn: string;
  conditionOperator: 'equals' | 'contains' | 'not_equals' | 'is_empty' | 'not_empty';
  conditionValue: string;
  verifyColumn: string;
  verifyOperator: 'equals' | 'contains' | 'not_equals' | 'is_empty' | 'not_empty';
  verifyValue?: string;
  errorMessage?: string;
  severity?: Severity;
}

/** Tabela e colunas descobertas em uma rota */
export interface DiscoveredTable {
  pagePath: string;
  selector: string;
  columns: string[];
}

/** Métrica KPI extraída de uma tela */
export interface ExtractedMetric {
  label: string;
  value: string | null;
  percentage: string | null;
  rawText: string;
}


