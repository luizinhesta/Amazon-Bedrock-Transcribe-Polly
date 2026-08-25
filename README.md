# AWS Voice Chat com Bedrock

> **Evolução do projeto [Chat IA com Amazon Bedrock](https://github.com/).**
> A versão anterior cobria o chat de texto com Amazon Bedrock. Esta versão adiciona entrada e saída de voz usando **Amazon Transcribe** e **Amazon Polly**.

---

## O que foi adicionado nesta versão

| Novidade | Serviço responsável | Direção |
|---|---|---|
| O usuário fala pelo microfone e o texto é extraído automaticamente | **Amazon Transcribe** | Entrada — voz → texto |
| A IA responde em áudio com voz natural em português | **Amazon Polly** | Saída — texto → voz |
| Bucket S3 para trânsito do áudio até o Transcribe | **Amazon S3** | Intermediário |

O Amazon Bedrock continua sendo o cérebro da IA — Transcribe e Polly adicionam os "ouvidos" e a "voz".

---

## Amazon Transcribe — entrada de voz

O Amazon Transcribe é o serviço de reconhecimento de fala (ASR — *Automatic Speech Recognition*) da AWS. Neste projeto ele é usado para transcrever o áudio gravado pelo usuário diretamente no navegador.

**Como funciona neste projeto:**
- O navegador captura o áudio via **MediaRecorder API** (formato WebM/Opus)
- O áudio é convertido para base64 e enviado à Lambda
- A Lambda salva o arquivo temporariamente no S3
- Um job de transcrição é iniciado no Transcribe com idioma `pt-BR`
- A Lambda aguarda o job concluir (polling a cada 3 segundos, máximo 55 segundos)
- O texto transcrito é enviado ao Bedrock como pergunta do usuário
- O arquivo de áudio é deletado do S3 imediatamente após a transcrição

**Configurações utilizadas:**
| Parâmetro | Valor |
|---|---|
| Idioma | `pt-BR` (Português do Brasil) |
| Formato de entrada | WebM, OGG, MP4, WAV, FLAC |
| Modo | Job assíncrono (não streaming) |
| Timeout máximo | 55 segundos |
| Armazenamento temporário | Amazon S3 — prefixo `transcribe-temp/` |

---

## Amazon Polly — saída de voz

O Amazon Polly é o serviço de síntese de fala (TTS — *Text-to-Speech*) da AWS. Neste projeto ele converte a resposta textual do Bedrock em áudio MP3 com voz natural em português.

**Como funciona neste projeto:**
- Após o Bedrock gerar a resposta em texto, a Lambda chama o Polly
- O Polly retorna um stream de áudio MP3
- O áudio é convertido para base64 e enviado ao frontend junto com a resposta
- O frontend exibe um player de áudio e toca automaticamente

A síntese de voz é **opcional** — o botão 🔊 no cabeçalho do chat liga e desliga. Quando desligado, apenas o texto é exibido.

**Configurações utilizadas:**
| Parâmetro | Valor | Descrição |
|---|---|---|
| Voz | `Camila` | Voz feminina, pt-BR |
| Engine | `neural` | Qualidade superior, som natural |
| Formato de saída | `mp3` | Compatível com todos os navegadores |
| Idioma | `pt-BR` | Português do Brasil |
| Limite de caracteres | 2.900 por chamada | Respostas longas são truncadas |

**Por que a voz Camila neural?**
A engine neural do Polly usa deep learning para gerar fala com entonação e ritmo naturais, bem diferente da engine standard. A voz Camila é a opção neural disponível para pt-BR com maior naturalidade.

---

## Fluxo completo com voz

```
Usuário fala → microfone no navegador
      ↓
MediaRecorder API → blob WebM/Opus
      ↓
Lambda → salva no S3 → Amazon Transcribe
      ↓
Texto transcrito → Amazon Bedrock (Nova Lite)
      ↓
Resposta em texto → Amazon Polly (Camila neural)
      ↓
MP3 base64 → navegador → player de áudio (toca automaticamente)
```

---

## Tecnologias utilizadas

| Serviço | Papel neste projeto |
|---|---|
| **Amazon Transcribe** ⭐ | Reconhecimento de fala — voz do usuário → texto |
| **Amazon Polly** ⭐ | Síntese de fala — resposta da IA → áudio |
| **Amazon S3** | Armazenamento temporário do áudio para o Transcribe |
| **Amazon Bedrock** — Nova Lite v1 | Geração da resposta (herdado do projeto anterior) |
| **AWS Lambda** — Python 3.12 | Orquestração de todos os serviços |
| **Amazon API Gateway** | Exposição da Lambda via HTTPS |
| **Amazon CloudWatch** | Logs de execução |

*(⭐ serviços em destaque nesta versão)*

---

## Estrutura do projeto

```
Amazon-Bedrock-Chat-IA/
├── index.html              # Interface do chat
├── script.js               # Frontend: texto + gravação de voz (MediaRecorder API)
├── style.css               # Estilos da interface
├── funcao lambda/
│   └── funcao.py           # Lambda: Bedrock + Transcribe + Polly + S3
├── policy/
│   └── POLICY-bedrock      # Política IAM da role da Lambda
├── imagens/                # Imagens da interface
├── arquitetura.md          # Arquitetura detalhada: Transcribe, Polly e demais serviços
├── implementacao-aws.md    # Passo a passo de configuração no Console AWS
└── README.md               # Este arquivo
```

---

## Pré-requisitos

- Projeto anterior configurado (Lambda + API Gateway + Amazon Bedrock funcionando)
- Bucket S3 criado para áudios temporários
- Política IAM da Lambda atualizada com permissões para Transcribe, Polly e S3
- Navegador com suporte a MediaRecorder API: Chrome 89+, Firefox 86+, Edge 91+, Safari 14.1+
- HTTPS obrigatório para acesso ao microfone (exigência da MediaRecorder API)

---

## Variáveis de ambiente da Lambda

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `TRANSCRIBE_BUCKET` | **Sim** | — | Nome do bucket S3 para áudios temporários |
| `POLLY_VOICE_ID` | Não | `Camila` | Voz do Amazon Polly |
| `POLLY_ENGINE` | Não | `neural` | Engine do Polly: `neural` ou `standard` |
| `BEDROCK_MODEL_ID` | Sim | `amazon.nova-lite-v1:0` | Modelo Bedrock (herdado) |
| `ALLOWED_ORIGIN` | Sim | — | Domínio do frontend para CORS |
| `AWS_REGION` | Não | `us-east-1` | Região dos serviços |

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`arquitetura.md`](./arquitetura.md) | Arquitetura detalhada: como Transcribe, Polly e os demais serviços se integram |
| [`implementacao-aws.md`](./implementacao-aws.md) | Passo a passo de configuração no Console AWS |
