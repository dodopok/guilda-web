# Segurança e privacidade

## Isolamento entre igrejas

- Toda tabela com dados de uma comunidade tem `church_id`. Tabelas referenciadas têm `UNIQUE (church_id, id)` e as referências usam **chave estrangeira composta** `(church_id, x_id)`: o banco recusa, por exemplo, uma designação que aponte para um posto de uma igreja e uma pessoa de outra.
- Os serviços recebem um contexto de igreja resolvido a partir do vínculo ativo da conta e filtram toda consulta por esse `church_id`. Nenhum identificador vindo do cliente amplia o escopo.
- Sem vínculo, a API responde 404, inclusive para administradores da plataforma (que cadastram igrejas mas não leem seus dados).
- Tarefas agendadas e webhooks carregam a igreja explicitamente. O webhook da Cloud API identifica o canal pelo `phone_number_id`; o do YCloud, pelo número da igreja no evento. Cada número pertence a um só canal (índice único no banco) e a assinatura é conferida com o segredo daquele canal.
- Testes: `tests/services/tenancy.test.ts` (serviços e restrições do banco) e `tests/e2e/api.spec.ts` / `flows.spec.ts` (HTTP e interface).

## Contas, senhas e sessões

- Senhas com scrypt (N=2^17, r=8, p=1 por padrão; parâmetros gravados no hash), normalização NFKC, mínimo de 10 caracteres, nunca iguais ao telefone.
- Login com mesma mensagem e tempo semelhante exista ou não a conta; bloqueio de 15 minutos após 8 erros; limite por IP nas rotas de login, convite e senha.
- Sessões com token aleatório de 256 bits guardado só como hash SHA-256; cookie httpOnly/SameSite=Lax/Secure; Bearer para app nativo.
- CSRF: escrita com cookie exige `Origin` (ou `Sec-Fetch-Site: same-origin`) do próprio app.
- Convites: token de 256 bits, hash no banco, 72 horas, uso único, novo convite revoga o anterior, trocar o telefone revoga convites pendentes. Só ativa a conta da pessoa convidada; a tela do convite mostra apenas o nome da igreja e o primeiro nome.
- Redefinição de senha: 30 minutos, uso único, no máximo um pedido a cada 5 minutos, encerra todas as sessões.
- Cabeçalhos: CSP restrita a `'self'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (links com token não vazam por Referer), `nosniff`, API com `Cache-Control: no-store`.

## Segredos

- Tokens de acesso e app secret da Meta, e a chave de API e o segredo de webhook do YCloud, ficam cifrados com AES-256-GCM (`SECRETS_ENCRYPTION_KEY`) e nunca voltam para o navegador; o token de verificação do webhook é guardado só como hash.
- Links de convite e de senha na fila de mensagens ficam cifrados e são apagados após envio real. Em modo de simulação o link continua disponível só para a coordenação, para testes locais.
- `.env` está no `.gitignore`; o repositório só tem `.env.example`.

## Dados pessoais

- Telefones e consentimentos só são visíveis à coordenação. Demais membros veem nomes e funções (necessário para propor substitutos).
- Consentimento registrado com finalidade, origem, data, quem registrou e revogação. A própria pessoa pode autorizar ou revogar no app ou respondendo PARAR. O consentimento é conferido de novo no momento do envio.
- Auditoria registra quem fez o quê sem telefones completos, senhas ou tokens. Webhooks não guardam o texto das mensagens recebidas.
- O repositório não contém nomes, telefones ou textos das fontes de referência. Os dados de exemplo são fictícios e os textos do LOC são marcadores para a coordenação preencher.
- **Pendente de decisão**: prazo de retenção e rotina de exclusão (pessoa inativa, mensagens antigas, backups). Até lá, pessoas são inativadas, não apagadas, para preservar o histórico das escalas.
