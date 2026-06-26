import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { formatDate, formatName } from '@/lib/helpers'
import { AutoPrint } from './auto-print'
import { STATUS_LABELS, CandidateStatus } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="cv-section-title">{children}</p>
  )
}

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null
  const color = value >= 70 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="cv-score-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span className="cv-small">{label}</span>
        <span className="cv-small" style={{ fontWeight: 700, color }}>{Math.round(value)}%</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
        <div style={{ background: color, width: `${value}%`, height: 6, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="cv-info-row">
      <span className="cv-label">{label}</span>
      <span className="cv-value">{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    .select('*, culture_questions(question_text, culture_value)')
    .eq('application_id', latestApp.id) : { data: [] }

  // ── Extract key fields ────────────────────────────────────────────────────
  const allFa = formAnswers || []

  const photoUrl = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'file_upload')?.answer_text ?? null
  )
  const cpf = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'cpf')?.answer_text ?? null
  )
  const birthDateRaw = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'date')?.answer_text ?? null
  )
  const addressRaw = parseAnswer(
    allFa.find(a => (a.form_questions as { field_type?: string } | null)?.field_type === 'address')?.answer_text ?? null
  )

  const birthDate = birthDateRaw !== '—' ? birthDateRaw : null
  const age = birthDate ? calculateAge(birthDate) : null

  // Job title: join → job_id direto → form_answer job_select (pode ser UUID → lookup)
  let jobTitle = (latestApp?.jobs as { title?: string } | null)?.title ?? null

  if (!jobTitle && latestApp?.job_id) {
    const { data: jobRow } = await supabase
      .from('jobs').select('title').eq('id', latestApp.job_id).single()
    jobTitle = jobRow?.title ?? null
  }

  if (!jobTitle) {
    const jobAns = allFa.find(
      a => (a.form_questions as { field_type?: string } | null)?.field_type === 'job_select'
    )?.answer_text
    if (jobAns) {
      const parsed = parseAnswer(jobAns)
      if (parsed && parsed !== '—') {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidRe.test(parsed.trim())) {
          const { data: jobRow } = await supabase
            .from('jobs').select('title').eq('id', parsed.trim()).single()
          jobTitle = jobRow?.title ?? null
        } else {
          jobTitle = parsed
        }
      }
    }
  }

  // ── Filter experience form answers ────────────────────────────────────────
  const filteredAnswers = allFa.filter(a => {
    const q = a.form_questions as { question_text?: string; field_type?: string } | null
    if (!q) return false
    if (HIDE_FIELD_TYPES.has(q.field_type ?? '')) return false
    const qLower = (q.question_text ?? '').toLowerCase()
    if (HIDE_QUESTION_PATTERNS.some(p => qLower.includes(p))) return false
    return true
  })

  const hasAI = !!latestApp?.ai_summary
  const hasStrengths = (latestApp?.ai_strengths as string[])?.length > 0
  const hasRisks = (latestApp?.ai_risks as string[])?.length > 0
  const hasCulture = (cultureAnswers?.length || 0) > 0

  return (
    <>
      {/* ── CSS: screen-friendly base, compact print override ── */}
      <style>{`
        @page { size: A4 portrait; margin: 1.2cm; }
        *, *::before, *::after { box-sizing: border-box; }

        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #1a1a1a;
          margin: 0;
          background: #f1f5f9;
          font-size: 14px;
          line-height: 1.55;
        }

        /* Layout */
        .cv-page   { max-width: 820px; margin: 0 auto; padding: 20px 16px 40px; }
        .cv-card   {
          background: white;
          border-radius: 10px;
          box-shadow: 0 1px 4px rgba(0,0,0,.10);
          padding: 28px 28px 24px;
        }

        /* Header */
        .cv-name     { font-size: 24px; font-weight: 700; color: #1a5c38; margin: 0 0 2px; }
        .cv-subtitle { font-size: 13px; color: #6b7280; margin: 0; }
        .cv-badge    {
          display: inline-block;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 6px; padding: 3px 10px;
          font-size: 11px; color: #166534; font-weight: 600;
        }

        /* Section titles */
        .cv-section-title {
          font-size: 13px; font-weight: 700; color: #1a1a1a;
          margin: 0 0 8px; padding-bottom: 5px;
          border-bottom: 1px solid #e5e7eb;
        }

        /* Info rows (label + value) */
        .cv-info-row {
          display: flex; justify-content: space-between; gap: 8px;
          padding: 4px 0; border-bottom: 1px solid #f3f4f6;
          font-size: 13px;
        }
        .cv-label { color: #6b7280; flex-shrink: 0; font-size: 12px; }
        .cv-value { font-weight: 500; text-align: right; }

        /* Score rows */
        .cv-score-row { margin-bottom: 10px; }

        /* Text */
        .cv-body-text { font-size: 13px; line-height: 1.55; color: #374151; }
        .cv-small     { font-size: 12px; }

        /* Grids */
        .cv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .cv-section-box {
          border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px;
        }
        .cv-section-box.green { border-color: #d1fae5; background: #f0fdf4; }
        .cv-section-box.amber { border-color: #fde68a; background: #fffbeb; }

        /* Experience/Culture 2-col in print, 1-col on screen */
        .cv-qa-grid { display: flex; flex-direction: column; gap: 10px; }
        .cv-qa-item { padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; }
        .cv-qa-item:last-child { border-bottom: none; }

        /* Culture row */
        .cv-culture-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 8px; padding-bottom: 8px; border-bottom: 1px solid #f3f4f6;
        }
        .cv-culture-row:last-child { border-bottom: none; }

        /* Divider */
        .cv-divider { border: none; border-top: 2px solid #1a5c38; margin: 0 0 20px; }

        /* Footer */
        .cv-footer {
          display: flex; justify-content: space-between;
          font-size: 11px; color: #9ca3af;
          border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 6px;
        }

        /* ── PRINT OVERRIDES ── */
        @media print {
          body          { background: white; font-size: 10px; }
          .no-print     { display: none !important; }
          .cv-page      { padding: 0; max-width: 100%; }
          .cv-card      { box-shadow: none; border-radius: 0; padding: 0; }
          .cv-name      { font-size: 17px; }
          .cv-subtitle  { font-size: 10px; }
          .cv-badge     { font-size: 9px; padding: 2px 7px; }
          .cv-section-title { font-size: 10px; margin-bottom: 5px; padding-bottom: 3px; }
          .cv-info-row  { font-size: 10px; padding: 2px 0; }
          .cv-label     { font-size: 9px; }
          .cv-value     { font-size: 10px; }
          .cv-body-text { font-size: 10px; line-height: 1.4; }
          .cv-small     { font-size: 9px; }
          .cv-score-row { margin-bottom: 6px; }
          .cv-grid-2    { gap: 10px; }
          .cv-section-box { padding: 8px 10px; border-radius: 4px; }
          .cv-divider   { margin-bottom: 12px; }
          .cv-qa-grid   { columns: 2; column-gap: 14px; display: block; }
          .cv-qa-item   { break-inside: avoid; padding-bottom: 5px; margin-bottom: 5px; }
          .cv-culture-row { padding-bottom: 4px; margin-bottom: 4px; }
          .cv-footer    { font-size: 8.5px; padding-top: 6px; }
        }
      `}</style>

      {/* ── Toolbar (screen only) ── */}
      <AutoPrint />
      <div className="no-print cv-page" style={{ paddingBottom: 0, paddingTop: 16 }}>
        <a
          href={`/admin/candidatos/${id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: '#6b7280', textDecoration: 'none',
            padding: '6px 12px', borderRadius: 6,
            border: '1px solid #e5e7eb', background: 'white',
            marginBottom: 12,
          }}
        >
          ← Voltar ao candidato
        </a>
      </div>

      {/* ── Main content ── */}
      <div className="cv-page">
        <div className="cv-card">

          {/* ══ HEADER ══ */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 20 }}>
            {/* Photo 3x4 */}
            <div style={{
              flexShrink: 0, width: 90, height: 120,
              border: '1px solid #ddd', borderRadius: 6,
              overflow: 'hidden', background: '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {photoUrl !== '—' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', padding: 4 }}>Sem foto</span>
              )}
            </div>

            {/* Name + personal data */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h1 className="cv-name">{formatName(candidate.full_name)}</h1>
                  {jobTitle && <p className="cv-subtitle">Candidato(a) para: <strong>{jobTitle}</strong></p>}
                </div>
                <span className="cv-badge">Currículo</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                {candidate.phone && (
                  <div className="cv-info-row"><span className="cv-label">Telefone</span><span className="cv-value">{candidate.phone}</span></div>
                )}
                {candidate.email && (
                  <div className="cv-info-row"><span className="cv-label">E-mail</span><span className="cv-value">{candidate.email}</span></div>
                )}
                {cpf !== '—' && (
                  <div className="cv-info-row"><span className="cv-label">CPF</span><span className="cv-value">{cpf}</span></div>
                )}
                {birthDate && (
                  <div className="cv-info-row">
                    <span className="cv-label">Nascimento</span>
                    <span className="cv-value">{formatDate(birthDate)}{age != null ? ` (${age} anos)` : ''}</span>
                  </div>
                )}
                {addressRaw !== '—' && (
                  <div className="cv-info-row" style={{ gridColumn: '1/-1' }}>
                    <span className="cv-label">Endereço</span>
                    <span className="cv-value">{addressRaw}</span>
                  </div>
                )}
                {(candidate.neighborhood || candidate.city) && (
                  <div className="cv-info-row">
                    <span className="cv-label">Bairro / Cidade</span>
                    <span className="cv-value">{[candidate.neighborhood, candidate.city].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="cv-divider" />

          {/* ══ CANDIDATURA ATUAL + PARECER DA IA ══ */}
          {latestApp && (
            <div className="cv-grid-2" style={{ marginBottom: 16 }}>

              {/* Candidatura Atual */}
              <div className="cv-section-box">
                <SectionTitle>Candidatura Atual</SectionTitle>
                <InfoRow label="Vaga" value={jobTitle} />
                <InfoRow label="Data" value={formatDate(latestApp.created_at)} />
                <InfoRow
                  label="Status"
                  value={STATUS_LABELS[latestApp.status as CandidateStatus] || latestApp.status}
                />
                {(latestApp.culture_score != null || latestApp.experience_score != null || latestApp.final_score != null) && (
                  <div style={{ marginTop: 12 }}>
                    <ScoreBar label="Compatib. Cultural"   value={latestApp.culture_score} />
                    <ScoreBar label="Experiência"          value={latestApp.experience_score} />
                    <ScoreBar label="Disponibilidade"      value={latestApp.availability_score} />
                    <ScoreBar label="Nota Final"           value={latestApp.final_score} />
                  </div>
                )}
              </div>

              {/* Parecer da IA */}
              <div className="cv-section-box">
                <SectionTitle>Parecer da IA</SectionTitle>
                {hasAI ? (
                  <>
                    <p className="cv-body-text" style={{ marginTop: 0 }}>{latestApp.ai_summary}</p>
                    {latestApp.ai_recommendation && (
                      <p className="cv-small" style={{ fontWeight: 600, marginTop: 8, color: '#1a1a1a' }}>
                        {latestApp.ai_recommendation}
                      </p>
                    )}
                    {latestApp.ai_status_suggestion && (
                      <p className="cv-small" style={{ color: '#6b7280', marginTop: 4 }}>
                        Sugestão: {STATUS_LABELS[latestApp.ai_status_suggestion as CandidateStatus] || latestApp.ai_status_suggestion}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="cv-small" style={{ color: '#9ca3af' }}>
                    Análise de IA não realizada.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ══ PONTOS FORTES / ATENÇÃO ══ */}
          {(hasStrengths || hasRisks) && (
            <div className="cv-grid-2" style={{ marginBottom: 16 }}>
              {hasStrengths && (
                <div className="cv-section-box green">
                  <SectionTitle>✓ Pontos Fortes</SectionTitle>
                  {(latestApp!.ai_strengths as string[]).map((s, i) => (
                    <p key={i} className="cv-small" style={{ margin: '2px 0' }}>• {s}</p>
                  ))}
                </div>
              )}
              {hasRisks && (
                <div className="cv-section-box amber">
                  <SectionTitle>! Pontos de Atenção</SectionTitle>
                  {(latestApp!.ai_risks as string[]).map((s, i) => (
                    <p key={i} className="cv-small" style={{ margin: '2px 0' }}>• {s}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ FORMULÁRIO DE EXPERIÊNCIA ══ */}
          {filteredAnswers.length > 0 && (
            <div className="cv-section-box" style={{ marginBottom: 16 }}>
              <SectionTitle>Formulário de Experiência</SectionTitle>
              <div className="cv-qa-grid">
                {filteredAnswers.map(a => (
                  <div key={a.id} className="cv-qa-item">
                    <p className="cv-label" style={{ marginBottom: 2 }}>
                      {(a.form_questions as { question_text?: string } | null)?.question_text}
                    </p>
                    <p className="cv-value" style={{ margin: 0 }}>
                      {parseAnswer(a.answer_text)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ TESTE CULTURAL ══ */}
          {hasCulture && (
            <div className="cv-section-box" style={{ marginBottom: 16 }}>
              <SectionTitle>
                Teste Cultural
                {latestApp?.culture_score != null && (
                  <span style={{ float: 'right', fontSize: 12, fontWeight: 700,
                    color: (latestApp.culture_score) >= 70 ? '#10b981' : (latestApp.culture_score) >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {Math.round(latestApp.culture_score)}% compatibilidade
                  </span>
                )}
              </SectionTitle>
              <div className="cv-qa-grid">
                {cultureAnswers!.map(a => (
                  <div key={a.id} className="cv-culture-row">
                    <div style={{ flex: 1 }}>
                      <p className="cv-label" style={{ marginBottom: 1 }}>
                        {(a.culture_questions as { question_text?: string } | null)?.question_text}
                      </p>
                      <p className="cv-small" style={{ margin: 0, fontWeight: 500 }}>
                        {a.selected_option || '—'}
                      </p>
                    </div>
                    <span className="cv-small" style={{
                      fontWeight: 700, flexShrink: 0,
                      color: (a.score || 0) >= 8 ? '#10b981' : (a.score || 0) >= 5 ? '#f59e0b' : '#ef4444'
                    }}>
                      {a.score ?? 0}/10
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ RODAPÉ ══ */}
          <div className="cv-footer">
            <span>Gerado em {new Date().toLocaleString('pt-BR')}</span>
            <span>Brownie do Ton — Sistema de Recrutamento</span>
          </div>

        </div>{/* cv-card */}
      </div>{/* cv-page */}
    </>
  )
}
