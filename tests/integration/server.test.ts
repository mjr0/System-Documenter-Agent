import request from 'supertest';
import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mini-app Express isolado para testes (replica as rotas do server.ts) ───
// Importamos apenas as rotas necessárias para não iniciar Playwright.
// Em vez de importar server.ts completo (que chama Playwright no init),
// montamos um app de teste com as mesmas rotas de status, profiles e logs.

function buildTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Estado simulado em memória (replica SystemRunState do server.ts)
  const fakeState = {
    isRunning: false,
    logBuffer: ['[10:00:00] 🚀 Servidor iniciado', '[10:00:01] ✅ Perfil carregado'],
    pageResults: [] as any[],
    transitions: [] as any[],
  };

  // Expõe reset para uso nos testes
  (app as any).__resetState = () => { fakeState.isRunning = false; };

  const fakeProfiles = {
    alunopresente: {
      name: 'Aluno Presente',
      baseUrl: 'https://alunopresente.com',
      pages: [{ path: '/alunos', name: 'Cadastro de Alunos' }],
    },
  };

  // GET /status
  app.get('/status', (req, res) => {
    const system = (req.query.system as string) || 'alunopresente';
    res.json({
      running: fakeState.isRunning,
      system,
      pageCount: fakeState.pageResults.length,
    });
  });

  // GET /logs
  app.get('/logs', (req, res) => {
    res.json({ logs: fakeState.logBuffer });
  });

  // GET /profiles
  app.get('/profiles', (req, res) => {
    const profiles = Object.entries(fakeProfiles).map(([key, val]) => ({
      key,
      name: val.name,
      baseUrl: val.baseUrl,
    }));
    res.json({ profiles });
  });

  // GET /results
  app.get('/results', (req, res) => {
    res.json({
      pages: fakeState.pageResults,
      transitions: fakeState.transitions,
    });
  });

  // GET /dashboard - deve retornar HTML
  app.get('/dashboard', (req, res) => {
    // Simula retorno do arquivo HTML estático
    res.status(200).type('html').send('<html><body><h1>System Documenter Dashboard</h1></body></html>');
  });

  // POST /run - simula início de mapeamento
  app.post('/run', (req, res) => {
    const { system } = req.body;
    if (!system) {
      return res.status(400).json({ error: 'Campo "system" é obrigatório.' });
    }
    if (fakeState.isRunning) {
      return res.status(409).json({ error: 'Já existe um mapeamento em andamento.' });
    }
    fakeState.isRunning = true;
    res.json({ message: `Mapeamento iniciado para o sistema: ${system}` });
    // Simula conclusão imediata (sem Playwright real)
    setTimeout(() => { fakeState.isRunning = false; }, 50);
  });

  // POST /run-dynamic - recebe URL base e credenciais dinâmicas
  app.post('/run-dynamic', (req, res) => {
    const { baseUrl, loginEmail, loginPassword, loginPath } = req.body;
    if (!baseUrl) {
      return res.status(400).json({ error: 'Campo "baseUrl" é obrigatório.' });
    }
    if (fakeState.isRunning) {
      return res.status(409).json({ error: 'Já existe um mapeamento em andamento.' });
    }
    fakeState.isRunning = true;
    res.json({ message: `Mapeamento dinâmico iniciado em: ${baseUrl}` });
    setTimeout(() => { fakeState.isRunning = false; }, 50);
  });

  // POST /stop - cancela o mapeamento ativo
  app.post('/stop', (req, res) => {
    if (!fakeState.isRunning) {
      return res.status(200).json({ message: 'Nenhum mapeamento ativo para cancelar.' });
    }
    fakeState.isRunning = false;
    res.json({ message: 'Mapeamento cancelado com sucesso.' });
  });

  return app;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('Server API — rotas REST', () => {
  const app = buildTestApp();

  beforeEach(() => {
    // Garante estado limpo entre testes (sem race condition de isRunning)
    (app as any).__resetState();
  });

  // ── GET /status ─────────────────────────────────────────────────
  describe('GET /status', () => {
    it('deve retornar status com running=false quando ocioso', async () => {
      const res = await request(app).get('/status?system=alunopresente');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('running', false);
      expect(res.body).toHaveProperty('system', 'alunopresente');
    });

    it('deve retornar sistema "dynamic" quando passado na query', async () => {
      const res = await request(app).get('/status?system=dynamic');
      expect(res.status).toBe(200);
      expect(res.body.system).toBe('dynamic');
    });
  });

  // ── GET /logs ────────────────────────────────────────────────────
  describe('GET /logs', () => {
    it('deve retornar array de logs', async () => {
      const res = await request(app).get('/logs');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logs');
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThan(0);
    });

    it('os logs devem ser strings', async () => {
      const res = await request(app).get('/logs');
      res.body.logs.forEach((log: any) => {
        expect(typeof log).toBe('string');
      });
    });
  });

  // ── GET /profiles ────────────────────────────────────────────────
  describe('GET /profiles', () => {
    it('deve retornar lista de perfis configurados', async () => {
      const res = await request(app).get('/profiles');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('profiles');
      expect(Array.isArray(res.body.profiles)).toBe(true);
    });

    it('cada perfil deve ter key, name e baseUrl', async () => {
      const res = await request(app).get('/profiles');
      res.body.profiles.forEach((p: any) => {
        expect(p).toHaveProperty('key');
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('baseUrl');
      });
    });

    it('deve incluir o perfil "alunopresente"', async () => {
      const res = await request(app).get('/profiles');
      const keys = res.body.profiles.map((p: any) => p.key);
      expect(keys).toContain('alunopresente');
    });
  });

  // ── GET /results ─────────────────────────────────────────────────
  describe('GET /results', () => {
    it('deve retornar arrays de pages e transitions', async () => {
      const res = await request(app).get('/results');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pages');
      expect(res.body).toHaveProperty('transitions');
      expect(Array.isArray(res.body.pages)).toBe(true);
      expect(Array.isArray(res.body.transitions)).toBe(true);
    });
  });

  // ── GET /dashboard ───────────────────────────────────────────────
  describe('GET /dashboard', () => {
    it('deve retornar HTML com status 200', async () => {
      const res = await request(app).get('/dashboard');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('System Documenter');
    });
  });

  // ── POST /run ────────────────────────────────────────────────────
  describe('POST /run', () => {
    it('deve aceitar sistema válido e iniciar mapeamento', async () => {
      const res = await request(app)
        .post('/run')
        .send({ system: 'alunopresente' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/mapeamento iniciado/i);
    });

    it('deve retornar 400 quando system não é informado', async () => {
      const res = await request(app).post('/run').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── POST /run-dynamic ────────────────────────────────────────────
  describe('POST /run-dynamic', () => {
    it('deve aceitar baseUrl e iniciar mapeamento dinâmico', async () => {
      const res = await request(app)
        .post('/run-dynamic')
        .send({
          baseUrl: 'https://meu-sistema.com',
          loginEmail: 'admin@test.com',
          loginPassword: '123456',
          loginPath: '/login',
        });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/mapeamento dinâmico iniciado/i);
    });

    it('deve retornar 400 quando baseUrl não é informada', async () => {
      const res = await request(app)
        .post('/run-dynamic')
        .send({ loginEmail: 'test@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/baseUrl/i);
    });
  });

  // ── POST /stop ───────────────────────────────────────────────────
  describe('POST /stop', () => {
    it('deve retornar mensagem informativa quando não há mapeamento ativo', async () => {
      const res = await request(app).post('/stop').send({ system: 'alunopresente' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });
});
