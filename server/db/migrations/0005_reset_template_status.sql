-- Os modelos de mensagem mudaram: variáveis nomeadas com exemplo (exigência do YCloud) e
-- código de senha no formato de autenticação da Meta (guilda_codigo no lugar de guilda_senha).
-- A situação guardada (rascunho, em análise, aprovado, rejeitado) era dos textos antigos e
-- não vale para os novos: volta a "rascunho". Número, chaves e segredos não são tocados.
UPDATE "whatsapp_channels" SET "templates" = '{}'::jsonb WHERE "templates" <> '{}'::jsonb;
