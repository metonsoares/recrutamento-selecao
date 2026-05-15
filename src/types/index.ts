export type CandidateStatus =
  | 'novo'
  | 'pre_cadastro_whatsapp'
  | 'aguardando_formulario_experiencia'
  | 'experiencia_preenchida'
  | 'aguardando_teste_cultural'
  | 'teste_cultural_preenchido'
  | 'analise_ia_concluida'
  | 'apto_para_entrevista'
  | 'entrevista_agendada'
  | 'entrevistado'
  | 'aprovado'
  | 'reprovado'
  | 'banco_de_talentos'
  | 'contratado'
  | 'desistente'
  | 'removido'

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  novo: 'Novo',
  pre_cadastro_whatsapp: 'Pré-cadastro WhatsApp',
  aguardando_formulario_experiencia: 'Aguardando Formulário',
  experiencia_preenchida: 'Experiência Preenchida',
  aguardando_teste_cultural: 'Aguardando Teste Cultural',
  teste_cultural_preenchido: 'Teste Cultural Preenchido',
  analise_ia_concluida: 'Análise IA Concluída',
  apto_para_entrevista: 'Apto para Entrevista',
  entrevista_agendada: 'Entrevista Agendada',
  entrevistado: 'Entrevistado',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  banco_de_talentos: 'Banco de Talentos',
  contratado: 'Contratado',
  desistente: 'Desistente',
  removido: 'Removido',
}

export const STATUS_COLORS: Record<CandidateStatus, string> = {
  novo: 'bg-gray-100 text-gray-700',
  pre_cadastro_whatsapp: 'bg-blue-100 text-blue-700',
  aguardando_formulario_experiencia: 'bg-yellow-100 text-yellow-700',
  experiencia_preenchida: 'bg-orange-100 text-orange-700',
  aguardando_teste_cultural: 'bg-purple-100 text-purple-700',
  teste_cultural_preenchido: 'bg-indigo-100 text-indigo-700',
  analise_ia_concluida: 'bg-cyan-100 text-cyan-700',
  apto_para_entrevista: 'bg-emerald-100 text-emerald-700',
  entrevista_agendada: 'bg-teal-100 text-teal-700',
  entrevistado: 'bg-lime-100 text-lime-700',
  aprovado: 'bg-green-100 text-green-700',
  reprovado: 'bg-red-100 text-red-700',
  banco_de_talentos: 'bg-violet-100 text-violet-700',
  contratado: 'bg-green-200 text-green-800',
  desistente: 'bg-gray-200 text-gray-600',
  removido: 'bg-red-200 text-red-800',
}

export interface Candidate {
  id: string
  full_name: string
  phone: string | null
  phone_normalized: string | null
  email: string | null
  email_normalized: string | null
  city: string | null
  neighborhood: string | null
  source: string | null
  lgpd_accepted: boolean
  lgpd_accepted_at: string | null
  latest_application_id: string | null
  possible_duplicate: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Application {
  id: string
  candidate_id: string
  job_id: string | null
  status: CandidateStatus
  source: string | null
  is_latest: boolean
  experience_score: number | null
  culture_score: number | null
  availability_score: number | null
  final_score: number | null
  ai_summary: string | null
  ai_strengths: string[]
  ai_risks: string[]
  ai_recommendation: string | null
  ai_status_suggestion: string | null
  ai_raw_response: Record<string, unknown> | null
  experience_form_token: string | null
  experience_form_token_expires_at: string | null
  culture_test_token: string | null
  culture_test_token_expires_at: string | null
  created_at: string
  updated_at: string
  job?: Job
  candidate?: Candidate
}

export interface Job {
  id: string
  title: string
  description: string | null
  unit: string | null
  requirements: string[]
  desired_profile: string[]
  schedule_requirements: string[]
  salary_range: string | null
  benefits: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FormQuestion {
  id: string
  form_type: 'experience' | 'cultural'
  question_text: string
  description: string | null
  field_type: 'short_text' | 'long_text' | 'phone' | 'email' | 'date' | 'number' | 'select' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'scale' | 'yes_no'
  options: string[]
  category: string | null
  weight: number
  is_required: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface FormAnswer {
  id: string
  application_id: string
  question_id: string
  answer_text: string | null
  answer_json: unknown
  created_at: string
  question?: FormQuestion
}

export interface CultureQuestion {
  id: string
  question_text: string
  options: string[]
  ideal_answer: string | null
  scores: Record<string, number>
  culture_value: string | null
  weight: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CultureAnswer {
  id: string
  application_id: string
  question_id: string
  selected_option: string | null
  score: number | null
  created_at: string
  question?: CultureQuestion
}

export interface WhatsappConversation {
  id: string
  candidate_id: string | null
  phone: string
  status: string
  current_step: string
  raw_context: Record<string, unknown>
  created_at: string
  updated_at: string
  candidate?: Candidate
}

export interface WhatsappMessage {
  id: string
  conversation_id: string
  candidate_id: string | null
  direction: 'inbound' | 'outbound'
  message_text: string | null
  raw_payload: Record<string, unknown> | null
  zapi_message_id: string | null
  created_at: string
}

export interface AiSettings {
  id: string
  company_culture: string | null
  mission: string | null
  vision: string | null
  values: string[]
  ideal_candidate_profile: string | null
  desired_behaviors: string[]
  alert_behaviors: string[]
  whatsapp_agent_prompt: string | null
  analysis_prompt: string | null
  culture_weight: number
  experience_weight: number
  availability_weight: number
  created_at: string
  updated_at: string
}

export interface AdminNote {
  id: string
  candidate_id: string
  application_id: string | null
  admin_user_id: string | null
  note: string
  created_at: string
}

export interface WhatsappSettings {
  id: string
  instance_name: string | null
  instance_id: string | null
  instance_token_encrypted: string | null
  client_token_encrypted: string | null
  whatsapp_number: string | null
  attendant_name: string | null
  api_base_url: string | null
  webhook_received_url: string | null
  webhook_message_status_url: string | null
  webhook_disconnected_url: string | null
  environment: string | null
  is_active: boolean
  last_connection_at: string | null
  last_test_sent_at: string | null
  last_message_received_at: string | null
  created_at: string
  updated_at: string
}

export interface WhatsappLog {
  id: string
  direction: string | null
  action: string | null
  phone: string | null
  message: string | null
  status: string | null
  request_payload: Record<string, unknown> | null
  response_payload: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface AiAnalysisResult {
  resumo_candidato: string
  pontos_fortes: string[]
  pontos_de_atencao: string[]
  compatibilidade_cultural: number
  compatibilidade_com_a_vaga: number
  nota_experiencia: number
  nota_disponibilidade: number
  nota_final: number
  parecer_ia: string
  status_sugerido: string
  vaga_recomendada: string
}
