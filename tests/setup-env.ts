// Ambiente previsível para os testes. Nunca envia mensagens reais.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://guilda:guilda@localhost:5432/guilda_test'
process.env.PASSWORD_SCRYPT_LOG2N = '10'
process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
process.env.APP_BASE_URL = 'https://guilda.test'
process.env.WHATSAPP_ALLOW_REAL_SEND = process.env.WHATSAPP_ALLOW_REAL_SEND_TEST ?? 'false'
process.env.WHATSAPP_GRAPH_BASE_URL = 'https://graph.example.test'
process.env.ESTEVAO_API_URL = 'https://estevao.example.test'
process.env.ESTEVAO_API_KEY = 'test-key'
process.env.REMINDER_CATCHUP_HOURS = '6'
