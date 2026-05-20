import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/helpers'
import { AutoPrint } from './auto-print'

// ─── Field types to hide from the experience form ─────────────────────────────
const HIDE_FIELD_TYPES = new Set([
  'date', 'celular', 'email', 'job_select', 'address', 'file_upload', 'cpf', 'cep',
])
const HIDE_QUESTION_PATTERNS = [
  'nome completo', 'endereço', 'bairro', 'cidade', 'telefone', 'celular',
  'e-mail', 'email', 'vaga de interesse', 'anexe',
]

function parseAnswer(text: string | null): string {
  if (!text) return '—'
  try {
    const p = JSON.parse(text)
    if (typeof p === 'string') return p
    if (Array.isArray(p)) return p.join(', ')
    if (typeof p === 'object' && p !== null) {
      const parts = [p.street, p.number, p.complement, p.neighborhood, p.city, p.state].filter(Boolean)
      return parts.join(', ') || JSON.stringify(p)
    }
    return String(p)
  } catch { return text }
}

function calculateAge(dateStr: string): number {
  const birth = new Date(dateStr)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--
  return age
}

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null
  const color = value >= 70 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{Math.round(value)}%</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
        <div style={{ background: color, width: `${value}%`, height: 6, borderRadius: 4 }} />
      </div>
    </div>
  )
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: candidate } = await supabase
    .from('candidates').select('*').eq('id', id).single()
  if (!candidate) notFound()

  const { data: applications } = await supabase
    .from('applications').select('*, jobs(title)')
    .eq('candidate_id', id).order('created_at', { ascending: false })

  const latestApp = applications?.[0]

  const { data: formAnswers } = latestApp ? await supabase
    .from('form_answers')
    .select('*, form_questions(question_text, field_type, category)')
    .eq('application_id', latestApp.id) : { data: [] }

  const { data: cultureAnswers } = latestApp ? await supabase
    .from('culture_answers')
    .select('*, culture_questions(question_text)')
    .eq('application_id', latestApp.id) : { data: [] }

  // Extract key fields
  const photoUrl = parseAnswer(
    (formAnswers || []).find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'file_upload')?.answer_text ?? null
  )
  const cpf = parseAnswer(
    (formAnswers || []).find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'cpf')?.answer_text ?? null
  )
  const birthDateRaw = parseAnswer(
    (formAnswers || []).find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'date')?.answer_text ?? null
  )
  const addressRaw = parseAnswer(
    (formAnswers || []).find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'address')?.answer_text ?? null
  )

  const birthDate = birthDateRaw !== '—' ? birthDateRaw : null
  const age = birthDate ? calculateAge(birthDate) : null
  const jobTitle = (latestApp?.jobs as { title?: string } | null)?.title

  // Filter experience form
  const filteredAnswers = (formAnswers || []).filter(a => {
    const q = a.form_questions as { question_text?: string; field_type?: string } | null
    if (!q) return false
    if (HIDE_FIELD_TYPES.has(q.field_type ?? '')) return false
    const qLower = (q.question_text ?? '').toLowerCase()
    if (HIDE_QUESTION_PATTERNS.some(p => qLower.includes(p))) return false
    return true
  })

  return (
    <>
      <AutoPrint />
      <style>{`
        @page { size: A4 portrait; margin: 1.2cm; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.4; margin: 0; }
        .no-print { display: none !important; }
        @media print { .no-print { display: none !important; } }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 8 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', borderBottom: '2px solid #1a5c38', paddingBottom: 12, marginBottom: 12 }}>
          {/* 3x4 photo */}
          <div style={{ flexShrink: 0, width: 80, height: 107, border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {photoUrl !== '—' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: '#9ca3af', fontSize: 10, textAlign: 'center' }}>Sem foto</span>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a5c38' }}>{candidate.full_name}</h1>
                {jobTitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Candidato para: {jobTitle}</p>}
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: '#166534', fontWeight: 600 }}>
                Currículo
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', marginTop: 8 }}>
              {candidate.phone && <span><b>Telefone:</b> {candidate.phone}</span>}
              {candidate.email && <span><b>E-mail:</b> {candidate.email}</span>}
              {cpf !== '—' && <span><b>CPF:</b> {cpf}</span>}
              {birthDate && <span><b>Nasc.:</b> {formatDate(birthDate)}{age != null ? ` (${age} anos)` : ''}</span>}
              {addressRaw !== '—' && <span style={{ gridColumn: '1/-1' }}><b>Endereço:</b> {addressRaw}</span>}
              {(candidate.neighborhood || candidate.city) && (
                <span><b>Bairro/Cidade:</b> {[candidate.neighborhood, candidate.city].filter(Boolean).join(', ')}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Scores ── */}
        {latestApp && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 11 }}>Compatibilidade</p>
              <ScoreBar label="Cultural" value={latestApp.culture_score} />
              <ScoreBar label="Experiência" value={latestApp.experience_score} />
              <ScoreBar label="Disponibilidade" value={latestApp.availability_score} />
              <ScoreBar label="Nota Final" value={latestApp.final_score} />
            </div>
            {latestApp.ai_summary && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 11 }}>Parecer da IA</p>
                <p style={{ margin: 0, fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
                  {latestApp.ai_summary}
                </p>
                {latestApp.ai_recommendation && (
                  <p style={{ margin: '6px 0 0', fontSize: 10, fontWeight: 600 }}>{latestApp.ai_recommendation}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Pontos fortes / atenção ── */}
        {((latestApp?.ai_strengths as string[])?.length > 0 || (latestApp?.ai_risks as string[])?.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {(latestApp?.ai_strengths as string[])?.length > 0 && (
              <div style={{ border: '1px solid #d1fae5', borderRadius: 6, padding: 10, background: '#f0fdf4' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 10, color: '#065f46' }}>Pontos Fortes</p>
                {(latestApp!.ai_strengths as string[]).map((s, i) => (
                  <p key={i} style={{ margin: '1px 0', fontSize: 10 }}>✓ {s}</p>
                ))}
              </div>
            )}
            {(latestApp?.ai_risks as string[])?.length > 0 && (
              <div style={{ border: '1px solid #fef3c7', borderRadius: 6, padding: 10, background: '#fffbeb' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 10, color: '#92400e' }}>Pontos de Atenção</p>
                {(latestApp!.ai_risks as string[]).map((s, i) => (
                  <p key={i} style={{ margin: '1px 0', fontSize: 10 }}>! {s}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Formulário de Experiência ── */}
        {filteredAnswers.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 11 }}>Formulário de Experiência</p>
            <div style={{ columns: 2, columnGap: 16 }}>
              {filteredAnswers.map(a => (
                <div key={a.id} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                  <p style={{ margin: 0, fontSize: 9, color: '#6b7280' }}>
                    {(a.form_questions as { question_text?: string } | null)?.question_text}
                  </p>
                  <p style={{ margin: '1px 0 0', fontSize: 10, fontWeight: 500 }}>
                    {parseAnswer(a.answer_text)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Teste Cultural ── */}
        {cultureAnswers && cultureAnswers.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 11 }}>Teste Cultural</p>
            <div style={{ columns: 2, columnGap: 16 }}>
              {cultureAnswers.map(a => (
                <div key={a.id} style={{ breakInside: 'avoid', marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 9, color: '#6b7280' }}>
                      {(a.culture_questions as { question_text?: string } | null)?.question_text}
                    </p>
                    <p style={{ margin: 0, fontSize: 10 }}>{a.selected_option || '—'}</p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: (a.score || 0) >= 8 ? '#10b981' : (a.score || 0) >= 5 ? '#f59e0b' : '#ef4444', flexShrink: 0 }}>
                    {a.score ?? 0}/10
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rodapé ── */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' }}>
          <span>Gerado em {new Date().toLocaleString('pt-BR')}</span>
          <span>Brownie do Ton — Sistema de Recrutamento</span>
        </div>

      </div>
    </>
  )
}
