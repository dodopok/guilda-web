# Expansão para outras igrejas

## Direção

Porto será a primeira igreja a usar a Guilda. A aplicação deve permitir incluir outras comunidades depois, sem misturar dados ou exigir reescrever pessoas, permissões, escalas e mensagens. Ainda não foi decidido se o cadastro de outras igrejas entra no primeiro lançamento ou numa fase posterior.

## Limites por igreja

- Cada igreja tem seus próprios participantes, ministérios, funções, habilitações, cultos, indisponibilidades, escalas, roteiros, consentimentos, mensagens e configurações.
- Uma conta pode estar vinculada a duas igrejas, com papéis diferentes em cada uma. Entrar em uma delas não dá acesso aos dados da outra.
- Fuso, horário de cultos, regras de folga, prazos e modelos litúrgicos são configurados por igreja.
- A integração com o Estêvão guarda as preferências litúrgicas da igreja; o roteiro sempre permite ajuste local. O texto do LOC e seus direitos de uso precisam ser verificados antes de disponibilizar modelos a outras comunidades.
- Cada igreja configura seu canal oficial de WhatsApp, número, consentimentos e modelos de mensagem. O número de Porto não envia em nome de outra igreja.
- Um modelo inicial de funções ou liturgia pode ser copiado para uma igreja nova. Depois da cópia, a edição é local e não altera a comunidade de origem.

## Caminho de entrega proposto

1. **Base:** criar identificador de igreja, vínculos de contas e escopo em todas as operações. Cadastrar Porto manualmente como primeira igreja.
2. **Piloto Porto:** validar o fluxo completo de coleta, escala, lembrete, confirmação, troca e roteiro com dados só dessa igreja.
3. **Abertura controlada:** convidar outra igreja, criar sua configuração e provar isolamento de dados, calendário, modelos e mensagens.
4. **Cadastro ampliado:** decidir se outras igrejas poderão abrir conta sem convite e como receberão suporte e configuração inicial.

## Provas necessárias antes da segunda igreja

- Uma coordenação não consegue buscar dados de outra igreja por URL, API, exportação ou link.
- Tarefas agendadas e webhooks usam a igreja correta, mesmo que dois cultos tenham a mesma data e hora.
- A conta vinculada a duas igrejas escolhe claramente em qual delas está operando.
- Dados e consentimentos de mensagens não são copiados junto com modelos de culto.
- Fica claro quem é responsável pela configuração e custo de envio do WhatsApp de cada igreja.

## Decisões abertas

- O primeiro lançamento precisa permitir cadastrar outra igreja ou basta preparar o isolamento e validar Porto primeiro?
- O produto será voltado a outras igrejas anglicanas que usam o LOC, ou também a comunidades de outras tradições?
- Cada igreja usará seu próprio número WhatsApp Business e administrará sua integração, ou haverá uma operação central com números separados?
