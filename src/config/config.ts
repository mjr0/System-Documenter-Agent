import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  /** URL base do sistema */
  baseUrl: process.env.BASE_URL || 'https://alunopresente.servicent.com.br',

  /** Credenciais de login */
  loginEmail: process.env.LOGIN_EMAIL || '',
  loginPassword: process.env.LOGIN_PASSWORD || '',

  /** Timeout padrão para carregamento de página (ms) */
  defaultTimeout: 30000,

  /** Limite para considerar uma página "lenta" (ms) */
  slowPageThreshold: 3000,

  /** Diretório para salvar screenshots */
  screenshotsDir: path.resolve(__dirname, '../../screenshots'),

  /** Diretório para salvar relatórios */
  reportsDir: path.resolve(__dirname, '../../reports'),

  /** Se deve rodar com navegador visível */
  headed: process.argv.includes('--headed'),

  /** Largura do viewport */
  viewportWidth: 1920,

  /** Altura do viewport */
  viewportHeight: 1080,
};
