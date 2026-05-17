import { redirect } from 'next/navigation'

// Configuração da IA foi incorporada em Dados da Empresa
export default function IAPage() {
  redirect('/admin/configuracoes/empresa')
}
