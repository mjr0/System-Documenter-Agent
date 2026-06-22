import { PageDocData } from '../types/documenter';

export interface RichDescription {
  objective: string;
  features: string[];
  roles: string[];
}

const AP_DESCRIPTIONS: Record<string, RichDescription> = {
  '/alunopresente/dashboard-unidadeescolar': {
    objective: 'Apresentar uma visão geral consolidada da frequência escolar diária na escola selecionada.',
    features: [
      'Visualização rápida de alunos presentes e ausentes por turma no dia atual',
      'Acompanhamento gráfico da frequência acumulada por período',
      'Filtro rápido por turmas e séries da unidade'
    ],
    roles: ['Diretor Escolar', 'Coordenador Pedagógico', 'Secretário de Escola']
  },
  '/alunopresente/dashboard-analise-diaria': {
    objective: 'Permitir a análise detalhada e pontual da frequência de cada turma no dia corrente.',
    features: [
      'Comparativo de presença absoluta e percentual por turma',
      'Identificação imediata de desvios e faltas em massa no dia corrente',
      'Consulta à lista nominal de alunos ausentes e presentes'
    ],
    roles: ['Coordenador Pedagógico', 'Diretor Escolar', 'Inspetores']
  },
  '/alunopresente/dashboard-refeitorio-diario': {
    objective: 'Monitorar a adesão à alimentação escolar e o fluxo de consumo de merenda no refeitório.',
    features: [
      'Rastreabilidade de refeições servidas em tempo real',
      'Percentual de adesão dos alunos presentes versus alunos alimentados',
      'Relatórios de consumo por turma para planejamento do cardápio e insumos'
    ],
    roles: ['Nutricionista Escolar', 'Administrador da Merenda', 'Merendeiras']
  },
  '/alunopresente/dashboard-secretario': {
    objective: 'Gerenciar operações administrativas da unidade de ensino, incluindo controle de turmas, alunos e acompanhamento cadastral.',
    features: [
      'Filtros avançados por região escolar, séries e status de funcionamento das unidades',
      'Acesso rápido à ficha cadastral e histórico de enturmação de alunos',
      'Exportação de dados consolidados da secretaria para acompanhamento de rede'
    ],
    roles: ['Secretário Escolar', 'Auxiliar de Secretaria', 'Supervisor da Rede']
  },
  '/alunopresente/dashboard-aluno': {
    objective: 'Visualizar a ficha individual do aluno, com seu histórico pedagógico e registros de frequência detalhados.',
    features: [
      'Detalhamento de presença nominal por dia letivo',
      'Histórico de justificativas médicas ou pedagógicas para faltas',
      'Consulta rápida de contatos e responsáveis legais cadastrados'
    ],
    roles: ['Professores', 'Coordenadores', 'Assistentes Sociais']
  },
  '/alunopresente/dashboard-analitico-recorrencia': {
    objective: 'Identificar padrões de faltas repetitivas e recorrentes (ex: faltas repetidas em dias específicos) para combater preventivamente a evasão.',
    features: [
      'Relatório de alunos que atingiram limites críticos de faltas periódicas',
      'Cruzamento de dados de infrequência periódica e sazonalidade de faltas',
      'Geração de alertas para acionamento de rede de proteção e Conselho Tutelar'
    ],
    roles: ['Orientador Educacional', 'Conselho Tutelar', 'Diretor Escolar']
  },
  '/alunopresente/dashboard-analitico-ausencia': {
    objective: 'Análise agregada e de longo prazo de ausências e faltas acumuladas na unidade de ensino.',
    features: [
      'Ranking de alunos com maior percentual de ausência acumulada no ano letivo',
      'Monitoramento de justificativas pendentes ou aceitas',
      'Filtro de faltas por período letivo, turno ou disciplina'
    ],
    roles: ['Coordenador Pedagógico', 'Conselho Escolar', 'Orientadores']
  },
  '/alunopresente/dashboard-analitico-atrasos': {
    objective: 'Registrar e analisar a pontualidade e os atrasos ocorridos na entrada dos alunos nas dependências escolares.',
    features: [
      'Monitoramento de entradas tardias com registro de horários exatos via sistema de biometria',
      'Identificação de alunos com atrasos sistemáticos na semana/mês',
      'Cruzamento de dados de atrasos frequentes para análise de comportamento e rendimento'
    ],
    roles: ['Inspetor de Alunos', 'Orientador Educacional', 'Portaria']
  },
  '/alunopresente/listar-monitoramento-fotos': {
    objective: 'Acompanhar a integridade, qualidade e cobertura do cadastro biométrico facial e fotográfico dos alunos da rede.',
    features: [
      'Verificação visual e status do cadastro de foto de cada aluno',
      'Identificação de fotos com falha de contraste, luminosidade ou qualidade impeditiva de reconhecimento',
      'Relatórios de auditoria da base biométrica para equipes técnicas'
    ],
    roles: ['Equipe de TI', 'Administrador do Sistema', 'Secretários']
  },
  '/mapa/situacao-operacional': {
    objective: 'Visualizar o status de funcionamento e transmissão de dados de toda a rede de ensino em tempo real.',
    features: [
      'Indicadores em tempo real sobre quais escolas já transmitiram a frequência diária',
      'Mapa de calor ou tabela sobre a assiduidade por região da cidade',
      'Detecção automática de anomalias operacionais na transmissão de dados'
    ],
    roles: ['Secretário Municipal de Educação', 'Supervisor Geral', 'Prefeito']
  },
  '/mapa/acompanhamento-operacional': {
    objective: 'Realizar o acompanhamento técnico e logístico diário do envio de dados de frequência pelas escolas.',
    features: [
      'Monitoramento de uploads pendentes de dados de frequência',
      'Painel de controle de sincronização dos tablets/coletores de presença biométricos',
      'Histórico de estabilidade de rede e infraestrutura de hardware por escola'
    ],
    roles: ['Suporte Técnico de TI', 'Administrador de Infraestrutura']
  },
  '/relatorios/evolucao-fotos': {
    objective: 'Auditar a evolução percentual e absoluta do censo fotográfico escolar da rede municipal.',
    features: [
      'Comparativo de fotos tiradas versus faltantes entre todas as unidades escolares',
      'Gráficos de progresso semanal das campanhas de cadastramento fotográfico',
      'Exportação de planilhas de pendências para ação direta dos diretores escolares'
    ],
    roles: ['Gestor de Projetos', 'Diretoria de Ensino', 'Auditores']
  },
  '/relatorios/evolucao-mensal': {
    objective: 'Gerar relatórios estatísticos consolidados mensais de assiduidade e consumo de merenda para fins de prestação de contas.',
    features: [
      'Consolidação mensal de taxas de presença e faltas por série e nível de ensino',
      'Exportação em PDF/Excel de planilhas de frequência escolar',
      'Filtros avançados por período letivo, modalidade de ensino e região geográfica'
    ],
    roles: ['Supervisão Escolar', 'Auditores de Convênios', 'Secretaria de Educação']
  }
};

export class ScreenDescriber {
  /**
   * Retorna a especificação funcional rica para uma tela mapeada
   */
  static describe(page: PageDocData): RichDescription {
    const cleanPath = page.path.toLowerCase().split('?')[0].replace(/\/$/, '');
    
    // Busca na base pré-configurada
    if (AP_DESCRIPTIONS[cleanPath]) {
      return AP_DESCRIPTIONS[cleanPath];
    }

    // Heurísticas de Fallback Baseadas na URL e Componentes da Tela
    const hasForms = page.inputs.length > 0;
    const hasButtons = page.buttons.length > 0;
    const hasSearch = page.inputs.some(inp => 
      inp.label.toLowerCase().includes('buscar') || 
      inp.label.toLowerCase().includes('filtro') || 
      inp.label.toLowerCase().includes('pesquisar') ||
      inp.name.toLowerCase().includes('search') ||
      inp.name.toLowerCase().includes('filter')
    );

    let objective = `Interface operacional para consulta e gerenciamento de informações na tela "${page.pageName}".`;
    const features: string[] = [];
    const roles: string[] = ['Operador do Sistema', 'Administrador'];

    if (cleanPath.includes('relatorio') || cleanPath.includes('evolucao') || cleanPath.includes('exportar')) {
      objective = `Apresentar relatórios consolidados e dados analíticos sobre "${page.pageName}" para análise gerencial.`;
      features.push('Visualização tabular de informações gerenciais consolidada');
      features.push('Filtros integrados para segmentação temporal ou por categoria');
      if (hasButtons) {
        features.push('Exportação dos relatórios e dados da tela para formatos externos');
      }
      roles.push('Gestor', 'Analista de Operações');
    } else if (cleanPath.includes('dashboard') || cleanPath.includes('painel') || cleanPath.includes('indicadores')) {
      objective = `Apresentar painéis informativos com métricas, gráficos e indicadores chaves (KPIs) para a tomada de decisões de "${page.pageName}".`;
      features.push('Indicadores resumidos em cards de fácil visualização');
      features.push('Acompanhamento do status operacional de forma agregada');
      roles.push('Diretoria', 'Coordenador Pedagógico');
    } else if (cleanPath.includes('cadastro') || cleanPath.includes('configuracao') || cleanPath.includes('novo') || cleanPath.includes('editar')) {
      objective = `Gerenciar o cadastro de dados, parametrizações e definições operacionais relacionadas a "${page.pageName}".`;
      features.push('Inclusão e edição de registros no banco de dados do sistema');
      features.push('Validação de obrigatoriedade e conformidade dos campos na interface');
      roles.push('Auxiliar Administrativo');
    } else {
      // Fallback Geral Inteligente baseado em elementos
      if (hasSearch && hasForms) {
        objective = `Tela de pesquisa e filtragem de registros para gerenciamento de dados de "${page.pageName}".`;
        features.push('Busca dinâmica através de múltiplos filtros integrados');
        features.push('Visualização e paginação dos resultados em lista organizada');
      } else if (hasForms) {
        objective = `Formulário interativo para entrada de dados de "${page.pageName}" no sistema.`;
        features.push('Preenchimento assistido de dados com validações ativas');
      }
    }

    // Limpa duplicados de perfis
    const uniqueRoles = Array.from(new Set(roles));

    // Se não tiver features, adiciona comportamentos genéricos mapeados
    if (features.length === 0) {
      if (hasForms) features.push('Entrada de dados através de formulários estruturados');
      if (hasButtons) features.push('Ações interativas integradas com os botões mapeados na interface');
    }

    return {
      objective,
      features,
      roles: uniqueRoles
    };
  }
}
