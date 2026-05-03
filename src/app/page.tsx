import IdentificationForm from './IdentificationForm'

// Server Component — lê variáveis de ambiente seguras e passa para o form
export default function HomePage() {
  const requiresCode = !!process.env.SURVEY_ACCESS_CODE
  return <IdentificationForm requiresCode={requiresCode} />
}
