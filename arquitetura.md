# Arquitetura â€” Voz Bidirecional com Amazon Transcribe e Amazon Polly

## VisÃ£o Geral

Esta versÃ£o expande o chat de texto com Amazon Bedrock adicionando voz bidirecional:

- **Entrada de voz:** o usuÃ¡rio fala no microfone â†’ **Amazon Transcribe** converte em texto
- **SaÃ­da de voz:** o Bedrock responde em texto â†’ **Amazon Polly** converte em Ã¡udio

O frontend continua sendo HTML/JS/CSS puro sem framework. A Lambda orquestra todos os serviÃ§os.

---

## Diagrama de Componentes

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                         CLIENTE (Navegador)                        â”‚
â”‚                                                                    â”‚
â”‚   HTML + CSS + JavaScript puro (sem framework, sem build step)     â”‚
â”‚                                                                    â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ Campo de texto  â”‚      â”‚  MediaRecorder API (Web nativo)      â”‚ â”‚
â”‚  â”‚ (entrada)       â”‚      â”‚  getUserMedia() â†’ WebM/Opus blob     â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚           â”‚                              â”‚ FileReader â†’ base64     â”‚
â”‚           â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                        â”‚
â”‚                          â”‚ fetch POST â€” JSON + base64             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚      API Gateway        â”‚
              â”‚  HTTP API  POST /chat   â”‚
              â”‚  Payload mÃ¡x: 10 MB     â”‚
              â”‚  CORS configurado       â”‚
              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚ Lambda Proxy Integration
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚            AWS Lambda â€” Python 3.12             â”‚
              â”‚            Timeout: 60s  |  MemÃ³ria: 256 MB     â”‚
              â”‚                                                  â”‚
              â”‚  lambda_handler()                                â”‚
              â”‚    â”œâ”€â”€ OPTIONS â†’ 204 (CORS preflight)           â”‚
              â”‚    â”œâ”€â”€ { audio_base64 } â†’ _handle_audio()       â”‚
              â”‚    â””â”€â”€ { message }     â†’ _handle_text()         â”‚
              â””â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                 â”‚              â”‚                  â”‚
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”
       â”‚Amazon Bedrockâ”‚  â”‚Amazon        â”‚  â”‚Amazon Polly  â”‚
       â”‚Nova Lite v1  â”‚  â”‚Transcribe    â”‚  â”‚Voz: Camila   â”‚
       â”‚(LLM response)â”‚  â”‚(pt-BR)       â”‚  â”‚Engine: neuralâ”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚job assÃ­ncronoâ”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                        â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
                                â”‚ lÃª/escreve
                         â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”
                         â”‚  Amazon S3  â”‚
                         â”‚  Bucket tempâ”‚
                         â”‚  /transcribeâ”‚
                         â”‚  -temp/     â”‚
                         â”‚  TTL: 1 dia â”‚
                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Amazon Transcribe â€” Reconhecimento de Fala (ASR)

### O que Ã©

O Amazon Transcribe Ã© o serviÃ§o gerenciado de reconhecimento automÃ¡tico de fala (ASR) da AWS. Ele converte arquivos de Ã¡udio em texto usando modelos de deep learning treinados para mÃºltiplos idiomas, incluindo `pt-BR`.

### Como Ã© usado neste projeto

O Transcribe opera no modo **job assÃ­ncrono**: recebe um arquivo de Ã¡udio via URI do S3, processa internamente e disponibiliza o resultado como um arquivo JSON em uma URL temporÃ¡ria.

```
Lambda â†’ S3.put_object(audio.webm)
       â†’ Transcribe.start_transcription_job(s3://bucket/audio.webm, pt-BR)
       â†’ polling GetTranscriptionJob a cada 3s
       â†’ status COMPLETED â†’ baixa JSON da TranscriptFileUri
       â†’ extrai results.transcripts[0].transcript
       â†’ S3.delete_object(audio.webm)
```

### ParÃ¢metros do job

| ParÃ¢metro | Valor utilizado | Motivo |
|---|---|---|
| `LanguageCode` | `pt-BR` | Idioma do projeto |
| `MediaFormat` | Detectado pelo MIME do Ã¡udio | Suporta webm, ogg, mp4, wav, flac |
| `ShowSpeakerLabels` | `False` | Chat individual â€” sem diarizaÃ§Ã£o |
| Timeout de polling | 55 segundos | Deixa 5s de margem no timeout de 60s da Lambda |
| Intervalo de polling | 3 segundos | EquilÃ­brio entre velocidade e custo de chamadas |

### Formatos de Ã¡udio suportados

| MIME Type | ExtensÃ£o | Formato Transcribe |
|---|---|---|
| `audio/webm` | `.webm` | `webm` (padrÃ£o do Chrome/Firefox) |
| `audio/ogg` | `.ogg` | `ogg` |
| `audio/mp4` | `.mp4` | `mp4` |
| `audio/wav` / `audio/x-wav` | `.wav` | `wav` |
| `audio/flac` | `.flac` | `flac` |

### Por que job assÃ­ncrono e nÃ£o Transcribe Streaming?

O Transcribe Streaming exige uma conexÃ£o WebSocket persistente bidirecional. Essa abordagem Ã© incompatÃ­vel com o modelo de requisiÃ§Ã£o/resposta do API Gateway + Lambda, que fecha a conexÃ£o ao tÃ©rmino da funÃ§Ã£o. O job assÃ­ncrono com polling Ã© a soluÃ§Ã£o padrÃ£o para este padrÃ£o de arquitetura.

### Fluxo de dados e privacidade

O Ã¡udio do usuÃ¡rio percorre este caminho:
1. Navegador â†’ Lambda (base64 no corpo JSON)
2. Lambda â†’ S3 `transcribe-temp/uuid.webm` (arquivo temporÃ¡rio)
3. S3 â†’ Transcribe (URI do arquivo)
4. Transcribe â†’ URL prÃ©-assinada com JSON de resultado
5. Lambda deleta o arquivo do S3 imediatamente apÃ³s ler o resultado
6. Regra de ciclo de vida no bucket: exclui automaticamente apÃ³s 1 dia (fallback)

O Ã¡udio **nunca Ã© armazenado permanentemente**.

---

## Amazon Polly â€” SÃ­ntese de Fala (TTS)

### O que Ã©

O Amazon Polly Ã© o serviÃ§o gerenciado de sÃ­ntese de texto em fala (TTS) da AWS. Ele converte texto em Ã¡udio MP3 usando vozes neurais treinadas com deep learning, produzindo fala com entonaÃ§Ã£o, ritmo e naturalidade prÃ³ximos Ã  fala humana.

### Como Ã© usado neste projeto

O Polly opera no modo **sÃ­ncrono**: recebe o texto e retorna imediatamente um stream de Ã¡udio MP3. NÃ£o hÃ¡ armazenamento intermediÃ¡rio.

```
Lambda â†’ Polly.synthesize_speech(text, VoiceId=Camila, Engine=neural, OutputFormat=mp3)
       â†’ AudioStream (bytes)
       â†’ base64.b64encode(stream)
       â†’ retorna audio_base64 + audio_mime no JSON de resposta
```

### ParÃ¢metros utilizados

| ParÃ¢metro | Valor | Motivo |
|---|---|---|
| `VoiceId` | `Camila` | Ãšnica voz neural feminina pt-BR disponÃ­vel |
| `Engine` | `neural` | Qualidade superior â€” entonaÃ§Ã£o natural |
| `OutputFormat` | `mp3` | CompatÃ­vel com todos os navegadores modernos |
| `LanguageCode` | `pt-BR` | PortuguÃªs do Brasil |
| Limite de texto | 2.900 caracteres | Margem de seguranÃ§a abaixo do limite de 3.000 do Polly |

### Voz Camila â€” neural vs standard

A AWS oferece duas engines para o Polly:

| Engine | Qualidade | Disponibilidade pt-BR | Custo |
|---|---|---|---|
| `neural` | Alta â€” deep learning, entonaÃ§Ã£o natural | Camila (feminino) | Maior |
| `standard` | BÃ¡sica â€” concatenaÃ§Ã£o de fonemas | Camila, VitÃ³ria, Ricardo | Menor |

A engine `neural` foi escolhida pela qualidade perceptivelmente superior na fala conversacional, que Ã© o contexto de uso do chat.

### Outras vozes pt-BR disponÃ­veis

| Voz | GÃªnero | Engine disponÃ­vel |
|---|---|---|
| `Camila` | Feminino | neural, standard |
| `VitÃ³ria` | Feminino | standard |
| `Ricardo` | Masculino | standard |

Para trocar a voz, altere a variÃ¡vel de ambiente `POLLY_VOICE_ID` na Lambda.

### Quando o Polly Ã© chamado

O Polly Ã© **opcional** e controlado pelo parÃ¢metro `tts` na requisiÃ§Ã£o:
- `tts: false` â†’ apenas texto Ã© retornado (padrÃ£o)
- `tts: true` â†’ texto + Ã¡udio MP3 base64 sÃ£o retornados

O frontend envia `tts: true` somente quando o botÃ£o ðŸ”Š estÃ¡ ativado.

---

## Amazon S3 â€” IntermediÃ¡rio do Transcribe

O Transcribe nÃ£o aceita Ã¡udio enviado diretamente na chamada de API â€” ele precisa de um URI do S3. O bucket serve exclusivamente como Ã¡rea de trÃ¢nsito:

| Aspecto | ConfiguraÃ§Ã£o |
|---|---|
| Acesso pÃºblico | Bloqueado (Block Public Access ativado) |
| Prefixo dos arquivos | `transcribe-temp/` |
| Tempo de vida | Deletado pela Lambda apÃ³s transcriÃ§Ã£o + regra de ciclo de vida de 1 dia como fallback |
| RegiÃ£o | Mesma da Lambda e do Transcribe (`us-east-1`) |

---

## Fluxo 1 â€” Mensagem de Texto

```
UsuÃ¡rio digita â†’ submit form
        â†“
fetch POST /chat { message: "...", tts: true/false }
        â†“
Lambda _handle_text()
        â”œâ”€â–º Bedrock.converse() â†’ resposta em texto
        â””â”€â–º [tts=true] Polly.synthesize_speech() â†’ MP3 base64
        â†“
Response 200 { reply, audio_base64?, audio_mime? }
        â†“
Frontend: exibe bolha de texto + [player de Ã¡udio se tts ativo]
```

---

## Fluxo 2 â€” Mensagem de Voz

```
UsuÃ¡rio clica ðŸŽ¤ â†’ MediaRecorder grava
        â†“
UsuÃ¡rio clica â¹ â†’ blob WebM/Opus
        â†“
FileReader â†’ base64
        â†“
fetch POST /chat { audio_base64, audio_mime, tts }
        â†“
Lambda _handle_audio()
        â”œâ”€â–º S3.put_object(transcribe-temp/uuid.webm)
        â”œâ”€â–º Transcribe.start_transcription_job(pt-BR)
        â”œâ”€â–º polling a cada 3s (mÃ¡x 55s) â†’ COMPLETED
        â”œâ”€â–º urllib.urlopen(TranscriptFileUri) â†’ texto
        â”œâ”€â–º S3.delete_object()  â† remove imediatamente
        â”œâ”€â–º Bedrock.converse(texto) â†’ resposta
        â””â”€â–º [tts=true] Polly.synthesize_speech() â†’ MP3
        â†“
Response 200 { reply, transcript, audio_base64?, audio_mime? }
        â†“
Frontend: exibe player do usuÃ¡rio + transcriÃ§Ã£o + resposta + [player IA]
```

---

## ServiÃ§os AWS Utilizados

| ServiÃ§o | Papel | RegiÃ£o |
|---|---|---|
| **Amazon Transcribe** â­ | Reconhecimento de fala â€” voz do usuÃ¡rio â†’ texto (pt-BR) | us-east-1 |
| **Amazon Polly** â­ | SÃ­ntese de fala â€” resposta da IA â†’ Ã¡udio MP3 (voz Camila neural) | us-east-1 |
| **Amazon S3** | Armazenamento temporÃ¡rio do Ã¡udio para o Transcribe | us-east-1 |
| **Amazon Bedrock** | Modelo de linguagem â€” Amazon Nova Lite v1 | us-east-1 |
| **AWS Lambda** | OrquestraÃ§Ã£o de todos os serviÃ§os | us-east-1 |
| **Amazon API Gateway** | HTTP API â€” endpoint pÃºblico POST /chat | us-east-1 |
| **Amazon CloudWatch** | Logs de execuÃ§Ã£o da Lambda | us-east-1 |

*(â­ serviÃ§os adicionados nesta versÃ£o)*

---

## SeguranÃ§a

| Controle | ImplementaÃ§Ã£o |
|---|---|
| Acesso ao bucket S3 | Bloqueio de acesso pÃºblico ativado |
| RetenÃ§Ã£o de dados de Ã¡udio | Deletado imediatamente apÃ³s transcriÃ§Ã£o + ciclo de vida de 1 dia como fallback |
| PermissÃµes IAM | PrivilÃ©gio mÃ­nimo â€” apenas as aÃ§Ãµes necessÃ¡rias, S3 restrito ao bucket especÃ­fico |
| CORS | Apenas o domÃ­nio configurado em `ALLOWED_ORIGIN` Ã© aceito |
| Transporte | HTTPS obrigatÃ³rio (API Gateway + MediaRecorder API exige contexto seguro) |

---

## VariÃ¡veis de Ambiente da Lambda

| VariÃ¡vel | DescriÃ§Ã£o | ObrigatÃ³ria |
|---|---|---|
| `TRANSCRIBE_BUCKET` | Nome do bucket S3 para Ã¡udios temporÃ¡rios | Sim (para voz) |
| `POLLY_VOICE_ID` | ID da voz do Polly (padrÃ£o: `Camila`) | NÃ£o |
| `POLLY_ENGINE` | Engine do Polly: `neural` ou `standard` (padrÃ£o: `neural`) | NÃ£o |
| `BEDROCK_MODEL_ID` | ID do modelo Bedrock (ex: `amazon.nova-lite-v1:0`) | Sim |
| `ALLOWED_ORIGIN` | DomÃ­nio do frontend para CORS | Sim |

---

## DecisÃµes de Design

**Por que job assÃ­ncrono no Transcribe e nÃ£o streaming?**
O Transcribe Streaming exige WebSocket persistente â€” incompatÃ­vel com o modelo request/response do API Gateway + Lambda. O job assÃ­ncrono com polling Ã© a abordagem padrÃ£o e mais simples para este padrÃ£o de arquitetura.

**Por que base64 no payload e nÃ£o multipart/form-data?**
O frontend Ã© HTML/JS puro sem build step. JSON com base64 Ã© mais simples de implementar e depurar. A penalidade de tamanho (~33%) Ã© aceitÃ¡vel para Ã¡udios de atÃ© 60 segundos.

**Por que Polly no backend e nÃ£o Web Speech API no navegador?**
A Web Speech API tem suporte inconsistente entre navegadores e nÃ£o oferece controle de voz. Polly com voz Camila neural garante qualidade e consistÃªncia em qualquer dispositivo.

**Por que deletar o Ã¡udio do S3 imediatamente apÃ³s a transcriÃ§Ã£o?**
Minimizar o tempo de exposiÃ§Ã£o dos dados de voz do usuÃ¡rio. O Ã¡udio nÃ£o tem valor apÃ³s a transcriÃ§Ã£o â€” mantÃª-lo seria desnecessÃ¡rio e um risco de privacidade.
