import { Page } from 'playwright';
import { PageConfig, DataIntegrityRule, DiscoveredTable } from '../types/index';

/**
 * Interface que define as configurações, fluxo de login,
 * contextos dinâmicos e filtros para a auditoria de um sistema web.
 */
export interface SystemProfile {
  /** Nome amigável do sistema */
  name: string;
  
  /** URL base do sistema */
  baseUrl: string;

  /** Se deve permitir cliques em botões de cadastro/mudança de dados */
  allowRegistrations?: boolean;

  /** Se deve gerar documentação técnica do sistema ao final */
  generateDocumentation?: boolean;

  /** Se deve executar verificações de usabilidade/UX */
  runUsabilityChecks?: boolean;

  /** Regras de autenticação específicas do sistema */
  auth?: {
    /** Rota da página de login (ex: "/login") */
    loginPath: string;
    /** Email/usuário do login (geralmente lido do .env) */
    loginEmail?: string;
    /** Senha do login (geralmente lido do .env) */
    loginPassword?: string;
    /** Função customizada opcional para o processo de login */
    customLogin?: (page: Page) => Promise<boolean>;
  };

  /** Lista de páginas a serem auditadas no sistema */
  pages: PageConfig[];

  /** Contextos dinâmicos opcionais (ex: Unidades Escolares, Filiais, Centros de Distribuição) */
  contexts?: {
    /** Lista de nomes dos contextos a auditar sequencialmente */
    list: string[];
    /** Função para aplicar/selecionar o contexto na tela antes de rodar os testes */
    apply: (page: Page, contextName: string) => Promise<boolean>;
  };

  /** Função para interagir com filtros locais das telas desse sistema */
  interactWithFilters?: (page: Page, currentContext?: string) => Promise<string[]>;
  
  /** Regras de integridade de dados personalizadas */
  rules?: DataIntegrityRule[];

  /** Tabelas e colunas descobertas na varredura */
  discoveredTables?: DiscoveredTable[];
}

