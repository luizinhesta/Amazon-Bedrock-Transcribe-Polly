# Arquitetura — Chat IA com Voz Bidirecional

## Visão Geral

Este projeto é um chat de inteligência artificial com entrada e saída de voz, rodando inteiramente na AWS. O frontend é HTML/CSS/JavaScript puro, sem estrutura de projeto e sem etapa de compilação. Toda a lógica de IA e processamento de voz roda em uma única função AWS Lambda, que orquestra quatro serviços AWS:

| Serviço | Papel |
|---|---|
| **Amazon Bedrock** | Gera as respostas da IA (modelo de linguagem) |
| **Amazon Transcribe** | Converte o áudio do usuário em texto |
| **Amazon Polly** | Converte a resposta da IA em áudio MP3 |
| **Amazon S3** | Armazena temporariamente o áudio para o Transcribe |

O **API Gateway** expõe a Lambda como endpoint HTTPS. O **CloudWatch** coleta os logs.

---

## Diagrama de Componentes

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Navegador)                           │
│                                                                      │
│   HTML + CSS + JavaScript puro (sem estrutura de projeto, sem etapa de compilação)  │
│                                                                      │
│  ┌─────────────────┐      ┌──────────────────────────────────────┐  │
│  │ Campo de texto  │      │  MediaRecorder API (Web nativo)      │  │
│  │ (entrada)       │      │  getUserMedia() → WebM/Opus blob     │  │
│  └────────┬────────┘      └──────────────┬───────────────────────┘  │
│           │                              │ FileReader → base64       │
│           └──────────────┬───────────────┘                          │
│                          │ fetch POST — JSON + base64               │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │      API Gateway        │
              │  HTTP API  POST /chat   │
              │  Payload máx: 10 MB     │
              │  CORS configurado       │
              └────────────┬────────────┘
                           │ Integração Lambda Proxy
              ┌────────────▼────────────────────────────────────────┐
              │            AWS Lambda — Python 3.12                  │
              │            Timeout: 60s  |  Memória: 256 MB          │
              │                                                      │
              │  lambda_handler()                                    │
              │    ├── OPTIONS → 204 (pré-verificação CORS)             │
              │    ├── { audio_base64 } → _handle_audio()           │
              │    └── { message }     → _handle_text()             │
              └──┬─────────────┬──────────────────┬─────────────────┘
                 │             │                  │
       ┌─────────▼──────┐  ┌───▼──────────┐  ┌───▼──────────┐
       │Amazon Bedrock  │  │Amazon        │  │Amazon Polly  │
       │Nova Lite v1    │  │Transcribe    │  │Voz: Camila   │
       │(LLM response)  │  │(pt-BR)       │  │Engine: neural│
       └────────────────┘  │job assíncrono│  └──────────────┘
                           └──────┬───────┘
                                  │ lê/escreve
                           ┌──────▼──────┐
                           │  Amazon S3  │
                           │  Bucket     │
                           │  transcribe │
                           │  -temp/     │
                           │  TTL: 1 dia │
                           └─────────────┘
```

---

## Serviços AWS — Detalhamento

### Amazon Bedrock — Geração de Respostas

O Amazon Bedrock é a plataforma de IA generativa gerenciada da AWS. Oferece acesso a modelos de linguagem de grandes provedores sem necessidade de gerenciar infraestrutura.

**Modelo utilizado:** Amazon Nova Lite v1 (`amazon.nova-lite-v1:0`)

Nova Lite é um modelo multimodal leve da Amazon, otimizado para velocidade e custo, com boa qualidade em conversas em português.

**Como é chamado neste projeto:**

A Lambda usa a **Converse API** do Bedrock, que fornece uma interface padronizada independente do modelo:

```python
bedrock_runtime.converse(
    modelId="amazon.nova-lite-v1:0",
    system=[{ "text": "Você é um assistente..." }],
    messages=[{ "role": "user", "content": [{ "text": mensagem }] }],
    inferenceConfig={ "maxTokens": 350, "temperature": 0.7, "topP": 0.9 }
)
```

**Parâmetros de inferência:**

| Parâmetro | Valor | Efeito |
|---|---|---|
| `maxTokens` | 350 | Limita o tamanho da resposta |
| `temperature` | 0.7 | Criatividade moderada |
| `topP` | 0.9 | Diversidade controlada nas respostas |

**System prompt:** A Lambda instrui o modelo a responder sempre em português do Brasil, com clareza e objetividade, preferindo respostas curtas (máximo 8 linhas).

> O modelo precisa ser habilitado explicitamente no Console do Amazon Bedrock antes do uso. Consulte o guia de implementação.

---

### Amazon Transcribe — Reconhecimento de Fala (ASR)

O Amazon Transcribe é o serviço gerenciado de reconhecimento automático de fala da AWS. Converte arquivos de áudio em texto usando modelos de aprendizado profundo treinados para múltiplos idiomas, incluindo `pt-BR`.

**Modo de operação:** job assíncrono

O Transcribe não processa áudio em tempo real neste projeto. Recebe um arquivo via URI do S3, processa internamente e disponibiliza o resultado como JSON em uma URL temporária.

```
Lambda → S3.put_object(audio.webm)
       → Transcribe.start_transcription_job(s3://bucket/audio.webm, pt-BR)
       → verificação a cada 3s
       → status COMPLETED → baixa JSON da TranscriptFileUri
       → extrai results.transcripts[0].transcript
       → S3.delete_object(audio.webm)
```

**Parâmetros do job:**

| Parâmetro | Valor | Motivo |
|---|---|---|
| `LanguageCode` | `pt-BR` | Idioma do projeto |
| `MediaFormat` | Detectado pelo MIME do áudio | Suporta webm, ogg, mp4, wav, flac |
| `ShowSpeakerLabels` | `False` | Chat individual — sem diarização |
| Timeout de polling | 55 segundos | Deixa 5s de margem no tempo limite de 60s da Lambda |
| Intervalo de verificação | 3 segundos | Equilíbrio entre velocidade e custo de chamadas |

**Formatos de áudio suportados:**

| MIME Type | Extensão | Formato Transcribe |
|---|---|---|
| `audio/webm` | `.webm` | `webm` (padrão Chrome/Firefox) |
| `audio/ogg` | `.ogg` | `ogg` |
| `audio/mp4` | `.mp4` | `mp4` |
| `audio/wav` / `audio/x-wav` | `.wav` | `wav` |
| `audio/flac` | `.flac` | `flac` |

**Por que job assíncrono e não Transcribe Streaming?**

O Transcribe Streaming exige uma conexão WebSocket persistente bidirecional. Essa abordagem é incompatível com o modelo de requisição/resposta do API Gateway + Lambda, que fecha a conexão ao término da função. O job assíncrono com verificação periódica é a solução padrão para este padrão de arquitetura.

---

### Amazon Polly — Síntese de Fala

O Amazon Polly é o serviço gerenciado de síntese de texto em fala da AWS. Converte texto em áudio MP3 usando vozes neurais treinadas com aprendizado profundo.

**Modo de operação:** síncrono

O Polly recebe o texto e retorna imediatamente um stream de áudio MP3. Não há armazenamento intermediário.

```
Lambda → Polly.synthesize_speech(text, VoiceId=Camila, Engine=neural, OutputFormat=mp3)
       → AudioStream (bytes)
       → base64.b64encode(stream)
       → retorna audio_base64 + audio_mime no JSON de resposta
```

**Parâmetros utilizados:**

| Parâmetro | Valor | Motivo |
|---|---|---|
| `VoiceId` | `Camila` | Única voz neural feminina pt-BR disponível |
| Motor | `neural` | Qualidade superior — entonação natural |
| `OutputFormat` | `mp3` | Compatível com todos os navegadores modernos |
| `LanguageCode` | `pt-BR` | Português do Brasil |
| Limite de texto | 2.900 caracteres | Margem de segurança abaixo do limite de 3.000 do Polly |

**Vozes pt-BR disponíveis no Polly:**

| Voz | Gênero | Motor disponível |
|---|---|---|
| `Camila` | Feminino | neural, standard |
| `Vitória` | Feminino | standard |
| `Ricardo` | Masculino | standard |

O motor `neural` foi escolhida pela qualidade perceptivelmente superior na fala conversacional. Para trocar a voz, altere a variável de ambiente `POLLY_VOICE_ID` na Lambda.

**O Polly é opcional:** o frontend envia `tts: true` somente quando o botão 🔊 está ativado. Quando `tts: false`, a Lambda não chama o Polly e retorna apenas texto.

---

### Amazon S3 — Armazenamento Temporário

O Transcribe não aceita áudio enviado diretamente na chamada de API — ele precisa de um URI do S3. O bucket serve exclusivamente como área de trânsito:

| Aspecto | Configuração |
|---|---|
| Acesso público | Bloqueado (bloqueio de acesso público ativado) |
| Prefixo dos arquivos | `transcribe-temp/` |
| Tempo de vida | Deletado pela Lambda após transcrição + regra de ciclo de vida de 1 dia como fallback |
| Região | Mesma da Lambda e do Transcribe (`us-east-1`) |

O áudio **nunca é armazenado permanentemente**. O caminho do dado é:

1. Navegador → Lambda (base64 no corpo JSON)
2. Lambda → S3 `transcribe-temp/uuid.webm`
3. S3 → Transcribe (URI do arquivo)
4. Transcribe → URL pré-assinada com JSON do resultado
5. Lambda deleta o arquivo do S3 imediatamente após ler o resultado
6. Regra de ciclo de vida no bucket: exclui automaticamente após 1 dia (fallback)

---

### AWS Lambda — Orquestração

A Lambda é o núcleo do backend. Uma única função Python 3.12 recebe todas as requisições e coordena os demais serviços.

**Configurações:**

| Parâmetro | Valor | Motivo |
|---|---|---|
| Runtime | Python 3.12 | Suporte nativo ao boto3 |
| Tempo limite | 60 segundos | Tempo necessário para o job do Transcribe completar |
| Memória | 256 MB | Suficiente para processar áudio base64 |
| Acionador | API Gateway (HTTP API) | Exposição via HTTPS |

**Lógica de roteamento:**

```
lambda_handler(event)
  ├── method == OPTIONS  → retorna 204 (pré-verificação CORS)
  ├── body.audio_base64  → _handle_audio()
  └── body.message       → _handle_text()
```

**Clientes boto3** são instanciados fora do manipulador para reutilização entre invocações ativas (reduz latência).

---

### Amazon API Gateway — Endpoint HTTPS

O API Gateway expõe a Lambda como endpoint HTTP público.

**Configuração utilizada:** HTTP API (mais simples e barata que REST API)

| Aspecto | Configuração |
|---|---|
| Tipo | HTTP API |
| Rota | `POST /chat` |
| Integração | Proxy da Lambda |
| Tamanho máximo de payload | 10 MB (necessário para áudio base64) |
| CORS | Configurado pela variável `ALLOWED_ORIGIN` na Lambda |

---

## Fluxo 1 — Mensagem de Texto

```
Usuário digita → submit form
        ↓
fetch POST /chat { message: "...", tts: true/false }
        ↓
Lambda _handle_text()
        ├─► Bedrock.converse() → resposta em texto
        └─► [síntese de voz ativa] Polly.synthesize_speech() → MP3 base64
        ↓
Response 200 { reply, audio_base64?, audio_mime? }
        ↓
Frontend: exibe bolha de texto + [reprodutor de áudio se síntese ativa]
```

---

## Fluxo 2 — Mensagem de Voz

```
Usuário clica 🎤 → MediaRecorder grava
        ↓
Usuário clica ⏹ → blob WebM/Opus
        ↓
FileReader → base64
        ↓
fetch POST /chat { audio_base64, audio_mime, tts }
        ↓
Lambda _handle_audio()
        ├─► S3.put_object(transcribe-temp/uuid.webm)
        ├─► Transcribe.start_transcription_job(pt-BR)
        ├─► verificação a cada 3s (máx 55s) → COMPLETED
        ├─► urllib.urlopen(TranscriptFileUri) → texto
        ├─► S3.delete_object()  ← remove imediatamente
        ├─► Bedrock.converse(texto) → resposta
        └─► [síntese de voz ativa] Polly.synthesize_speech() → MP3
        ↓
Response 200 { reply, transcript, audio_base64?, audio_mime? }
        ↓
Frontend: exibe reprodutor do usuário + transcrição + resposta + [reprodutor IA]
```

---

## Frontend — Interface do Chat

O frontend é composto por três arquivos:

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura da interface: cabeçalho, lista de mensagens, formulário de envio |
| `style.css` | Estilos visuais do chat |
| `script.js` | Toda a lógica: envio de texto, gravação de voz, comunicação com a API, renderização de mensagens |

**Recursos do frontend:**

- **Campo de texto** com auto-resize e envio por Enter
- **Botão 🎤** para gravação de voz (MediaRecorder API), com timer e parada automática em 60s
- **Botão 🔊** para ativar/desativar a síntese de voz da IA
- **Player de áudio inline** nas bolhas de mensagem (gravação do usuário e resposta da IA)
- **Transcrição em itálico** exibida abaixo do player do usuário após a transcrição
- **Indicador de status** da API no cabeçalho

**Formato de comunicação:** JSON via `fetch` (POST). O áudio é enviado como string base64 dentro do JSON — sem multipart, sem dependências externas.

---

## Segurança

| Controle | Implementação |
|---|---|
| Acesso ao bucket S3 | Bloqueio de acesso público ativado |
| Retenção de dados de áudio | Deletado imediatamente após transcrição + ciclo de vida de 1 dia como fallback |
| Permissões IAM | Privilégio mínimo — apenas as ações necessárias, S3 restrito ao bucket específico |
| CORS | Apenas o domínio configurado em `ALLOWED_ORIGIN` é aceito |
| Transporte | HTTPS obrigatório (API Gateway + MediaRecorder API exige contexto seguro) |

---

## Variáveis de Ambiente da Lambda

| Variável | Descrição | Obrigatória |
|---|---|---|
| `BEDROCK_MODEL_ID` | ID do modelo Bedrock (ex: `amazon.nova-lite-v1:0`) | Sim |
| `ALLOWED_ORIGIN` | Domínio do frontend para CORS (ex: `https://meusite.com`) | Sim |
| `TRANSCRIBE_BUCKET` | Nome do bucket S3 para áudios temporários | Sim |
| `POLLY_VOICE_ID` | ID da voz do Polly (padrão: `Camila`) | Não |
| `POLLY_ENGINE` | Motor do Polly: `neural` ou `standard` (padrão: `neural`) | Não |
| `AWS_REGION` | Região AWS (padrão: `us-east-1`) | Não |

---

## Permissões IAM necessárias na role da Lambda

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob", "transcribe:DeleteTranscriptionJob"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::NOME-DO-SEU-BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

---

## Decisões de Design

**Por que job assíncrono no Transcribe e não streaming?**
O Transcribe Streaming exige WebSocket persistente — incompatível com o modelo requisição/resposta do API Gateway + Lambda. O job assíncrono com verificação periódica é a abordagem padrão e mais simples para este padrão de arquitetura.

**Por que base64 no payload e não multipart/form-data?**
O frontend é HTML/JS puro sem etapa de compilação. JSON com base64 é mais simples de implementar e depurar. A penalidade de tamanho (~33%) é aceitável para áudios de até 60 segundos.

**Por que Polly no backend e não Web Speech API no navegador?**
A Web Speech API tem suporte inconsistente entre navegadores e não oferece controle de voz. O Polly com a voz Camila neural garante qualidade e consistência em qualquer dispositivo.

**Por que uma única Lambda para todos os serviços?**
Simplicidade operacional. Um único ponto de entrada, um único deploy, um único conjunto de logs. A orquestração sequencial dos serviços dentro da função é suficiente para o volume de uso de um chat.

**Por que deletar o áudio do S3 imediatamente após a transcrição?**
Minimizar o tempo de exposição dos dados de voz do usuário. O áudio não tem valor após a transcrição — mantê-lo seria desnecessário e um risco de privacidade.
