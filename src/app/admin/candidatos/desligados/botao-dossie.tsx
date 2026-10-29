'use client'
import { useState } from 'react'
import PizZip from 'pizzip'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FolderArchive, Loader2, AlertCircle } from 'lucide-react'
import { formatDate, formatName } from '@/lib/helpers'

/**
 * Baixa TODOS os anexos de um colaborador num ZIP, uma pasta por aba da ficha,
 * com o Resumo em PDF na raiz.
 *
 * O ZIP é montado AQUI, no navegador: a API só devolve o inventário com uma URL
 * assinada por arquivo e o navegador busca cada um direto no Storage. Fazer o
 * pacote no servidor esbarraria no limite de ~4,5 MB da Vercel — um dossiê
 * passa disso fácil.
 */

interface Resumo {
  nome: string; cargo: string | null; empresa: string | null; status: string | null
  cpf: string | null; telefone: string | null; email: string | null; cidade: string | null
  idade: number | null; admissao: string | null; salario: string | null
  desligamento: string | null; solicitante: string | null
  advertencias: number; atestados: number; ferias: number; cadastradoEm: string | null
}
interface ArquivoDossie { pasta: string; nome: string; url: string }

const SOLICITANTE: Record<string, string> = {
  funcionario: 'Solicitado pelo funcionário',
  empresa: 'A empresa desligou',
}

function pdfDoResumo(r: Resumo): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const nome = formatName(r.nome)

  doc.setFontSize(16)
  doc.text(nome, 40, 48)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(
    [r.cargo, r.empresa].filter(Boolean).join('  ·  ') || 'Colaborador',
    40, 66,
  )
  doc.setTextColor(0)

  const linhas: [string, string][] = [
    ['Situação', r.status === 'desligado' ? 'Desligado' : (r.status ?? '—')],
    ['Data de desligamento', r.desligamento ? formatDate(r.desligamento) : '—'],
    ['Solicitante do desligamento', r.solicitante ? (SOLICITANTE[r.solicitante] ?? r.solicitante) : '—'],
    ['Admissão', r.admissao ? formatDate(r.admissao) : '—'],
    ['Salário', r.salario || '—'],
    ['CPF', r.cpf || '—'],
    ['Idade', r.idade != null ? `${r.idade} anos` : '—'],
    ['Telefone', r.telefone || '—'],
    ['E-mail', r.email || '—'],
    ['Cidade', r.cidade || '—'],
    ['Advertências', String(r.advertencias)],
    ['Atestados', String(r.atestados)],
    ['Períodos de férias', String(r.ferias)],
    ['Cadastrado em', r.cadastradoEm ? formatDate(r.cadastradoEm) : '—'],
  ]

  autoTable(doc, {
    startY: 86,
    head: [['Resumo', '']],
    body: linhas,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [26, 92, 56] },
    columnStyles: { 0: { cellWidth: 190, fontStyle: 'bold' } },
  })

  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — Banco de Talentos do Ton`,
    40, doc.internal.pageSize.getHeight() - 28,
  )

  return doc.output('arraybuffer')
}

export function BotaoDossie({ candidateId, nome }: { candidateId: string; nome: string }) {
  const [ocupado, setOcupado] = useState(false)
  const [passo, setPasso] = useState('')
  const [erro, setErro] = useState('')

  async function baixar(e: React.MouseEvent) {
    // A linha inteira é clicável e leva para a ficha — aqui não.
    e.stopPropagation()
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setErro(''); setPasso('Lendo a ficha...')

    try {
      const res = await fetch(`/api/admin/candidatos/${candidateId}/dossie`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Não foi possível montar o dossiê.')

      const arquivos = (d.arquivos ?? []) as ArquivoDossie[]
      const zip = new PizZip()
      zip.file(`Resumo - ${formatName(nome)}.pdf`, pdfDoResumo(d.resumo as Resumo), { binary: true })

      // Dois arquivos com o mesmo nome na mesma pasta: o segundo vira "(2)".
      const usados = new Set<string>()
      let baixados = 0
      for (const a of arquivos) {
        setPasso(`Baixando ${baixados + 1} de ${arquivos.length}...`)
        let caminho = `${a.pasta}/${a.nome}`
        if (usados.has(caminho)) {
          const ponto = a.nome.lastIndexOf('.')
          const base = ponto > 0 ? a.nome.slice(0, ponto) : a.nome
          const ext = ponto > 0 ? a.nome.slice(ponto) : ''
          let n = 2
          while (usados.has(`${a.pasta}/${base} (${n})${ext}`)) n++
          caminho = `${a.pasta}/${base} (${n})${ext}`
        }
        usados.add(caminho)

        try {
          const r = await fetch(a.url)
          if (!r.ok) continue   // arquivo sumiu do Storage: segue sem ele
          zip.file(caminho, await r.arrayBuffer(), { binary: true })
          baixados++
        } catch { /* rede falhou neste arquivo; os outros continuam */ }
      }

      setPasso('Compactando...')
      const blob = zip.generate({ type: 'blob', compression: 'DEFLATE' }) as Blob
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `Dossie - ${formatName(nome)}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000)

      if (baixados < arquivos.length) {
        setErro(`${arquivos.length - baixados} arquivo(s) não vieram; o resto está no ZIP.`)
      }
    } catch (err) {
      setErro((err as Error).message || 'Falha ao montar o dossiê.')
    } finally {
      setOcupado(false); setPasso('')
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={baixar}
        disabled={ocupado}
        title={erro || 'Baixar todos os documentos (ZIP)'}
        aria-label="Baixar todos os documentos em ZIP"
        className={`p-1.5 rounded-lg transition-colors shrink-0 ${
          erro ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-rose-700 hover:bg-rose-50'
        } disabled:opacity-60`}
      >
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderArchive className="w-4 h-4" />}
      </button>
      {ocupado && <span className="text-[11px] text-muted-foreground whitespace-nowrap">{passo}</span>}
      {!ocupado && erro && (
        <span className="text-[11px] text-red-600 inline-flex items-center gap-1 max-w-[220px]">
          <AlertCircle className="w-3 h-3 shrink-0" />{erro}
        </span>
      )}
    </span>
  )
}
