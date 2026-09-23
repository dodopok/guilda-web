# Modelo e regras de escala

## Entidades

| Entidade | Dados principais | Uso |
| --- | --- | --- |
| Igreja | nome, fuso, status, configuração litúrgica e de mensagens | Isolar comunidades e suas regras locais. |
| Conta | identidade de login, senha, status | Permitir acesso individual, inclusive a mais de uma igreja. |
| Pessoa da igreja | igreja, conta opcional, nome, contato, status, tipo pastoral | Identificar participante e exceção da meta de folga sem compartilhar cadastro entre igrejas. |
| Vínculo e papel | igreja, conta, perfil, status | Autorizar coordenação, pastor, pregador e participante dentro da igreja. |
| Ministério | nome, descrição | Agrupar funções como louvor, mídia, liturgia e sodalício. |
| Função | ministério, título, instruções, duração | Explicar o que fazer e quando. |
| Habilitação | pessoa, função, vigência | Indicar quem pode receber um posto. |
| Indisponibilidade | pessoa, culto ou período, origem | Evitar escala em data informada como indisponível. |
| Culto | data/hora, local, tipo, estado | Vários cultos podem ocorrer no mesmo dia. |
| Posto | culto, função, ordem, horário, quantidade | Necessidade de uma ou mais pessoas. |
| Designação | posto, pessoa, estado, versão | Uma linha por pessoa, inclusive em postos coletivos. |
| Resposta | designação, decisão, canal, horário | Confirmação ou recusa com origem auditável. |
| Troca | designação original, candidato, estado | Proposta, aceite e efetivação. |
| Roteiro/bloco | culto, modelo, ordem, texto, responsável | Estrutura variável de cada liturgia. |
| Leitura selecionada | culto, ordem, referência, pessoa, origem | Suporta 2, 3, 4 ou outro número de leituras. |
| Aviso/música | culto, conteúdo, autor, estado | Preparação e compartilhamento entre equipes. |
| Snapshot litúrgico | livro, data, resposta escolhida, captura | Mantém publicada a escolha revisada. |
| Entrega de mensagem | evento, destinatário, versão, estado | Evita duplicação e mostra falhas. |

Posto descreve **o que falta fazer**; designação descreve **quem fará**. Assim uma célula com vários nomes vira várias confirmações independentes.

Ministérios, funções, habilitações, cultos, postos, designações, indisponibilidades, roteiros, consentimentos e envios pertencem à igreja. O mesmo usuário pode ter papéis distintos em comunidades diferentes. Modelos de liturgia compartilháveis são copiados para cada igreja antes da edição, de modo que mudanças locais não alterem roteiros de outra comunidade.

## Regras de alerta

1. **Elegibilidade:** sugerir apenas pessoa ativa e habilitada. Exceções da coordenação ficam registradas.
2. **Indisponibilidade:** bloquear por padrão; não presumir disponibilidade por silêncio.
3. **Choque de horário:** sobreposição é alerta forte. Acúmulo sequencial no mesmo culto é permitido, mas destacado.
4. **Folga:** para quem não é pastor, mostrar se existe ao menos um domingo do mês sem nenhuma designação. É meta, não bloqueio. Pastores ficam fora desse indicador.
5. **Sem participação:** listar pessoas habilitadas e disponíveis sem tarefa no período, com o ministério em que podem servir. É uma sugestão de revisão.
6. **Vagas:** posto com menos responsáveis que o necessário fica incompleto.
7. **Publicação:** somente coordenação publica. Alertas aceitos podem receber justificativa.

Quantidade de domingos com tarefa, total de tarefas e intervalos entre serviços aparecem em um painel por pessoa; não se cria uma pontuação moral de participantes.

## Confirmação e troca

A confirmação pertence a uma pessoa e designação específicas. No primeiro lançamento, ela é registrada no app; posteriormente poderá chegar por resposta individual autenticada do WhatsApp. Uma mensagem em grupo não confirma automaticamente ninguém.

Ao sugerir substituto, o sistema oferece ao participante apenas pessoas habilitadas para a mesma função e verifica indisponibilidade e choque. O substituto recebe convite; **se aceitar, a troca se efetiva sem aprovação adicional da coordenação**. A coordenação pode fazer uma designação excepcional de pessoa não habilitada, com registro da exceção; indisponibilidade e conflito continuam visíveis. A efetivação é transacional, mantém histórico e não pode deixar dois responsáveis finais para a mesma vaga.

Se a coordenação muda uma tarefa já confirmada, a confirmação dessa tarefa volta a pendente e a pessoa é avisada. Respostas de outras tarefas permanecem válidas.

## Liturgia variável

Um roteiro é uma sequência de blocos fixos, opcionais ou próprios de festa. O domingo comum fornece uma base, mas Tríduo Pascal, Advento, Pentecostes e outros dias aceitam blocos extras, outra ordem e mais leituras. A coordenação escolhe leituras e coleta sugeridas pelo Estêvão e pode fazer ajustes manuais. Uma versão publicada não muda silenciosamente.

## Importação da planilha

Importar com prévia e conciliação: propagar a data do início de cada bloco, mapear rótulos de função, separar pessoas que aparecem na mesma célula, resolver grafias diferentes e sinalizar nomes não encontrados. A aba CONFIGURAÇÕES fornece candidaturas a habilitação, não prova disponibilidade. Começar por um mês de amostra; só depois decidir se o histórico será trazido.
