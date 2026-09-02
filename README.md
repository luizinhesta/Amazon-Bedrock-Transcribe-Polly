# Chat IA com Voz — Amazon Bedrock, Transcribe e Polly

Chat de inteligência artificial com voz bidirecional rodando inteiramente na AWS. O usuário pode digitar ou **falar** com a IA, e a IA responde em texto **e em áudio** com voz natural em português.
![Descrição da imagem](<imagens/imagem%20(1).png>)
---

## O que este projeto faz

| Funcionalidade | Serviço responsável | Direção |
|---|---|---|
| Usuário digita uma mensagem e a IA responde | **Amazon Bedrock** | Texto → texto |
| Usuário fala pelo microfone — texto é extraído automaticamente | **Amazon Transcribe** | Voz → texto |
| A IA responde em áudio com voz natural em português | **Amazon Polly** | Texto → voz |
| Hospedagem dos arquivos do site e armazenamento temporário de áudio | **Amazon S3** | Intermediário |

<p align="center">
  <img src="imagens/imagem%20(6).png" width="30%" />
  <img src="imagens/imagem%20(5).png" width="30%" />
  <img src="imagens/imagem%20(7).png" width="30%" />
</p>
<p align="center">
  <img src="imagens/imagem%20(8).png" width="30%" />
</p>

---

## Tecnologias utilizadas

| Serviço / Tecnologia | Papel no projeto |
|---|---|
| **Amazon Bedrock** — Nova Lite v1 | Modelo de linguagem — gera as respostas da IA |
| **Amazon Transcribe** | Reconhecimento de fala — voz do usuário → texto (pt-BR) |
| **Amazon Polly** | Síntese de fala — resposta da IA → áudio MP3 (voz Camila neural) |
| **Amazon S3** | Um único bucket: hospeda os arquivos do site (`index.html`, `script.js`, `style.css`, `imagens/`) e armazena temporariamente os áudios do Transcribe na pasta `transcribe-temp/` |
| **AWS Lambda** — Python 3.12 | Orquestração de todos os serviços AWS |
| **Amazon API Gateway** | Expõe a Lambda como endpoint HTTPS (POST /chat) |
| **Amazon CloudWatch** | Logs de execução da Lambda |
| **HTML + CSS + JavaScript** | Frontend do chat — sem estrutura de projeto, sem etapa de compilação |

![Descrição da imagem](<imagens/imagem%20(22).png>)

---

## Como funciona

### Fluxo de texto

```
Usuário digita → fetch POST /chat { message }
    ↓
API Gateway → Lambda
    ↓
Amazon Bedrock (Nova Lite) → resposta em texto
    ↓
[se síntese de voz ativa] Amazon Polly → áudio MP3
    ↓
{ reply, audio_base64? } → navegador → exibe texto + reprodutor de áudio
```

### Fluxo de voz

```
Usuário fala → MediaRecorder API → blob WebM/Opus
    ↓
FileReader → base64
    ↓
fetch POST /chat { audio_base64, audio_mime, tts }
    ↓
Lambda → S3.put_object(transcribe-temp/uuid.webm)
    ↓
Amazon Transcribe (job assíncrono, pt-BR) → texto transcrito
    ↓
S3.delete_object() ← arquivo removido imediatamente
    ↓
Amazon Bedrock → resposta em texto
    ↓
[se síntese de voz ativa] Amazon Polly → áudio MP3
    ↓
{ reply, transcript, audio_base64? } → navegador
```
![Descrição da imagem](<imagens/imagem%20(2).png>)
---

## Amazon Transcribe — entrada de voz

O Amazon Transcribe é o serviço de reconhecimento automático de fala (ASR) da AWS. Converte o áudio gravado pelo usuário em texto.

**Como funciona neste projeto:**
- O navegador captura o áudio via **MediaRecorder API** (formato WebM/Opus)
- O áudio é convertido para base64 e enviado à Lambda
- A Lambda salva o arquivo temporariamente no S3, na pasta `transcribe-temp/` do bucket do site
- Um job de transcrição é iniciado no Transcribe com idioma `pt-BR`
- A Lambda aguarda o job concluir (verificação a cada 3 segundos, máximo 55 segundos)
- O texto transcrito é enviado ao Bedrock como pergunta do usuário
- O arquivo de áudio é deletado do S3 imediatamente após a transcrição

**Configurações utilizadas:**

| Parâmetro | Valor |
|---|---|
| Idioma | `pt-BR` (Português do Brasil) |
| Formato de entrada | WebM, OGG, MP4, WAV, FLAC |
| Modo | Job assíncrono |
| Timeout máximo | 55 segundos |
| Armazenamento temporário | Amazon S3 — pasta `transcribe-temp/` dentro do bucket do site |

---

## Amazon Polly — saída de voz

O Amazon Polly é o serviço de síntese de texto em fala da AWS. Converte a resposta do Bedrock em áudio MP3 com voz natural em português.

**Como funciona neste projeto:**
- Após o Bedrock gerar a resposta, a Lambda chama o Polly
- O Polly retorna um stream de áudio MP3
- O áudio é convertido para base64 e enviado ao frontend junto com a resposta
- O frontend exibe um player de áudio e toca automaticamente

A síntese de voz é **opcional** — o botão 🔊 no cabeçalho do chat liga e desliga. Quando desligado, apenas o texto é exibido.

**Configurações utilizadas:**

| Parâmetro | Valor | Descrição |
|---|---|---|
| Voz | `Camila` | Voz feminina, pt-BR |
| Motor | `neural` | Qualidade superior, som natural |
| Formato de saída | `mp3` | Compatível com todos os navegadores |
| Idioma | `pt-BR` | Português do Brasil |
| Limite de caracteres | 2.900 por chamada | Respostas longas são truncadas |

---

## Amazon Bedrock — geração de respostas

O Amazon Bedrock é a plataforma de IA generativa da AWS. Neste projeto usa o modelo **Amazon Nova Lite v1**, que oferece boa relação entre custo, velocidade e qualidade para conversas em português.

**Configurações utilizadas:**

| Parâmetro | Valor |
|---|---|
| Modelo | `amazon.nova-lite-v1:0` |
| Max tokens | 350 |
| Temperature | 0.7 |
| Top P | 0.9 |
| Idioma | Português do Brasil (via system prompt) |

---

## Estrutura do projeto

```
Amazon-Bedrock-Transcribe-Polly/
├── index.html                  # Interface do chat (HTML puro)
├── script.js                   # Lógica do frontend: texto + gravação de voz
├── style.css                   # Estilos da interface
├── funcao lambda/
│   └── funcao.py               # Lambda: Bedrock + Transcribe + Polly + S3
├── policy/
│   └── POLICY-bedrock          # Política IAM da role da Lambda
├── imagens/                    # Imagens e ícones da interface
├── README.md                   # Este arquivo
├── arquitetura.md              # Arquitetura detalhada de todos os serviços
└── implementacao-aws.md        # Passo a passo completo de configuração na AWS
```

---

## Pré-requisitos

- Conta AWS ativa
- Acesso ao Console AWS com permissões de administrador (ou IAM suficientes para criar Lambda, API Gateway, S3, IAM roles)
- Navegador moderno com suporte à API MediaRecorder: Chrome 89+, Firefox 86+, Edge 91+, Safari 14.1+
- **HTTPS obrigatório** para acesso ao microfone (exigência da API MediaRecorder)

---

## Variáveis de ambiente da Lambda

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `BEDROCK_MODEL_ID` | **Sim** | `amazon.nova-lite-v1:0` | ID do modelo Bedrock |
| `ALLOWED_ORIGIN` | **Sim** | — | Domínio do frontend para CORS (ex: `https://meusite.com`) |
| `TRANSCRIBE_BUCKET` | **Sim** | — | Nome do bucket S3 (o mesmo que hospeda o site) |
| `POLLY_VOICE_ID` | Não | `Camila` | Voz do Amazon Polly |
| `POLLY_ENGINE` | Não | `neural` | Motor do Polly: `neural` ou `standard` |
| `AWS_REGION` | Não | `us-east-1` | Região dos serviços |

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`arquitetura.md`](./arquitetura.md) | Arquitetura detalhada: como todos os serviços se integram, diagramas de fluxo, decisões de design |
| [`implementacao-aws.md`](./implementacao-aws.md) | Passo a passo completo do zero: criar Lambda, API Gateway, S3, IAM, configurar variáveis, fazer deploy e validar |
