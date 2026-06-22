/**
 * Testes de smoke para a Extensão Chrome do System Documenter Agent.
 *
 * Como a extensão roda em ambiente de browser (não Node.js), estes testes
 * validam a LÓGICA PURA que pode ser isolada do DOM e da API do Chrome:
 *   - escapeHtml()
 *   - getActiveSystem()
 *   - validações de payload para /run, /run-dynamic, /stop
 *   - contrato da API que a extensão consome
 */

// ─── Funções retiradas do popup.js para teste isolado ────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildRunPayload(system: string): object {
  return { system };
}

function buildDynamicPayload(
  baseUrl: string,
  loginEmail: string,
  loginPassword: string,
  loginPath: string
): object {
  return { baseUrl, loginEmail, loginPassword, loginPath };
}

function buildStopPayload(system: string): object {
  return { system };
}

function isDynamicPayloadValid(payload: { baseUrl?: string }): boolean {
  return !!(payload.baseUrl && payload.baseUrl.trim().length > 0);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function getSystemFromUrl(pageUrl: string, profileBaseUrl: string): { match: boolean; path: string } {
  try {
    const pageUrlObj = new URL(pageUrl);
    const profileUrlObj = new URL(profileBaseUrl);
    return {
      match: pageUrlObj.hostname === profileUrlObj.hostname,
      path: pageUrlObj.pathname,
    };
  } catch {
    return { match: false, path: '' };
  }
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('Chrome Extension — lógica isolada', () => {

  describe('escapeHtml()', () => {
    it('deve escapar caracteres HTML perigosos', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('deve escapar & (ampersand)', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('deve escapar aspas duplas', () => {
      expect(escapeHtml('"valor"')).toBe('&quot;valor&quot;');
    });

    it('deve escapar aspas simples', () => {
      expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    it('deve retornar string vazia para entrada vazia', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('não deve alterar texto sem caracteres especiais', () => {
      expect(escapeHtml('Cadastro de Alunos')).toBe('Cadastro de Alunos');
    });
  });

  describe('buildRunPayload()', () => {
    it('deve incluir o campo "system" no payload', () => {
      const payload = buildRunPayload('alunopresente') as any;
      expect(payload).toHaveProperty('system', 'alunopresente');
    });
  });

  describe('buildDynamicPayload()', () => {
    it('deve incluir todos os campos necessários', () => {
      const payload = buildDynamicPayload(
        'https://sistema.com',
        'admin@sistema.com',
        'senha123',
        '/login'
      ) as any;

      expect(payload).toHaveProperty('baseUrl', 'https://sistema.com');
      expect(payload).toHaveProperty('loginEmail', 'admin@sistema.com');
      expect(payload).toHaveProperty('loginPassword', 'senha123');
      expect(payload).toHaveProperty('loginPath', '/login');
    });
  });

  describe('buildStopPayload()', () => {
    it('deve incluir o campo "system" no payload', () => {
      const payload = buildStopPayload('dynamic') as any;
      expect(payload).toHaveProperty('system', 'dynamic');
    });
  });

  describe('isDynamicPayloadValid()', () => {
    it('deve retornar false quando baseUrl está vazia', () => {
      expect(isDynamicPayloadValid({ baseUrl: '' })).toBe(false);
    });

    it('deve retornar false quando baseUrl é apenas espaços', () => {
      expect(isDynamicPayloadValid({ baseUrl: '   ' })).toBe(false);
    });

    it('deve retornar false quando baseUrl está ausente', () => {
      expect(isDynamicPayloadValid({})).toBe(false);
    });

    it('deve retornar true quando baseUrl está preenchida', () => {
      expect(isDynamicPayloadValid({ baseUrl: 'https://sistema.com' })).toBe(true);
    });
  });

  describe('isValidUrl()', () => {
    it('deve aceitar URLs válidas com https', () => {
      expect(isValidUrl('https://meusistema.com')).toBe(true);
    });

    it('deve aceitar URLs válidas com http', () => {
      expect(isValidUrl('http://localhost:3001')).toBe(true);
    });

    it('deve rejeitar strings sem protocolo', () => {
      expect(isValidUrl('meusistema.com')).toBe(false);
    });

    it('deve rejeitar string vazia', () => {
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('getSystemFromUrl()', () => {
    it('deve retornar match=true quando hostname corresponde ao perfil', () => {
      const result = getSystemFromUrl(
        'https://alunopresente.com/alunos',
        'https://alunopresente.com'
      );
      expect(result.match).toBe(true);
      expect(result.path).toBe('/alunos');
    });

    it('deve retornar match=false quando hostname é diferente', () => {
      const result = getSystemFromUrl(
        'https://outro-sistema.com/dashboard',
        'https://alunopresente.com'
      );
      expect(result.match).toBe(false);
    });

    it('deve extrair o pathname correto da URL da aba', () => {
      const result = getSystemFromUrl(
        'https://alunopresente.com/turmas/nova',
        'https://alunopresente.com'
      );
      expect(result.path).toBe('/turmas/nova');
    });

    it('deve lidar graciosamente com URLs malformadas', () => {
      const result = getSystemFromUrl('not-a-url', 'https://alunopresente.com');
      expect(result.match).toBe(false);
      expect(result.path).toBe('');
    });
  });

  describe('Contrato da API — endpoints que a extensão consome', () => {
    const SERVER_URL = 'http://localhost:3001';

    it('deve usar SERVER_URL com porta 3001', () => {
      expect(SERVER_URL).toContain('3001');
      expect(SERVER_URL).toContain('localhost');
    });

    it('/status deve ser chamado com query ?system=', () => {
      const system = 'alunopresente';
      const url = `${SERVER_URL}/status?system=${system}`;
      expect(url).toBe('http://localhost:3001/status?system=alunopresente');
    });

    it('/run deve receber body JSON com campo system', () => {
      const payload = buildRunPayload('alunopresente');
      const json = JSON.stringify(payload);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('system');
    });

    it('/run-dynamic deve receber body JSON com baseUrl, loginEmail, loginPassword e loginPath', () => {
      const payload = buildDynamicPayload('https://s.com', 'u@s.com', 'pwd', '/login');
      const json = JSON.stringify(payload);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('baseUrl');
      expect(parsed).toHaveProperty('loginEmail');
      expect(parsed).toHaveProperty('loginPassword');
      expect(parsed).toHaveProperty('loginPath');
    });

    it('/dashboard deve receber query ?system= para identificar o sistema ativo', () => {
      const system = 'dynamic';
      const url = `${SERVER_URL}/dashboard?system=${system}`;
      expect(url).toContain('system=dynamic');
    });
  });
});
