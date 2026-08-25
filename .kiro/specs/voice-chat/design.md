# Design — Chat IA com Voz Bidirecional

## 1. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         NAVEGADOR                               │
│                                                                 │
│   ┌─────────────┐     ┌────────────────────────────────────┐   │
│   │  textarea   │     │  MediaRecorder API                 │   │
│   │  (texto)    │     │  getUserMedia() → WebM/Opus blob   │   │
│   └──────┬──────┘     └──────────────┬─────────────────────┘   │
│          │                           │  FileReader → base64     │
│          └──────────────┬────────────┘                         │
│                         │  fetch POST /chat (JSON)              │
└─────────────────────────┼───────────────────────────────────────┘
                          │
               ┌──────────▼──────────┐
               │    API Gateway      │
               │  POST /chat         │
               │  max payload: 10MB  │
               └──────────┬──────────┘
                          │  Lambda Proxy Integration
               ┌──────────▼──────────────────────────────────┐
               │             AWS Lambda (Python 3.12)         │
               │             Timeout: 60s  Memory: 256MB      │
               │                                              │
               │  lambda_handler()                            │
               │    ├── OPTIONS → 204 (CORS preflight)        │
               │    ├── body.audio_base64 → _handle_audio()   │
               │    └── body.message     → _handle_text()     │
               │                                              │
               │  _handle_text(message, tts)                  │
               │    ├── _ask_bedrock(message) → reply         │
               │    └── [tts] _synthesize_speech(reply)       │
               │                                              │
               │  _handle_audio(body)                         │
               │    ├── s3.put_object(transcribe-temp/uuid)   │
               │    ├── transcribe.start_transcription_job()  │
               │    ├── _wait_for_transcription() [polling]   │
               │    ├── s3.delete_object()                    │
               │    ├── _ask_bedrock(transcript)              │
               │    └── [tts] _synthesize_speech(reply)       │
               └──────────────────────────────────────────────┘
                    │            │             │
          ┌─────────┘    ┌───────┘      ┌─────┘
          ▼              ▼              ▼
   Amazon Bedrock  Amazon Transcribe  Amazon Polly
   (LLM response)  (speech-to-text)  (text-to-speech)
                          │
                    Amazon S3
                  (áudio temporário)
```

---

## 2. Fluxo de Dados Detalhado

### 2.1 Fluxo de Texto

```
POST /chat
Body: { "message": "Olá", "tts": true }
          │
          ▼
  _handle_text("Olá", tts=True)
          │
          ├─► bedrock.converse(messages=[{role:"user", content:"Olá"}])
          │         └─► reply = "Olá! Como posso ajudar?"
          │
          └─► [tts=True] polly.synthesize_speech(text=reply, VoiceId="Camila")
                        └─► mp3_bytes → base64
          │
          ▼
Response 200:
{
  "reply": "Olá! Como posso ajudar?",
  "audio_base64": "<base64 mp3>",     ← só se tts=true
  "audio_mime": "audio/mpeg"           ← só se tts=true
}
```

### 2.2 Fluxo de Voz

```
POST /chat
Body: { "audio_base64": "<base64 webm>", "audio_mime": "audio/webm", "tts": true }
          │
          ▼
  _handle_audio(body)
          │
          ├─► s3.put_object(
          │     Bucket="meu-bucket",
          │     Key="transcribe-temp/abc123.webm",
          │     Body=<decoded bytes>
          │   )
          │
          ├─► transcribe.start_transcription_job(
          │     TranscriptionJobName="chat-abc123",
          │     Media={ MediaFileUri: "s3://meu-bucket/transcribe-temp/abc123.webm" },
          │     MediaFormat="webm",
          │     LanguageCode="pt-BR"
          │   )
          │
          ├─► polling a cada 3s (max 55s)
          │     get_transcription_job → status COMPLETED
          │     urllib.urlopen(TranscriptFileUri) → JSON
          │     transcript = "olá, como vai você"
          │
          ├─► s3.delete_object(Key="transcribe-temp/abc123.webm")
          │
          ├─► _ask_bedrock("olá, como vai você") → reply
          │
          └─► [tts=True] _synthesize_speech(reply) → mp3 base64
          │
          ▼
Response 200:
{
  "reply": "Estou bem, obrigado! Como posso ajudar?",
  "transcript": "olá, como vai você",
  "audio_base64": "<base64 mp3>",
  "audio_mime": "audio/mpeg"
}
```

---

## 3. Design do Frontend

### 3.1 Componentes da Interface

```
┌─────────────────────────────────────────────────┐
│  HEADER                                         │
│  [Logo] Amazon Bedrock / Chat IA   [🔊] [status]│
└─────────────────────────────────────────────────┘
│                                                 │
│  MESSAGES AREA                                  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ [IA avatar]  Bolha da IA (texto)         │  │
│  │              ┌─────────────────────────┐ │  │
│  │              │ 🔊 Ouvir resposta       │ │  │
│  │              │ [■━━━━━━━━━━━━━━━ 0:12] │ │  │  ← audio player
│  │              └─────────────────────────┘ │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Bolha do usuário (voz)  [user avatar]  │  │
│  │  🎤 Mensagem de voz                     │  │
│  │  [■━━━━━━━━━━━━━ 0:08]                  │  │  ← audio player
│  │  "olá como vai você"                    │  │  ← transcrição
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Bolha do usuário (texto)  [user avatar] │  │
│  │  Qual é a capital do Brasil?             │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
│  COMPOSER                                       │
│  ● Gravando…                           0:05     │  ← recording bar (hidden)
│  ┌──────────────────────────┐ [🎤] [Enviar]    │
│  │ Digite ou use o microfone│                   │
│  └──────────────────────────┘                   │
└─────────────────────────────────────────────────┘
```

### 3.2 Estados do Botão de Microfone

| Estado | Visual | aria-pressed | Ação ao clicar |
|---|---|---|---|
| Ocioso | Ícone mic, borda azul | `false` | Inicia gravação |
| Gravando | Ícone stop, borda vermelha, pulse-ring | `true` | Para gravação |
| Desabilitado | Opacidade 55% | — | Nenhuma |

### 3.3 Estados do Botão TTS

| Estado | Visual | aria-pressed | Comportamento |
|---|---|---|---|
| Ativo | Ícone speaker colorido | `true` | Polly é chamado + áudio toca |
| Inativo | Ícone speaker cinza/opaco | `false` | Sem chamada ao Polly |

### 3.4 Máquina de Estados do Frontend

```
          [idle]
             │
    clica 🎤 │ getUserMedia()
             ▼
         [recording]
          │     │
  clica ⏹ │     │ 60s timeout
          ▼     ▼
       MediaRecorder.stop()
             │
             ▼
         [converting]
       blob → base64
             │
             ▼
         [sending]
       POST /chat
             │
         ┌───┴────┐
         │        │
       sucesso  erro
         │        │
         ▼        ▼
     [displaying] [error]
         │
         ▼
       [idle]
```

---

## 4. Design da Lambda

### 4.1 Contrato de API

**Request — Texto:**
```json
{
  "message": "string (obrigatório)",
  "tts": "boolean (opcional, default false)"
}
```

**Request — Áudio:**
```json
{
  "audio_base64": "string base64 (obrigatório)",
  "audio_mime":   "string MIME type (opcional, default audio/webm)",
  "tts":          "boolean (opcional, default false)"
}
```

**Response — Sucesso (texto):**
```json
{
  "reply":        "string",
  "audio_base64": "string base64 (só se tts=true e Polly ok)",
  "audio_mime":   "audio/mpeg (só se tts=true e Polly ok)"
}
```

**Response — Sucesso (áudio):**
```json
{
  "reply":        "string",
  "transcript":   "string",
  "audio_base64": "string base64 (só se tts=true e Polly ok)",
  "audio_mime":   "audio/mpeg (só se tts=true e Polly ok)"
}
```

**Response — Erro:**
```json
{
  "error":  "string (mensagem amigável)",
  "detail": "string (detalhe técnico, opcional)"
}
```

### 4.2 Tratamento de Erros

| Situação | HTTP | Mensagem ao usuário |
|---|---|---|
| `message` e `audio_base64` ausentes | 400 | "Forneça 'message' ou 'audio_base64'." |
| `TRANSCRIBE_BUCKET` não configurado | 500 | "TRANSCRIBE_BUCKET não configurado…" |
| Transcrição falhou (FAILED) | 422 | "Não foi possível transcrever o áudio…" |
| Transcrição timeout (55s) | 422 | "Não foi possível transcrever o áudio…" |
| Polly falha | — | Silenciosa — resposta em texto é retornada sem áudio |
| Bedrock falha | 502 | "Erro ao chamar serviço AWS." + detalhe |
| Erro genérico | 500 | "Erro interno na Lambda." |

### 4.3 Gerenciamento de Jobs do Transcribe

```
job_name = f"chat-{uuid4().hex[:16]}"        # 16 chars hex = colisão improvável
s3_key   = f"transcribe-temp/{uuid4()}.ext"  # uuid completo = único garantido

Polling interval: 3s
Timeout:          55s (dentro do limite de 60s da Lambda)
Limpeza S3:       imediata após COMPLETED ou FAILED (falha silenciosa)
Limpeza Transcribe: jobs expiram automaticamente após 90 dias (AWS managed)
```

---

## 5. Infraestrutura AWS

### 5.1 Recursos necessários

| Recurso | Tipo | Configuração |
|---|---|---|
| `meu-chat-audio-temp` | S3 Bucket | Acesso público bloqueado, lifecycle 1 dia em `transcribe-temp/` |
| Role IAM da Lambda | IAM Role | Policy com Bedrock + Transcribe + Polly + S3 + Logs |
| Lambda Function | Lambda | Python 3.12, timeout 60s, memory 256MB, env vars configuradas |
| API Gateway | HTTP API ou REST API | POST /chat, CORS, payload 10MB |

### 5.2 Policy IAM Completa

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

### 5.3 Variáveis de Ambiente da Lambda

| Variável | Exemplo | Obrigatória |
|---|---|---|
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` | Sim |
| `ALLOWED_ORIGIN` | `https://chat.inhesta.net` | Sim |
| `TRANSCRIBE_BUCKET` | `meu-chat-audio-temp` | Sim (para voz) |
| `POLLY_VOICE_ID` | `Camila` | Não (default: Camila) |
| `POLLY_ENGINE` | `neural` | Não (default: neural) |
| `AWS_REGION` | `us-east-1` | Não (default: us-east-1) |

---

## 6. Decisões de Design

### Por que S3 + Transcribe assíncrono (não streaming)?

O Amazon Transcribe Streaming exige conexão WebSocket persistente, o que é incompatível
com o modelo request/response do API Gateway + Lambda. A abordagem de job assíncrono
com polling é a mais simples e confiável para este caso de uso.

### Por que base64 e não multipart/form-data?

O frontend é HTML/JS puro sem build step. Enviar JSON com base64 é mais simples de
implementar, depurar e manter do que multipart. A penalidade de tamanho (~33%) é
aceitável para áudios de até 60 segundos.

### Por que Polly no backend e não Web Speech API no frontend?

A Web Speech API do navegador tem suporte inconsistente entre navegadores e não oferece
controle sobre a voz usada. Polly com voz Camila (neural) garante qualidade consistente
e o mesmo resultado em qualquer navegador/dispositivo.

### Por que não manter histórico de conversa?

Cada mensagem enviada ao Bedrock é isolada. Isso é uma limitação de design atual
documentada como fora do escopo. A API `converse` do Bedrock suporta múltiplos turnos —
implementar isso exigiria estado no backend (ex: DynamoDB) ou no frontend, o que está
fora do escopo deste spec.
