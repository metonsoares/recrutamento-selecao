// Inferência de sexo a partir do primeiro nome (melhor esforço, nomes brasileiros).
// Não há campo de sexo no cadastro — usado apenas para filtro.

const FEMALE = new Set([
  'beatriz', 'raquel', 'isabel', 'ester', 'esther', 'karen', 'karin', 'miriam', 'mirian', 'ruth',
  'eliane', 'daniele', 'danielle', 'rosane', 'rosangela', 'simone', 'ivone', 'adriane', 'helen', 'hellen',
  'alice', 'eunice', 'janice', 'denise', 'elaine', 'cristiane', 'cristina', 'luciane', 'viviane', 'juliane',
  'fabiane', 'lilian', 'lillian', 'ingrid', 'mercedes', 'dulce', 'cleide', 'neide', 'iris', 'doris',
  'carmen', 'carmem', 'eliete', 'ivete', 'odete', 'josiane', 'rosimar', 'rosemeire', 'meire', 'nair',
  'jaqueline', 'jacqueline', 'evelyn', 'evelin', 'jennifer', 'jeniffer', 'kimberly', 'kethlyn', 'sthefany',
  'thais', 'tais', 'lais', 'pietra', 'isis', 'agnes', 'leticia', 'mercia', 'marlene', 'darlene', 'charlene',
  'rute', 'judite', 'edite', 'conceicao', 'aparecida', 'glauciene', 'cintia', 'cynthia', 'gisele', 'giselle',
  'estefani', 'estefany', 'emilly', 'emilyn', 'kamilly', 'kamily', 'mayara', 'tamires', 'tamiris', 'camili',
])

const MALE = new Set([
  'lucas', 'mateus', 'matheus', 'tomas', 'thomas', 'jonas', 'elias', 'isaias', 'josias', 'dimas', 'tobias',
  'joao', 'joão', 'noah', 'kawan', 'cauã', 'caua', 'yuri', 'iuri', 'davi', 'levi', 'kaique', 'kaike',
  'gabriel', 'rafael', 'daniel', 'manuel', 'emanuel', 'israel', 'ismael', 'samuel', 'joel', 'ariel', 'miguel',
  'vinicius', 'tadeu', 'mateo', 'enzo', 'theo', 'benicio', 'murilo', 'danilo', 'camilo', 'marcelo', 'rodrigo',
  'jean', 'wesley', 'anderson', 'jacson', 'jackson', 'robson', 'jefferson', 'emerson', 'washington', 'wilson',
  'igor', 'heitor', 'hector', 'nestor', 'salvador', 'wallace', 'kawe', 'kauê', 'caue', 'andre', 'andré', 'jose', 'josé',
])

/** Retorna 'M' | 'F' | null a partir do nome completo. */
export function inferSex(fullName: string | null | undefined): 'M' | 'F' | null {
  if (!fullName) return null
  const first = fullName.trim().toLowerCase().split(/\s+/)[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos para comparar
  if (!first) return null

  // dicionários (comparados sem acento)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const f of FEMALE) if (norm(f) === first) return 'F'
  for (const m of MALE) if (norm(m) === first) return 'M'

  // fallback por terminação
  const last = first.slice(-1)
  if (last === 'a') return 'F'
  return 'M'
}
