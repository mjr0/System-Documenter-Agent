import { DocGenerator } from '../../src/report/DocGenerator';
import { PageDocData, BusinessRule, FlowTransition } from '../../src/types/documenter';
import * as fs from 'fs';
import * as path from 'path';

// Mock do fs para não criar arquivos reais durante os testes
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DocGenerator', () => {
  let generator: DocGenerator;

  const mockPage: PageDocData = {
    pageName: 'Cadastro de Alunos',
    path: '/alunos',
    title: 'Alunos | Sistema',
    h1: 'Cadastro de Alunos',
    description: 'Tela para cadastro de novos alunos',
    inputs: [
      {
        label: 'Nome Completo',
        type: 'text',
        placeholder: 'Digite o nome',
        name: 'nome',
        validationRules: ['required', 'maxlength: 100'],
      },
      {
        label: 'E-mail',
        type: 'email',
        placeholder: 'email@dominio.com',
        name: 'email',
        validationRules: ['required'],
      },
    ],
    buttons: [
      { text: 'Salvar', type: 'submit' },
      { text: 'Cancelar', type: 'button' },
    ],
    screenshotFilename: 'doc_cadastro_alunos_12345.png',
  };

  const mockRule: BusinessRule = {
    id: 'br_001',
    pagePath: '/alunos',
    pageName: 'Cadastro de Alunos',
    fieldName: 'nome',
    fieldLabel: 'Nome Completo',
    validationRule: 'Campo Obrigatório (HTML5 required)',
    triggeredMessage: 'Preencha este campo.',
  };

  const mockTransition: FlowTransition = {
    fromPage: '/dashboard',
    toPage: '/alunos',
    actionTrigger: 'Navegar para Cadastro de Alunos',
  };

  beforeEach(() => {
    generator = new DocGenerator();
    // Simula existência do diretório
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.writeFileSync.mockImplementation(() => {});
    mockedFs.mkdirSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generate()', () => {
    it('deve gerar conteúdo Markdown com cabeçalho do sistema', () => {
      generator.generate('MeuSistema', 'https://meusistema.com', [mockPage], [mockTransition], [mockRule]);

      const writeCall = mockedFs.writeFileSync.mock.calls[0];
      const content = writeCall[1] as string;

      expect(content).toContain('# 📘 Especificação e Documentação Técnica do Sistema');
      expect(content).toContain('MeuSistema');
      expect(content).toContain('https://meusistema.com');
    });

    it('deve incluir a contagem correta de telas e regras no cabeçalho', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [], [mockRule]);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('Total de Telas Mapeadas**: 1');
      expect(content).toContain('Total de Regras de Validação Catalogadas**: 1');
    });

    it('deve gerar diagrama Mermaid quando há transições', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [mockTransition], []);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('```mermaid');
      expect(content).toContain('graph TD');
      expect(content).toContain('Navegar para Cadastro de Alunos');
      expect(content).toContain('_dashboard');
      expect(content).toContain('_alunos');
    });

    it('deve mostrar mensagem informativa quando não há transições', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [], []);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('Nenhuma transição de tela foi capturada');
      expect(content).not.toContain('```mermaid');
    });

    it('deve incluir tabela de campos de entrada para cada tela', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [], []);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('Nome Completo');
      expect(content).toContain('E-mail');
      expect(content).toContain('`text`');
      expect(content).toContain('`email`');
      expect(content).toContain('required');
      expect(content).toContain('maxlength: 100');
    });

    it('deve incluir seção de botões corretamente', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [], []);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('**Salvar**');
      expect(content).toContain('Submissão de Formulário');
      expect(content).toContain('**Cancelar**');
      expect(content).toContain('Ação de Clique comum');
    });

    it('deve incluir catálogo de regras de negócio', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [], [mockRule]);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('Campo Obrigatório (HTML5 required)');
      expect(content).toContain('"Preencha este campo."');
      expect(content).toContain('**Nome Completo**');
    });

    it('deve incluir referência ao screenshot quando disponível', () => {
      generator.generate('Sistema', 'https://sistema.com', [mockPage], [], []);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('doc_cadastro_alunos_12345.png');
      expect(content).toContain('![Captura de Tela de Cadastro de Alunos]');
    });

    it('deve salvar o arquivo no caminho correto', () => {
      generator.generate('Meu Sistema', 'https://sistema.com', [], [], []);

      const writeCall = mockedFs.writeFileSync.mock.calls[0];
      const filePath = writeCall[0] as string;

      // Nome do sistema normalizado: meu_sistema
      expect(filePath).toMatch(/documentacao_meu_sistema\.md$/);
    });

    it('deve lidar com tela sem campos de formulário', () => {
      const pageWithoutInputs: PageDocData = { ...mockPage, inputs: [], buttons: [] };
      generator.generate('Sistema', 'https://sistema.com', [pageWithoutInputs], [], []);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(content).toContain('Nenhum campo de formulário editável identificado nesta tela');
    });

    it('deve separar regras por tela corretamente', () => {
      const page2: PageDocData = {
        ...mockPage,
        pageName: 'Gestão de Turmas',
        path: '/turmas',
        inputs: [{ label: 'Nome da Turma', type: 'text', placeholder: '', name: 'nome_turma', validationRules: [] }],
        buttons: [],
        screenshotFilename: '',
      };
      const rule2: BusinessRule = {
        ...mockRule,
        id: 'br_002',
        pagePath: '/turmas',
        pageName: 'Gestão de Turmas',
        fieldName: 'nome_turma',
        fieldLabel: 'Nome da Turma',
      };

      generator.generate('Sistema', 'https://sistema.com', [mockPage, page2], [], [mockRule, rule2]);

      const content = mockedFs.writeFileSync.mock.calls[0][1] as string;
      // Regra da primeira tela deve aparecer na seção dela
      expect(content).toContain('Cadastro de Alunos');
      expect(content).toContain('Gestão de Turmas');
    });
  });
});
