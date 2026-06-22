// ============================================================
// Ponto de entrada — System Documenter Agent
// ============================================================

import { DocumenterEngine } from './documenter/DocumenterEngine';
import { AlunoPresenteProfile } from './profiles/AlunoPresenteProfile';

async function main(): Promise<void> {
  console.log('');
  console.log('📘 Mapeamento Automático — System Documenter Agent');
  console.log('   Modo: Documentação, Regras de Validação e Fluxogramas');
  console.log('');

  // Verificar se foram passadas páginas específicas via --pages
  const pagesArgIndex = process.argv.indexOf('--pages');
  let filterPages: string[] | undefined;

  if (pagesArgIndex !== -1 && process.argv[pagesArgIndex + 1]) {
    filterPages = process.argv[pagesArgIndex + 1].split(',').map(p => p.trim());
    console.log(`📋 Filtrando páginas: ${filterPages.join(', ')}`);
  }

  // Instancia o motor do Documenter com o perfil padrão
  const engine = new DocumenterEngine(AlunoPresenteProfile);

  try {
    const docPath = await engine.run(filterPages);
    console.log('');
    console.log('🎉 Mapeamento e Documentação concluídos com sucesso!');
    console.log(`📄 Documento gerado: ${docPath}`);
    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Erro fatal durante a documentação:', error);
    console.error('');
    process.exit(1);
  }
}

main();
