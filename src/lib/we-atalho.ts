/**
 * Atalho ("bookmarklet") que puxa as passagens da WE Benefícios.
 *
 * Roda DENTRO da aba da WE, no navegador do usuário — é o único lugar onde o
 * cookie de sessão dela (HttpOnly) acompanha a requisição. Do nosso servidor
 * não dá: o login da WE tem reCAPTCHA e não existe API de parceiro ainda.
 *
 * O que ele faz, sem pedir nada:
 *   1. lista os últimos pedidos           GET /api/resource/order?l=N&c=0
 *   2. abre o recibo de cada um           GET /api/resource/report/order/{id}?type=employee
 *   3. lê Nome, CPF, Dias, Vlr Total e a COMPETÊNCIA que o próprio recibo diz
 *      (por isso não é preciso supor "mês da compra + 1")
 *   4. manda tudo para o portal, que sobrescreve por (competência, CPF)
 *
 * Cuidados que a extração precisa ter, aprendidos na marra:
 *   - cada recibo vem em DUAS VIAS (empresa e colaborador): somar sem
 *     deduplicar dobra o valor;
 *   - `type=summary` não traz CPF; o que serve é `type=employee`.
 */

/** Quantos pedidos recentes o atalho varre a cada clique. */
export const PEDIDOS_VARRIDOS = 16

export function gerarAtalhoWe(endpoint: string, token: string): string {
  const corpo = `
(async () => {
  const AVISO = (t, erro) => {
    let d = document.getElementById('__bdt_aviso');
    if (!d) {
      d = document.createElement('div');
      d.id = '__bdt_aviso';
      d.style.cssText = 'position:fixed;z-index:999999;right:16px;bottom:16px;max-width:420px;padding:14px 16px;border-radius:12px;font:14px/1.45 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:pre-line';
      document.body.appendChild(d);
    }
    d.style.background = erro ? '#b91c1c' : '#1F4332';
    d.textContent = t;
    return d;
  };

  try {
    if (!location.host.includes('webeneficios.com')) {
      AVISO('Abra o site da WE Benefícios e clique no atalho por lá.', true);
      return;
    }
    AVISO('Lendo os pedidos na WE…');

    const rp = await fetch('/api/resource/order?l=${PEDIDOS_VARRIDOS}&c=0', { headers: { Accept: 'application/json' } });
    if (rp.status === 401 || rp.status === 403) { AVISO('Sua sessão da WE expirou. Entre de novo e repita.', true); return; }
    const jp = await rp.json();
    const pedidos = (jp.Results || []).map(o => o.ID).filter(Boolean);
    if (!pedidos.length) { AVISO('Nenhum pedido encontrado na WE.', true); return; }

    const linhas = [];
    for (let i = 0; i < pedidos.length; i++) {
      AVISO('Lendo recibos… ' + (i + 1) + ' de ' + pedidos.length);
      const html = await (await fetch('/api/resource/report/order/' + pedidos[i] + '?&type=employee')).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let atual = null;
      const vistos = new Set();
      for (const t of Array.from(doc.querySelectorAll('table'))) {
        const txt = (t.textContent || '').replace(/\\s+/g, ' ');
        const mCpf = txt.match(/CPF:\\s*(\\d{11})/);
        if (mCpf) {
          const mNome = txt.match(/Nome:\\s*([^]*?)CPF:/);
          const mComp = txt.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s*a\\s*\\d{2}\\/\\d{2}\\/\\d{4}/);
          atual = {
            cpf: mCpf[1],
            nome: mNome ? mNome[1].replace(/\\s+/g, ' ').trim() : null,
            competencia: mComp ? mComp[3] + '-' + mComp[2] + '-01' : null,
          };
        }
        const grade = Array.from(t.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('th,td')).map(c => c.textContent.replace(/\\s+/g, ' ').trim()));
        const iCab = grade.findIndex(l => l.includes('Dias') && l.includes('Vlr Total'));
        if (iCab < 0 || !atual || !atual.competencia) continue;
        const cols = grade[iCab];
        const iD = cols.indexOf('Dias'), iV = cols.indexOf('Vlr Total'), iT = cols.indexOf('Tipo');
        for (let k = iCab + 1; k < grade.length; k++) {
          const c = grade[k];
          if (c.length !== cols.length) continue;
          const dias = parseInt(String(c[iD]).replace(/\\D/g, ''), 10) || 0;
          const valor = Number(String(c[iV]).replace(/[^\\d,]/g, '').replace(',', '.')) || 0;
          if (!dias && !valor) continue;
          const assinatura = atual.cpf + '|' + String(c[iT]).slice(0, 60) + '|' + dias + '|' + valor;
          if (vistos.has(assinatura)) continue;   // 2ª via do mesmo recibo
          vistos.add(assinatura);
          linhas.push({ competencia: atual.competencia, cpf: atual.cpf, nome: atual.nome, dias, valor, pedido: String(pedidos[i]) });
        }
      }
    }

    if (!linhas.length) { AVISO('Os pedidos não trouxeram recibo por funcionário.', true); return; }
    AVISO('Enviando ' + linhas.length + ' registros para o portal…');

    const r = await fetch('${endpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${token}' },
      body: JSON.stringify({ linhas }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { AVISO('O portal recusou: ' + (d.error || r.status), true); return; }

    const el = AVISO('Pronto: ' + d.casados + ' colaboradores atualizados em ' +
      (d.competencias || []).length + ' mês(es) — ' + (d.competencias || []).join(', ') +
      (d.nao_encontrados && d.nao_encontrados.length ? '\\n' + d.nao_encontrados.length + ' CPF(s) da WE não estão no portal.' : ''));
    setTimeout(() => el.remove(), 12000);
  } catch (e) {
    AVISO('Falhou: ' + (e && e.message ? e.message : e), true);
  }
})();`.trim()

  return 'javascript:' + encodeURIComponent(corpo)
}
