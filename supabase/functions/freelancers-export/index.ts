import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// freelancers-export — SOMENTE LEITURA.
//
// Exporta para o Portal BDT quem está disponível para trabalhar em evento:
//   • status 'freelancer'
//   • status 'aprovado'  ← é o que a UI do Recrutamento chama de INTERMITENTES
//   • status 'contratado' ← funcionário CLT, que também é escalado em evento
//   • status 'intermitente' (ainda não existe no banco; aceito para o dia em
//     que a chave for renomeada, sem precisar de redeploy)
//
// ⚠️ ARMADILHA DE VOCABULÁRIO: aqui os rótulos da tela divergem das chaves do
// banco. "Intermitentes" = status 'aprovado'. Não inferir pelo nome.
//
// Segurança:
//   • verify_jwt=false + gate por header x-import-token, o mesmo bridge dos
//     outros *-export. SEM fallback embutido: se o secret não estiver setado,
//     devolve 503 em vez de aceitar um token conhecido.
//   • Não escreve nada. O filtro de status é fixo aqui dentro — o chamador não
//     consegue alargar a consulta.
//   • Devolve PII (CPF, telefone, chave PIX) porque o destino é o cadastro da
//     equipe do evento. Quem consome do outro lado é a Edge Function
//     evt-buscar-freelancers, que exige sessão de GESTOR do App Eventos.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-import-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const EXPECTED_TOKEN = Deno.env.get("IMPORT_TOKEN");
const DUMMY = "00000000-0000-0000-0000-000000000000";

/** Status que valem como "pode ser escalado em evento". */
const STATUS = ["freelancer", "aprovado", "intermitente", "contratado"];

/** Rótulo que o Recrutamento mostra na tela, para o Portal exibir igual. */
function vinculo(status: string): string {
  if (status === "freelancer") return "Freelancer";
  if (status === "contratado") return "Contratado";
  return "Intermitente";
}

/**
 * Quando a mesma pessoa tem mais de uma candidatura, vale o vínculo mais
 * forte. Sem isso ela aparecia repetida na lista do Portal — foi o caso do
 * Anderson, com duas candidaturas em 'aprovado'.
 */
const FORCA: Record<string, number> = {
  contratado: 3,
  aprovado: 2,
  intermitente: 2,
  freelancer: 1,
};

/** Comparação de token em tempo constante: não vaza o prefixo certo. */
function tokenConfere(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!EXPECTED_TOKEN) {
    return json({ error: "IMPORT_TOKEN não configurado neste projeto." }, 503);
  }
  const enviado = req.headers.get("x-import-token") ?? "";
  if (!tokenConfere(enviado, EXPECTED_TOKEN)) {
    return json({ error: "Não autorizado" }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: apps, error } = await sb
    .from("applications")
    .select("id, candidate_id, status, bank_data")
    .in("status", STATUS);
  if (error) return json({ error: error.message }, 500);

  const ids = [
    ...new Set((apps ?? []).map((a) => a.candidate_id).filter(Boolean)),
  ];
  const { data: cands, error: erroCand } = await sb
    .from("candidates")
    .select("id, full_name, email, cpf, phone, city, neighborhood, deleted_at")
    .in("id", ids.length ? ids : [DUMMY]);
  if (erroCand) return json({ error: erroCand.message }, 500);

  const porId = new Map((cands ?? []).map((c) => [c.id, c]));

  const porCandidato = new Map<string, (typeof apps)[number]>();
  for (const a of apps ?? []) {
    const atual = porCandidato.get(a.candidate_id);
    if (!atual || (FORCA[a.status] ?? 0) > (FORCA[atual.status] ?? 0)) {
      porCandidato.set(a.candidate_id, a);
    }
  }

  const pessoas = [...porCandidato.values()]
    .map((a) => {
      const c = porId.get(a.candidate_id);
      // Candidato apagado (LGPD) não volta: o registro só existe para histórico.
      if (!c || c.deleted_at) return null;
      const banco = (a.bank_data ?? {}) as Record<string, unknown>;
      return {
        application_id: a.id,
        status: a.status,
        vinculo: vinculo(a.status),
        nome_completo: c.full_name ?? "",
        email: c.email ?? null,
        cpf: c.cpf ?? null,
        telefone: c.phone ?? null,
        cidade: c.city ?? null,
        bairro: c.neighborhood ?? null,
        chave_pix: typeof banco.pix_key === "string" ? banco.pix_key : null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p.nome_completo !== "")
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));

  return json({ pessoas, total: pessoas.length });
});
