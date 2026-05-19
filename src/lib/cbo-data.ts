/**
 * Tabela de consulta CBO (Classificação Brasileira de Ocupações) — MTE 2002
 * Cobre os grupos ocupacionais mais comuns no Brasil.
 * Fonte de referência: cbo.mte.gov.br
 */

export interface CboEntry {
  titulo: string
  descricao: string
}

export const CBO_TABLE: Record<string, CboEntry> = {
  // ── Alimentação / Confeitaria / Panificação ────────────────────────────────
  '7771-05': { titulo: 'Padeiro', descricao: 'Prepara massas de pão, biscoitos e outros produtos de panificação, operando fornos e equipamentos industriais ou artesanais. Controla temperatura, tempo de fermentação e qualidade dos produtos.' },
  '7771-10': { titulo: 'Confeiteiro', descricao: 'Elabora bolos, tortas, doces finos e sobremesas, utilizando técnicas de confeitaria artesanal e industrial. Decora produtos, controla qualidade e gerencia ingredientes.' },
  '7771-15': { titulo: 'Padeiro confeiteiro', descricao: 'Produz pães, bolos, biscoitos e produtos de confeitaria, combinando técnicas de panificação e confeitaria. Responsável pelo ciclo completo de produção, do preparo ao acabamento.' },
  '7772-05': { titulo: 'Operador de processo de fabricação de doces e conservas', descricao: 'Opera equipamentos de produção de doces, geleias, compotas e conservas alimentícias. Controla processo, higiene e qualidade dos produtos.' },
  '5131-05': { titulo: 'Garçom', descricao: 'Atende clientes em restaurantes, bares e estabelecimentos similares, tomando pedidos, servindo alimentos e bebidas, e prestando informações sobre o cardápio.' },
  '5131-10': { titulo: 'Barman', descricao: 'Prepara e serve drinques, coquetéis e bebidas em bares, restaurantes e casas noturnas. Gerencia o estoque de bebidas e atende clientes no balcão.' },
  '5131-15': { titulo: 'Cumim', descricao: 'Auxilia garçons no atendimento de mesas, transportando pedidos, retirando louças e mantendo a organização do salão de restaurantes e similares.' },
  '5132-05': { titulo: 'Cozinheiro geral', descricao: 'Prepara refeições completas em restaurantes, refeitórios e similares, elaborando pratos frios e quentes, controlando o processo de cocção e a qualidade dos alimentos.' },
  '5132-10': { titulo: 'Cozinheiro de restaurante', descricao: 'Elabora cardápios e prepara refeições em restaurantes comerciais. Supervisiona a mise en place, controla estoque de ingredientes e assegura padrões de higiene e qualidade.' },
  '5141-05': { titulo: 'Atendente de bar', descricao: 'Serve bebidas e alimentos em bares e estabelecimentos similares, recebe pagamentos e mantém o ambiente limpo e organizado. Atende pedidos de clientes e repõe estoque.' },
  '5142-05': { titulo: 'Auxiliar de cozinha', descricao: 'Auxilia na preparação de alimentos, higienizando vegetais, cortando ingredientes, lavando utensílios e mantendo a organização e higiene da cozinha.' },
  '5142-10': { titulo: 'Auxiliar de copa e cozinha', descricao: 'Realiza atividades de apoio na cozinha e copa, como lavagem de louças, organização de despensa, distribuição de refeições e limpeza de equipamentos.' },
  '5143-05': { titulo: 'Copeiro', descricao: 'Prepara e serve lanches, cafés e bebidas em cantinas, refeitórios e residências. Mantém a organização e higiene da copa, controla estoque de suprimentos.' },

  // ── Vendas e Atendimento ──────────────────────────────────────────────────
  '5211-05': { titulo: 'Vendedor de comércio varejista', descricao: 'Atende clientes em estabelecimentos comerciais, apresenta produtos, realiza vendas, emite notas fiscais e controla estoque. Orienta clientes sobre características dos produtos.' },
  '5211-10': { titulo: 'Vendedor pracista', descricao: 'Realiza vendas externas de produtos, visitando clientes, negociando pedidos, prospectando novos clientes e atingindo metas comerciais.' },
  '5211-25': { titulo: 'Promotor de vendas', descricao: 'Promove produtos e marcas em pontos de venda, realiza demonstrações, abastece gôndolas, verifica preços e monitora a exposição dos produtos no varejo.' },
  '4221-05': { titulo: 'Operador de caixa', descricao: 'Opera caixa registradora ou sistema PDV para registrar vendas, receber pagamentos em dinheiro, cartão e voucher, emitir comprovantes e fechar o caixa ao final do turno.' },
  '5212-05': { titulo: 'Balconista', descricao: 'Atende clientes no balcão de estabelecimentos comerciais, apresenta produtos, realiza vendas, organiza mercadorias e mantém o espaço limpo e abastecido.' },

  // ── Gestão e Administração ────────────────────────────────────────────────
  '1421-05': { titulo: 'Gerente de loja e supermercado', descricao: 'Gerencia as operações de lojas e supermercados, coordenando equipes, controlando estoques, monitorando resultados financeiros e garantindo a satisfação dos clientes.' },
  '1422-05': { titulo: 'Gerente de vendas', descricao: 'Planeja e coordena atividades de vendas, define metas, gerencia equipe comercial, analisa resultados e desenvolve estratégias para ampliar a carteira de clientes.' },
  '1411-05': { titulo: 'Gerente administrativo', descricao: 'Coordena atividades administrativas da empresa, gerenciando equipes, processos, documentos, contratos e recursos, garantindo eficiência operacional.' },
  '1412-05': { titulo: 'Gerente de produção e operações', descricao: 'Planeja, organiza e controla processos produtivos, gerenciando equipes, recursos e qualidade para atingir metas de produção com eficiência e segurança.' },
  '4101-05': { titulo: 'Supervisor administrativo', descricao: 'Supervisiona equipes e processos administrativos, coordenando rotinas de escritório, controlando documentos e garantindo o cumprimento de prazos e procedimentos.' },
  '4110-05': { titulo: 'Auxiliar administrativo', descricao: 'Realiza tarefas administrativas como digitação, arquivo, atendimento telefônico, controle de documentos, elaboração de planilhas e suporte geral às equipes.' },
  '4110-10': { titulo: 'Assistente administrativo', descricao: 'Executa atividades de suporte administrativo, incluindo controle de documentos, agendamentos, elaboração de relatórios e comunicação interna e externa.' },
  '4110-15': { titulo: 'Auxiliar de escritório', descricao: 'Presta suporte em atividades de escritório como recepção, arquivo, digitação, protocolo de documentos e atendimento ao público.' },

  // ── Recursos Humanos ──────────────────────────────────────────────────────
  '2521-05': { titulo: 'Analista de recursos humanos', descricao: 'Desenvolve e implementa políticas e processos de RH, incluindo recrutamento, seleção, treinamento, remuneração e gestão de desempenho.' },
  '2522-05': { titulo: 'Técnico em recursos humanos', descricao: 'Apoia processos de recrutamento, seleção, treinamento e administração de pessoal, realizando triagem de currículos, entrevistas e controles de folha de pagamento.' },
  '4151-05': { titulo: 'Auxiliar de pessoal', descricao: 'Auxilia nas rotinas de departamento pessoal, incluindo admissões, demissões, controle de ponto, férias e elaboração de documentos trabalhistas.' },

  // ── Financeiro / Contabilidade ────────────────────────────────────────────
  '2522-10': { titulo: 'Analista financeiro', descricao: 'Analisa e controla fluxo de caixa, contas a pagar e receber, prepara relatórios financeiros e apoia decisões estratégicas com base em dados econômico-financeiros.' },
  '4131-05': { titulo: 'Auxiliar de contabilidade', descricao: 'Auxilia contadores em tarefas como lançamentos contábeis, conciliação bancária, controle de notas fiscais e elaboração de demonstrativos financeiros.' },
  '2523-05': { titulo: 'Contador', descricao: 'Registra, analisa e interpreta fatos contábeis e financeiros, elabora demonstrações contábeis, apura impostos e assessora a gestão empresarial em decisões econômicas.' },

  // ── TI e Tecnologia ───────────────────────────────────────────────────────
  '2122-05': { titulo: 'Analista de desenvolvimento de sistemas', descricao: 'Desenvolve e mantém sistemas de informação, analisando requisitos, codificando soluções, testando funcionalidades e documentando sistemas de software.' },
  '2123-05': { titulo: 'Analista de suporte computacional', descricao: 'Presta suporte técnico a usuários de sistemas de informática, diagnosticando e solucionando problemas de hardware, software e redes.' },
  '3172-05': { titulo: 'Técnico de suporte em tecnologia da informação', descricao: 'Instala, configura e mantém equipamentos de informática e redes, presta suporte técnico e orienta usuários na utilização de sistemas e equipamentos.' },

  // ── Marketing e Comunicação ───────────────────────────────────────────────
  '2531-05': { titulo: 'Profissional de marketing', descricao: 'Planeja e executa estratégias de marketing, gerenciando campanhas publicitárias, pesquisas de mercado, redes sociais e identidade de marca.' },
  '3731-05': { titulo: 'Designer gráfico', descricao: 'Cria materiais visuais para comunicação impressa e digital, desenvolvendo logotipos, embalagens, peças publicitárias e layouts de sites e redes sociais.' },

  // ── Logística e Transporte ────────────────────────────────────────────────
  '9821-05': { titulo: 'Motoboy', descricao: 'Realiza entrega de mercadorias, documentos e refeições utilizando motocicleta, otimizando rotas e garantindo a entrega no prazo estabelecido.' },
  '8487-05': { titulo: 'Motorista entregador', descricao: 'Transporta e entrega mercadorias, utilizando veículo leve ou utilitário, verificando documentos, confirmando recebimentos e mantendo o veículo em boas condições.' },
  '5193-05': { titulo: 'Motoentregador', descricao: 'Efetua entregas de produtos e encomendas por aplicativos ou diretamente para estabelecimentos, utilizando motocicleta e seguindo rotas definidas.' },
  '4141-05': { titulo: 'Almoxarife', descricao: 'Controla entrada e saída de materiais em almoxarifado, realiza inventários, organiza estoques e emite notas e requisições de materiais.' },
  '4142-05': { titulo: 'Auxiliar de almoxarifado', descricao: 'Apoia o controle de estoque, organizando materiais, conferindo mercadorias, separando pedidos e mantendo o almoxarifado em ordem.' },
  '4141-10': { titulo: 'Controlador de estoque', descricao: 'Registra e controla entradas e saídas de produtos em estoque, realiza inventários periódicos, identifica divergências e garante a acuracidade do inventário.' },

  // ── Limpeza e Conservação ─────────────────────────────────────────────────
  '5143-20': { titulo: 'Faxineiro', descricao: 'Realiza serviços gerais de limpeza e conservação em edificações comerciais, industriais ou residenciais, varrendo, lavando, passando pano e organizando ambientes.' },
  '5143-25': { titulo: 'Auxiliar de serviços gerais', descricao: 'Executa serviços de limpeza, conservação e organização de ambientes, incluindo varrição, lavagem de pisos, limpeza de sanitários e recolhimento de lixo.' },
  '5191-10': { titulo: 'Porteiro de edifícios', descricao: 'Controla acesso de pessoas e veículos a edifícios comerciais ou residenciais, monitora câmeras de segurança, recebe correspondências e orienta visitantes.' },

  // ── Saúde ─────────────────────────────────────────────────────────────────
  '2231-05': { titulo: 'Médico clínico', descricao: 'Realiza consultas médicas, diagnostica doenças, prescreve tratamentos e acompanha a evolução clínica de pacientes em hospitais, clínicas ou consultórios.' },
  '2235-10': { titulo: 'Enfermeiro assistencial', descricao: 'Presta cuidados de enfermagem a pacientes, planejando e executando procedimentos, administrando medicamentos e supervisionando a equipe de técnicos de enfermagem.' },
  '3222-05': { titulo: 'Técnico de enfermagem', descricao: 'Presta assistência de enfermagem sob supervisão, realizando curativos, administrando medicamentos, coletando material para exames e monitorando sinais vitais.' },

  // ── Educação ──────────────────────────────────────────────────────────────
  '2312-05': { titulo: 'Professor de ensino médio', descricao: 'Planeja e ministra aulas para alunos do ensino médio, desenvolvendo conteúdos curriculares, avaliando aprendizagem e estimulando o desenvolvimento dos estudantes.' },
  '2313-05': { titulo: 'Professor de ensino fundamental', descricao: 'Planeja e ministra aulas para alunos do ensino fundamental, desenvolvendo habilidades cognitivas e socioemocionais por meio de metodologias pedagógicas diversificadas.' },

  // ── Segurança ─────────────────────────────────────────────────────────────
  '5173-05': { titulo: 'Vigilante', descricao: 'Realiza vigilância e segurança patrimonial em estabelecimentos comerciais, industriais ou residenciais, controlando acesso, monitorando câmeras e prevenindo ocorrências.' },

  // ── Construção ────────────────────────────────────────────────────────────
  '7210-05': { titulo: 'Pedreiro', descricao: 'Executa trabalhos de alvenaria, assentando tijolos, blocos e pedras, aplicando argamassa e revestimentos em construções residenciais, comerciais e industriais.' },
  '7244-05': { titulo: 'Eletricista de instalações', descricao: 'Instala, mantém e repara instalações elétricas prediais, incluindo fiação, quadros de distribuição, tomadas, interruptores e iluminação.' },
  '7251-05': { titulo: 'Encanador', descricao: 'Instala e repara sistemas hidráulicos e sanitários, incluindo tubulações, torneiras, chuveiros, vasos sanitários e caixas d\'água.' },

  // ── Recepção e Atendimento ────────────────────────────────────────────────
  '4221-10': { titulo: 'Recepcionista em geral', descricao: 'Recepciona clientes, fornecedores e visitantes, presta informações, agenda compromissos, controla acesso e realiza atendimento telefônico.' },
  '4222-05': { titulo: 'Recepcionista de hotel', descricao: 'Realiza check-in e check-out de hóspedes, gerencia reservas, fornece informações sobre o hotel e a cidade, e garante a satisfação dos clientes.' },
  '5114-25': { titulo: 'Atendente de lanchonete', descricao: 'Atende clientes em lanchonetes e similares, anota e prepara pedidos, serve lanches e bebidas, cobra e mantém a limpeza do local de trabalho.' },

  // ── Indústria / Produção ──────────────────────────────────────────────────
  '7613-05': { titulo: 'Operador de máquina industrial', descricao: 'Opera e monitora máquinas e equipamentos industriais, ajusta parâmetros de produção, realiza manutenções básicas e garante a qualidade dos produtos manufaturados.' },
  '9999-05': { titulo: 'Trabalhador braçal', descricao: 'Realiza trabalhos manuais de carga, descarga, limpeza e serviços gerais que requerem esforço físico, sem exigência de qualificação técnica específica.' },

  // ── Estética e Beleza ─────────────────────────────────────────────────────
  '5161-05': { titulo: 'Cabeleireiro', descricao: 'Corta, lava, tinge e faz penteados em cabelos de clientes, utilizando técnicas e produtos específicos de cabeleireiro em salões de beleza e similares.' },
  '5163-05': { titulo: 'Manicure e pedicure', descricao: 'Cuida das unhas das mãos e pés de clientes, realizando limpeza, corte, lixamento, aplicação de esmalte e tratamentos estéticos em salões de beleza.' },

  // ── Produção Alimentícia / Indústria de Alimentos ─────────────────────────
  '8483-05': { titulo: 'Operador de processo de fabricação de alimentos', descricao: 'Opera equipamentos e máquinas de produção alimentícia, controla processos de fabricação, manipula matérias-primas e garante qualidade e higiene dos produtos.' },
  '8484-05': { titulo: 'Operador de equipamentos de produção de bebidas e alimentos', descricao: 'Opera e monitora equipamentos industriais para produção de bebidas e alimentos, realizando ajustes e verificações de qualidade durante o processo produtivo.' },
  '7711-05': { titulo: 'Operador de processo de fabricação de cerveja', descricao: 'Executa operações de produção de cerveja e bebidas fermentadas, controlando temperatura, fermentação e qualidade dos produtos.' },
  '8485-05': { titulo: 'Trabalhador de fabricação de alimentos e bebidas', descricao: 'Realiza operações diversas no processo de fabricação de alimentos e bebidas, incluindo mistura, embalagem, controle de qualidade e limpeza de equipamentos.' },
  '7711-15': { titulo: 'Operador de fabricação de doces, chocolates e balas', descricao: 'Produz doces, chocolates, balas e confeitos, operando máquinas específicas, controlando processos de cocção, resfriamento e acabamento dos produtos.' },
  '7712-05': { titulo: 'Auxiliar de produção de alimentos', descricao: 'Apoia operações de produção alimentícia, realizando tarefas de preparo de ingredientes, limpeza de equipamentos, embalagem e controle básico de qualidade.' },
  '7712-10': { titulo: 'Auxiliar de linha de produção', descricao: 'Executa tarefas de apoio na linha de produção, como abastecimento de máquinas, embalagem de produtos, organização de materiais e manutenção da higiene do ambiente.' },
  '8487-10': { titulo: 'Operador de embalagem', descricao: 'Realiza embalagem de produtos manufaturados, operando máquinas de envase, selagem e rotulagem, garantindo a qualidade e integridade das embalagens.' },

  // ── Atendimento específico food service ───────────────────────────────────
  '5114-05': { titulo: 'Atendente de fast food', descricao: 'Atende clientes em estabelecimentos de fast food, toma pedidos, prepara alimentos simples, opera caixa e mantém organização e higiene do ambiente de trabalho.' },
  '5114-10': { titulo: 'Atendente de cafeteria', descricao: 'Prepara e serve café, chás, sucos e alimentos em cafeterias, realiza atendimento ao cliente, cobra pedidos e mantém o ambiente limpo e organizado.' },
  '5114-15': { titulo: 'Atendente de padaria', descricao: 'Atende clientes em padarias, organiza e expõe produtos, realiza vendas de pães, bolos e outros itens, opera caixa e mantém a higiene do estabelecimento.' },
  '5114-30': { titulo: 'Auxiliar de serviços de alimentação', descricao: 'Apoia serviços de alimentação em restaurantes, padarias e similares, realizando limpeza, organização, reposição de produtos e apoio geral às equipes.' },

  // ── Compras / Suprimentos ─────────────────────────────────────────────────
  '1521-05': { titulo: 'Comprador', descricao: 'Realiza pesquisas de mercado, negocia com fornecedores, emite pedidos de compra, controla prazos de entrega e garante o abastecimento de materiais e mercadorias.' },
  '4143-05': { titulo: 'Auxiliar de compras', descricao: 'Apoia o processo de compras, cotando preços com fornecedores, emitindo pedidos, acompanhando entregas e mantendo registros atualizados de fornecedores e contratos.' },

  // ── Estagiário / Aprendiz ─────────────────────────────────────────────────
  '4130-05': { titulo: 'Escriturário em geral', descricao: 'Executa tarefas variadas de escritório como digitação, arquivo, protocolo, atendimento e suporte administrativo em empresas de qualquer setor.' },
}

/**
 * Formata código CBO para o padrão XXXX-XX
 */
export function formatCboCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  return digits.length >= 5 ? digits.slice(0, 4) + '-' + digits.slice(4) : digits
}

/**
 * Busca um código CBO na tabela estática.
 * Aceita formatos: "422105", "4221-05", "4221 05"
 */
export function lookupCbo(code: string): (CboEntry & { codigo: string }) | null {
  const digits = code.replace(/\D/g, '')
  if (digits.length < 5) return null
  const formatted = formatCboCode(digits)
  const entry = CBO_TABLE[formatted]
  if (!entry) return null
  return { codigo: formatted, ...entry }
}
