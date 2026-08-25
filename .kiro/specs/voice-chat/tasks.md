# Tarefas de Implementação — Chat IA com Voz Bidirecional

> **Status do código:** todos os arquivos de código (`index.html`, `script.js`, `style.css`,
> `funcao lambda/funcao.py`) estão **implementados e prontos**. As tarefas abaixo cobrem
> o provisionamento de infraestrutura AWS e ajustes finais necessários para o sistema
> funcionar de ponta a ponta.

---

## Fase 1 — Infraestrutura AWS (pré-requisito para voz)

### Tarefa 1.1 — Criar bucket S3 para áudios temporários

**Por quê:** A Lambda salva o áudio do usuário no S3 antes de enviar ao Transcribe.
Sem o bucket, o fluxo de voz retorna HTTP 500 imediatamente.

**Passos:**
```bash
# 1. Criar o bucket (escolha um nome único globalmente)
aws s3api create-bucket \
  --bucket meu-chat-audio-temp \
  --region us-east-1

# 2. Bloquear acesso público
aws s3api put-public-access-block \
  --bucket meu-chat-audio-temp \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 3. Configurar expiração automática de 1 dia
aws s3api put-bucket-lifecycle-configuration \
  --bucket meu-chat-audio-temp \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "delete-temp-audio",
      "Status": "Enabled",
      "Filter": {"Prefix": "transcribe-temp/"},
      "Expiration": {"Days": 1}
    }]
  }'
```

**Verificação:** `aws s3 ls s3://meu-chat-audio-temp` deve retornar vazio sem erro.

---

### Tarefa 1.2 — Atualizar a Policy IAM da role da Lambda

**Por quê:** A policy atual (`policy/POLICY-bedrock`) só tem `bedrock:InvokeModel`.
Sem as permissões novas, qualquer chamada a Transcribe, Polly ou S3 retorna `AccessDenied`.

**Passos no console AWS (IAM):**
1. Acesse **IAM → Roles**
2. Localize a role da sua Lambda (ex: `chat-ia-lambda-role`)
3. Clique em **Add permissions → Create inline policy**
4. Selecione **JSON** e cole a policy abaixo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": "*"
    },
    {
      "Sid": "TranscribeJobs",
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:DeleteTranscriptionJob"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PollySynth",
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech"],
      "Resource": "*"
    },
    {
      "Sid": "S3AudioTemp",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::meu-chat-audio-temp/*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

5. Dê o nome `chat-ia-voice-policy` e clique em **Create policy**

**Verificação:** No painel da role, a nova policy aparece na lista de permissões.

---

### Tarefa 1.3 — Configurar variáveis de ambiente na Lambda

**Por quê:** A Lambda precisa saber o nome do bucket, o modelo Bedrock, a voz do Polly
e o domínio permitido no CORS. Sem `TRANSCRIBE_BUCKET`, o fluxo de voz falha.

**Passos no console AWS (Lambda):**
1. Acesse sua função Lambda
2. Vá em **Configuration → Environment variables → Edit**
3. Adicione as seguintes variáveis:

| Chave | Valor |
|---|---|
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` |
| `ALLOWED_ORIGIN` | `https://chat.inhesta.net` (ou seu domínio) |
| `TRANSCRIBE_BUCKET` | `meu-chat-audio-temp` (nome do bucket criado na Tarefa 1.1) |
| `POLLY_VOICE_ID` | `Camila` |
| `POLLY_ENGINE` | `neural` |
| `AWS_REGION` | `us-east-1` |

4. Clique em **Save**

**Verificação:** No painel da função, **Configuration → Environment variables** mostra todas as 6 variáveis.

---

### Tarefa 1.4 — Ajustar timeout da Lambda

**Por quê:** O Amazon Transcribe leva de 5 a 30 segundos para transcrever áudios curtos.
O timeout default da Lambda é 3 segundos — a função vai expirar antes de receber a transcrição.

**Passos no console AWS (Lambda):**
1. Acesse sua função Lambda
2. Vá em **Configuration → General configuration → Edit**
3. Altere **Timeout** para `1 min 0 sec`
4. Mantenha **Memory** em `256 MB` (suficiente)
5. Clique em **Save**

**Verificação:** Em **Configuration → General configuration**, timeout aparece como `1 min 0 sec`.

---

### Tarefa 1.5 — Verificar limite de payload do API Gateway

**Por quê:** Áudio WebM de 60 segundos convertido para base64 pode chegar a 3–5 MB.
O API Gateway precisa aceitar esse tamanho.

**Para HTTP API:**
1. Acesse **API Gateway → sua API → Settings**
2. Confirme que **Maximum payload size** está em `10 MB`
3. Se não estiver, edite e salve

**Para REST API:**
1. Acesse **API Gateway → sua API → Settings**
2. Em **Binary Media Types**, adicione `*/*`
3. Faça um novo **Deploy** na stage desejada

**Verificação:** Envie um áudio de 30s pelo chat e confirme que não recebe erro 413.

---

## Fase 2 — Upload do Código

### Tarefa 2.1 — Fazer upload do `funcao.py` para a Lambda

**Por quê:** O código foi atualizado com suporte a Transcribe, Polly e S3.
A função atual na AWS ainda pode ter a versão antiga.

**Opção A — Via console AWS:**
1. Acesse sua função Lambda
2. Na aba **Code**, abra o editor e substitua o conteúdo pelo arquivo `funcao lambda/funcao.py`
3. Clique em **Deploy**

**Opção B — Via AWS CLI:**
```bash
# Na pasta do projeto
cd "funcao lambda"

# Empacota e faz upload
zip funcao.zip funcao.py

aws lambda update-function-code \
  --function-name NOME_DA_SUA_LAMBDA \
  --zip-file fileb://funcao.zip \
  --region us-east-1
```

**Verificação:** No console Lambda, a data de **Last modified** deve ser de agora.

---

### Tarefa 2.2 — Atualizar o arquivo `policy/POLICY-bedrock` no repositório

**Por quê:** O arquivo atual contém apenas `bedrock:InvokeModel` — está desatualizado e
induz a erro ao configurar uma nova conta.

**Arquivo:** `policy/POLICY-bedrock`

**Conteúdo correto:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": "*"
    },
    {
      "Sid": "TranscribeJobs",
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:DeleteTranscriptionJob"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PollySynth",
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech"],
      "Resource": "*"
    },
    {
      "Sid": "S3AudioTemp",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::SEU-BUCKET-AQUI/*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

---

## Fase 3 — Testes de Validação

### Tarefa 3.1 — Testar fluxo de texto com TTS desativado

1. Abra `index.html` em `https://` (não `http://`)
2. Confirme que o status mostra "API configurada" (azul)
3. Digite "Olá, tudo bem?" e clique Enviar
4. Confirme resposta em texto na tela
5. Confirme que **nenhum player de áudio** aparece (TTS está desativado por padrão)

**Critério de aceite:** Resposta em texto em menos de 10 segundos, sem erro.

---

### Tarefa 3.2 — Testar TTS no fluxo de texto

1. Clique no botão de alto-falante 🔊 no header (deve ficar colorido)
2. Digite uma mensagem e envie
3. Confirme que a bolha de resposta da IA contém um player de áudio
4. Confirme que o áudio toca automaticamente
5. Clique novamente no botão 🔊 para desativar
6. Envie outra mensagem e confirme que **não há** player de áudio

**Critério de aceite:** Áudio toca ao receber a resposta quando TTS está ativo.

---

### Tarefa 3.3 — Testar gravação e transcrição de voz

1. Clique no botão de microfone 🎤
2. Permita o acesso ao microfone quando solicitado
3. Confirme: barra de gravação aparece com ponto vermelho piscando e timer contando
4. Fale claramente: "Qual é a capital do Brasil?"
5. Clique no botão ⏹ para parar
6. Confirme: bolha do usuário aparece com player de áudio + transcrição em itálico
7. Confirme: bolha da IA aparece com a resposta correta

**Critério de aceite:** Transcrição correta e resposta relevante em menos de 40 segundos.

---

### Tarefa 3.4 — Testar voz + TTS (fluxo completo bidirecional)

1. Ative o TTS (botão 🔊)
2. Clique no microfone, fale uma pergunta, pare a gravação
3. Confirme:
   - Bolha do usuário: player de áudio + transcrição
   - Bolha da IA: texto da resposta + player de áudio da resposta
   - Áudio da IA toca automaticamente

**Critério de aceite:** Interação completa voz → texto/voz funcionando.

---

### Tarefa 3.5 — Testar parada automática em 60 segundos

1. Clique no microfone e aguarde sem parar manualmente
2. Confirme que a gravação para automaticamente após 60 segundos
3. Confirme que o áudio é enviado e processado normalmente

**Critério de aceite:** Gravação para em ~60s e o fluxo continua.

---

### Tarefa 3.6 — Verificar logs no CloudWatch

Após os testes, acesse:
**CloudWatch → Log groups → /aws/lambda/NOME_DA_LAMBDA**

Confirme que:
- Não há erros `AccessDenied` (policy IAM correta)
- Não há erros de `TRANSCRIBE_BUCKET` (variável configurada)
- Os job names do Transcribe aparecem nos logs
- Os objetos S3 são criados e deletados

---

## Fase 4 — Ajustes Opcionais

### Tarefa 4.1 — Alterar a voz do Polly (opcional)

Se quiser uma voz diferente, altere a variável `POLLY_VOICE_ID` na Lambda:

| VoiceId | Gênero | Engine disponível |
|---|---|---|
| `Camila` | Feminino | `neural` e `standard` |
| `Vitoria` | Feminino | `standard` |
| `Ricardo` | Masculino | `standard` |

> Atenção: engine `neural` não está disponível para todas as vozes. Se alterar a voz,
> considere também alterar `POLLY_ENGINE` para `standard`.

---

### Tarefa 4.2 — Alterar o modelo Bedrock (opcional)

Altere `BEDROCK_MODEL_ID` na Lambda para qualquer modelo habilitado na sua conta:

| Model ID | Descrição |
|---|---|
| `amazon.nova-lite-v1:0` | Rápido, custo baixo (padrão atual) |
| `amazon.nova-pro-v1:0` | Mais capaz, custo maior |
| `anthropic.claude-3-5-haiku-20241022-v1:0` | Claude Haiku — rápido |
| `anthropic.claude-3-5-sonnet-20241022-v2:0` | Claude Sonnet — balanceado |

---

### Tarefa 4.3 — Personalizar o system prompt (opcional)

No arquivo `funcao lambda/funcao.py`, localize a função `_ask_bedrock` e edite o campo
`"text"` do `system`:

```python
system=[{
    "text": (
        "Você é um assistente de IA em um site público. "
        "Responda sempre em português do Brasil, com clareza, "
        "objetividade e tom cordial. "
        "Prefira respostas curtas e diretas (no máximo 8 linhas), "
        "exceto quando o usuário pedir detalhes."
    )
}],
```

Após editar, faça o deploy novamente (Tarefa 2.1).

---

## Resumo das Tarefas Obrigatórias

| # | Tarefa | Onde | Estimativa |
|---|---|---|---|
| 1.1 | Criar bucket S3 | AWS Console / CLI | 5 min |
| 1.2 | Atualizar policy IAM | AWS Console (IAM) | 5 min |
| 1.3 | Configurar env vars na Lambda | AWS Console (Lambda) | 3 min |
| 1.4 | Ajustar timeout da Lambda para 60s | AWS Console (Lambda) | 2 min |
| 1.5 | Verificar payload do API Gateway | AWS Console (API Gateway) | 3 min |
| 2.1 | Upload do `funcao.py` para a Lambda | AWS Console / CLI | 5 min |
| 2.2 | Atualizar `policy/POLICY-bedrock` no repo | Editor / git | 2 min |
| 3.1–3.6 | Executar testes de validação | Navegador + CloudWatch | 15 min |

**Tempo total estimado: ~40 minutos**
