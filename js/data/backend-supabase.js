// Backend real: Supabase (Postgres + Auth + Storage + Realtime).
// A segurança está no servidor (RLS + triggers). Este arquivo só conversa com a API.

export const TABELAS = ['pessoas', 'categorias', 'contas', 'cartoes', 'projetos', 'projeto_tarefas', 'metas',
  'aportes', 'orcamentos', 'recorrencias', 'lancamentos', 'configuracoes', 'perfis'];

export class ErroConflito extends Error {
  constructor(atual) { super('conflito'); this.conflito = true; this.atual = atual; }
}

function traduzirErro(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (/rate limit/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/new password should be different/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
  if (/check constraint|violates check/i.test(m)) return 'Dados inválidos: confira os campos obrigatórios desta operação.';
  if (/row-level security|permission denied/i.test(m)) return 'Acesso negado. Somente as contas autorizadas da família podem gravar.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  if (/foreign key/i.test(m)) return 'Este item está em uso por outros registros e não pode ser apagado. Use “arquivar”.';
  return m;
}
export const erroAmigavel = traduzirErro;

export function criarBackendSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const ok = ({ data, error }) => { if (error) throw new Error(traduzirErro(error)); return data; };

  async function listar(tabela) {
    const pagina = 1000;
    let de = 0; const out = [];
    for (;;) {
      const q = sb.from(tabela).select('*').order(tabela === 'configuracoes' ? 'id' : 'id').range(de, de + pagina - 1);
      const data = ok(await q);
      out.push(...data);
      if (data.length < pagina) break;
      de += pagina;
    }
    return out;
  }

  return {
    modo: 'real',
    sb,
    // ---------------- autenticação
    async sessao() { const { data } = await sb.auth.getSession(); return data.session; },
    async entrar(email, senha) { return ok(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha })); },
    async sair() { await sb.auth.signOut(); },
    async recuperarSenha(email) {
      const redirectTo = location.origin + location.pathname;
      ok(await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo }));
    },
    async definirSenha(senha) { return ok(await sb.auth.updateUser({ password: senha })); },
    aoMudarAuth(cb) { return sb.auth.onAuthStateChange((evento, sessao) => cb(evento, sessao)); },

    // ---------------- dados
    listar,
    async carregarTudo() {
      const res = await Promise.all(TABELAS.map((t) => listar(t)));
      return Object.fromEntries(TABELAS.map((t, i) => [t, res[i]]));
    },
    /** Inserção idempotente: o id é gerado no navegador; repetir o envio não duplica. */
    async inserir(tabela, linhas) {
      const { data, error } = await sb.from(tabela).insert(linhas).select('*');
      if (error) {
        if (error.code === '23505' && linhas.every((l) => l.id)) {
          // provavelmente um reenvio (clique duplo / rede): devolve o que já existe
          const ids = linhas.map((l) => l.id);
          const exist = ok(await sb.from(tabela).select('*').in('id', ids));
          if (exist.length === linhas.length) return exist;
        }
        throw new Error(traduzirErro(error));
      }
      return data;
    },
    async inserirIgnorandoDuplicados(tabela, linhas, onConflict) {
      if (!linhas.length) return [];
      return ok(await sb.from(tabela).upsert(linhas, { onConflict, ignoreDuplicates: true }).select('*'));
    },
    /** Atualização com controle de versão: se outra pessoa alterou antes, lança ErroConflito. */
    async atualizar(tabela, id, patch, versao) {
      let q = sb.from(tabela).update(patch).eq('id', id);
      if (versao != null) q = q.eq('versao', versao);
      const data = ok(await q.select('*'));
      if (!data.length) {
        const atual = ok(await sb.from(tabela).select('*').eq('id', id)).at(0);
        throw new ErroConflito(atual);
      }
      return data[0];
    },
    async atualizarVarios(tabela, ids, patch) {
      if (!ids.length) return [];
      return ok(await sb.from(tabela).update(patch).in('id', ids).select('*'));
    },
    async apagar(tabela, id) { ok(await sb.from(tabela).delete().eq('id', id)); },
    async apagarVarios(tabela, ids) { if (ids.length) ok(await sb.from(tabela).delete().in('id', ids)); },
    async historico(registroId) {
      return ok(await sb.from('historico').select('*').eq('registro_id', registroId).order('id', { ascending: false }));
    },
    async historicoRecente(limite = 100) {
      return ok(await sb.from('historico').select('*').order('id', { ascending: false }).limit(limite));
    },
    async restaurarBackup(dados) { return ok(await sb.rpc('restaurar_backup', { dados })); },

    // ---------------- anexos (bucket privado)
    async enviarAnexo(caminho, arquivo) {
      ok(await sb.storage.from('anexos').upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined }));
      return caminho;
    },
    async urlAnexo(caminho) {
      const d = ok(await sb.storage.from('anexos').createSignedUrl(caminho, 300));
      return d.signedUrl;
    },
    async removerAnexo(caminho) { ok(await sb.storage.from('anexos').remove([caminho])); },

    // ---------------- tempo real
    assinar(cb) {
      const canal = sb.channel('familia');
      for (const t of TABELAS.filter((x) => x !== 'perfis')) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => cb(t, p));
      }
      canal.subscribe((status) => cb('__status', { status }));
      return () => sb.removeChannel(canal);
    },
  };
}
