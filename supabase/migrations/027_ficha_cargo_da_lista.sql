-- Função / Cargo da ficha passa a ser escolhido na lista oficial (tabela cargos).
--
-- A ficha continua guardando o TEXTO em admission_form.function_title — nada de
-- chave estrangeira — então nenhuma ficha muda de cargo aqui. O que esta
-- migration faz é alinhar a GRAFIA das fichas à do cadastro, senão o combo
-- abriria sem nada selecionado em quem está escrito "Auxiliar Administrativo"
-- enquanto a lista tem "Auxiliar administrativo".
--
-- Só toca em ficha cujo cargo já existe no cadastro (comparação sem diferenciar
-- maiúscula) e só quando o texto difere; quem tem cargo fora da lista fica como
-- está e a tela mostra o valor atual marcado como "(fora da lista)".
--
-- Histórico de transferência (admission_form_history) não é tocado: é registro
-- do que foi assinado na época.
update public.applications a
   set admission_form = jsonb_set(a.admission_form, '{function_title}', to_jsonb(c.nome))
  from public.cargos c
 where a.is_latest
   and a.admission_form ? 'function_title'
   and lower(trim(a.admission_form->>'function_title')) = lower(c.nome)
   and a.admission_form->>'function_title' is distinct from c.nome;
