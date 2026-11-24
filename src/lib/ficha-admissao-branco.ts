/**
 * Ficha de admissão EM BRANCO, para o funcionário preencher à mão.
 *
 * Pedido do dono em 24/11/2026: ele precisa imprimir a ficha e entregar para
 * quem está entrando. Por isso o PDF traz só o que a PESSOA preenche — o bloco
 * "Dados do Empregador" (cargo, salário, data de admissão, contrato de
 * experiência, adicionais e prêmio) fica de fora, porque é a empresa que
 * responde, depois, na ficha do sistema.
 *
 * Os campos e a ordem são os mesmos da Ficha de Admissão do sistema (ver
 * `ficha-admissao-form.tsx` e a ficha impressa): quem preencher o papel vai
 * achar tudo no mesmo lugar na hora de digitar.
 *
 * Gerado na hora, no navegador, pelo jsPDF (import dinâmico — a biblioteca é
 * pesada e só entra quando alguém baixa).
 */

/** Um campo do formulário: só o rótulo; o valor é a linha em branco. */
type Campo = { label: string; largura?: 1 | 2; opcoes?: string[]; altura?: number }
type Secao = { titulo: string; campos: Campo[] }

const SIM_NAO = ['Sim', 'Não']

const SECOES: Secao[] = [
  {
    titulo: 'Dados do Funcionário',
    campos: [
      { label: 'Nome completo', largura: 2 },
      { label: 'CPF' },
      { label: 'E-mail' },
      { label: 'Telefone celular' },
      { label: 'Telefone fixo' },
      { label: 'Contato de emergência' },
      { label: 'Telefone do contato' },
      { label: 'Contato de emergência 2' },
      { label: 'Telefone do contato' },
      { label: 'CEP' },
      { label: 'Bairro' },
      { label: 'Endereço (rua, nº e complemento)', largura: 2 },
      { label: 'Cidade' },
      { label: 'Estado civil' },
      { label: 'Nº do PIS' },
      { label: 'Data de cadastro do PIS' },
      { label: 'Nº da identidade (RG)' },
      { label: 'Data de emissão (RG)' },
      { label: 'Grau de escolaridade', largura: 2 },
      { label: 'Desconta mensalidade sindical?', opcoes: SIM_NAO },
      { label: 'Quer vale transporte?', opcoes: SIM_NAO },
    ],
  },
  {
    titulo: 'Salário Família / Dependentes',
    campos: [
      { label: 'Filhos menores de 14 anos (quantos)' },
      { label: 'Paga pensão alimentícia?', opcoes: SIM_NAO },
    ],
  },
  {
    titulo: 'Vale Transporte',
    campos: [
      { label: 'Empresa de transporte' },
      { label: 'Passagens por dia' },
    ],
  },
  {
    titulo: 'Observações',
    // Sem rótulo: o título da seção já diz o que é, e repetir "OBSERVAÇÕES"
    // em cima da caixa só gastava linha.
    campos: [{ label: '', largura: 2, altura: 54 }],
  },
]

/** Nome do arquivo baixado. */
export const NOME_FICHA_BRANCO = 'Ficha de admissao - para preencher.pdf'

export async function gerarFichaAdmissaoBranco(): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  const margem = 40
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  const colunaLargura = (largura - 14) / 2
  let y = 52

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20, 48, 37) // verde escuro da marca
  doc.text('FICHA DE ADMISSÃO', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text('Preencha com letra legível e entregue ao RH.', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })
  y += 18

  /** Quebra de página mantendo a margem de baixo livre para a assinatura. */
  function espaco(altura: number) {
    if (y + altura > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage()
      y = 52
    }
  }

  /**
   * `alturaDoPrimeiro` entra na conta de propósito: sem isso o título de uma
   * seção cabia no pé da página e o primeiro campo ia para a seguinte —
   * "OBSERVAÇÕES" ficou sozinho no rodapé na primeira geração.
   */
  function tituloSecao(texto: string, alturaDoPrimeiro = 20) {
    espaco(34 + alturaDoPrimeiro + 16)
    y += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(110)
    doc.text(texto.toUpperCase(), margem, y)
    y += 5
    doc.setDrawColor(210)
    doc.line(margem, y, margem + largura, y)
    y += 13
  }

  /** Desenha um campo: rótulo pequeno e a caixa vazia embaixo. */
  function campo(c: Campo, x: number, w: number) {
    const altura = c.altura ?? 20
    if (c.label) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(110)
      doc.text(c.label.toUpperCase(), x, y)
    }
    const topo = y + 4
    doc.setDrawColor(190)
    doc.roundedRect(x, topo, w, altura, 3, 3)
    // Sim/Não vira quadradinho para marcar — ninguém escreve "sim" numa caixa.
    if (c.opcoes) {
      let cx = x + 10
      doc.setFontSize(9)
      doc.setTextColor(60)
      for (const op of c.opcoes) {
        doc.rect(cx, topo + altura / 2 - 5, 10, 10)
        doc.text(op, cx + 15, topo + altura / 2 + 3.5)
        cx += 15 + doc.getTextWidth(op) + 22
      }
    }
    return altura + 16
  }

  for (const secao of SECOES) {
    tituloSecao(secao.titulo, secao.campos[0]?.altura ?? 20)
    let i = 0
    while (i < secao.campos.length) {
      const atual = secao.campos[i]
      const proximo = secao.campos[i + 1]
      const duplo = (atual.largura ?? 1) === 1 && proximo && (proximo.largura ?? 1) === 1
      espaco((atual.altura ?? 20) + 20)
      if (duplo) {
        const a = campo(atual, margem, colunaLargura)
        const b = campo(proximo, margem + colunaLargura + 14, colunaLargura)
        y += Math.max(a, b)
        i += 2
      } else {
        y += campo(atual, margem, largura)
        i += 1
      }
    }
  }

  // ── Assinatura ──
  espaco(90)
  y += 26
  doc.setDrawColor(120)
  doc.line(margem, y, margem + 250, y)
  doc.line(margem + largura - 170, y, margem + largura, y)
  y += 13
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text('Assinatura do funcionário', margem, y)
  doc.text('Data: ____ / ____ / ________', margem + largura - 170, y)

  return doc.output('blob')
}
