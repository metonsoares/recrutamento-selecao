export default function DocumentoInvalidoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Link inválido</h1>
        <p className="text-sm text-muted-foreground mt-1">Este link de envio de documento não é válido ou expirou.</p>
      </div>
    </div>
  )
}
