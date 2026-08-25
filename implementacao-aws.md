# Guia de Implementação — Amazon Bedrock Chat IA com Voz

> **Pré-requisito:** O código já está pronto (`index.html`, `script.js`, `style.css`,
> `funcao lambda/funcao.py`). Este guia cobre apenas a configuração da infraestrutura
> AWS e o deploy da Lambda.

---

## Etapa 1 — Criar Bucket S3 para Áudios Temporários

> **Por quê:** A Lambda salva o áudio do usuário no S3 antes de enviá-lo ao Transcribe.
> Sem o bucket, qualquer envio de voz retorna HTTP 500 imediatamente.

### 1.1 — Acessar o S3

1. Faça login no [Console AWS](https://console.aws.amazon.com)
2. Na barra de busca superior, digite `S3`
3. Clique em **S3** nos resultados

### 1.2 — Iniciar a criação do bucket

1. Clique no botão laranja **Criar bucket** (canto superior direito da listagem de buckets)

### 1.3 — Preencher configurações básicas

No formulário de criação, preencha:

- **Bucket name**: escolha um nome único globalmente — ex: `meu-chat-audio-temp-2024`
  > O nome deve ser único em toda a AWS (não pode existir em nenhuma outra conta).
  > Use letras minúsculas, números e hífens. Sem espaços ou caracteres especiais.
- **AWS Region**: selecione `us-east-1 (US East - N. Virginia)`
  > Deve ser a **mesma região** da sua função Lambda e dos demais serviços.
- **Propriedade do objeto**: mantenha `ACLs desabilitadas (recomendado)` (seleção padrão)

### 1.4 — Bloquear acesso público

Em **Configurações de bloqueio de acesso público deste bucket**:

- Certifique-se de que **todas as 4 caixas estão marcadas** (comportamento padrão):
  - ✅ Bloquear todo o acesso público
  - ✅ Bloquear o acesso público a buckets e objetos concedido por meio de novas listas de controle de acesso (ACLs)
  - ✅ Bloquear o acesso público a buckets e objetos concedido por meio de qualquer lista de controle de acesso (ACL)
  - ✅ Bloquear o acesso entre contas e o acesso público a buckets e objetos por meio de qualquer política de bucket público ou ponto de acesso

### 1.5 — Configurações restantes

- **Versionamento de bucket**: mantenha `Desabilitar`
- **Criptografia padrão**: mantenha `Criptografia do lado do servidor com chaves gerenciadas pelo Amazon S3 (SSE-S3)`
- Não altere nenhuma outra configuração

### 1.6 — Criar o bucket

1. Role até o final da página
2. Clique no botão laranja **Criar bucket**

✅ **Verificação:** O bucket aparece na lista de buckets com o nome que você definiu.

---

### 1.7 — Configurar expiração automática (Lifecycle)

> **Por quê:** Arquivos de áudio que não forem deletados pela Lambda (ex: em caso de erro)
> serão removidos automaticamente após 1 dia, evitando acúmulo de dados.

1. Na lista de buckets, clique no nome do bucket recém-criado para abri-lo
2. Clique na aba **Gerenciamento** (última aba na barra de navegação do bucket)
3. Clique em **Criar regra de ciclo de vida**

Preencha o formulário:

- **Nome da regra de ciclo de vida**: `delete-temp-audio`
- **Escopo da regra**: selecione `Limitar o escopo desta regra usando um ou mais filtros`
- Em **Tipo de filtro** → **Prefixo**: digite `transcribe-temp/`
  > Isso garante que apenas os arquivos de áudio temporários serão afetados pela regra.
- Em **Ações da regra de ciclo de vida**: marque `Expirar versões atuais dos objetos`
- Em **Expirar versões atuais dos objetos** → campo **Dias após a criação do objeto**: digite `1`

4. Clique em **Criar regra**

✅ **Verificação:** A aba Gerenciamento mostra a regra `delete-temp-audio` com status **Habilitada**.

---

## Etapa 2 — Atualizar a Policy IAM da Lambda

> **Por quê:** A policy atual da role da Lambda provavelmente só tem permissão para
> `bedrock:InvokeModel`. Sem as permissões novas, qualquer chamada a Transcribe, Polly
> ou S3 retorna `AccessDenied`.

### 2.1 — Acessar o IAM

1. Na barra de busca do Console AWS, digite `IAM`
2. Clique em **IAM** nos resultados

### 2.2 — Localizar a role da Lambda

1. No menu lateral esquerdo, clique em **Funções**
2. Na caixa de busca **Pesquisar**, pesquise pelo nome da role da sua Lambda
   > O nome geralmente contém o nome da função Lambda. Ex: `chat-ia-lambda-role`,
   > `minha-lambda-role`, ou similar. Se não souber o nome, acesse a Lambda, vá em
   > **Configuração → Permissões** e clique no nome da role listada em **Função de execução**.
3. Clique no nome da role para abrir a página de detalhes

### 2.3 — Adicionar policy inline

1. Na aba **Permissões**, clique em **Adicionar permissões**
2. No menu suspenso, clique em **Criar política em linha**

### 2.4 — Inserir a policy em JSON

1. No editor de política, clique na aba **JSON** (canto superior direito do editor)
2. **Selecione todo o conteúdo existente** (Ctrl+A) e **apague**
3. Cole exatamente o JSON abaixo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
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
      "Action": [
        "polly:SynthesizeSpeech"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3AudioTemp",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::NOME-DO-SEU-BUCKET/*"
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

> ⚠️ **Atenção:** Substitua `NOME-DO-SEU-BUCKET` pelo nome exato do bucket criado na Etapa 1.
> Exemplo: `"Resource": "arn:aws:s3:::meu-chat-audio-temp-2024/*"`

### 2.5 — Salvar a policy

1. Clique em **Próximo**
2. Em **Nome da política**: digite `chat-ia-voice-policy`
3. Clique em **Criar política**

✅ **Verificação:** Na aba **Permissões** da role, a policy `chat-ia-voice-policy` aparece
na seção **Políticas em linha**.

---

## Etapa 3 — Configurar Variáveis de Ambiente na Lambda

> **Por quê:** A Lambda usa variáveis de ambiente para saber o nome do bucket, o modelo
> Bedrock, a voz do Polly e o domínio permitido no CORS. Sem `TRANSCRIBE_BUCKET`, o
> fluxo de voz falha imediatamente.

### 3.1 — Acessar a Lambda

1. Na barra de busca do Console AWS, digite `Lambda`
2. Clique em **Lambda** nos resultados
3. Clique no nome da sua função Lambda na lista

### 3.2 — Abrir as variáveis de ambiente

1. Clique na aba **Configuração** (logo abaixo do nome da função)
2. No menu lateral esquerdo da seção Configuração, clique em **Variáveis de ambiente**
3. Clique em **Editar**

### 3.3 — Adicionar as variáveis

Clique em **Adicionar variável de ambiente** para cada variável abaixo e preencha os campos **Chave** e **Valor**:

| Chave | Valor |
|---|---|
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` |
| `ALLOWED_ORIGIN` | URL do seu domínio onde o `index.html` está hospedado (ex: `https://chat.exemplo.com`) |
| `TRANSCRIBE_BUCKET` | Nome exato do bucket criado na Etapa 1 (ex: `meu-chat-audio-temp-2024`) |
| `POLLY_VOICE_ID` | `Camila` |
| `POLLY_ENGINE` | `neural` |

> 💡 **Dica para testes:** Se estiver testando localmente com o arquivo aberto diretamente
> no navegador (`file://`), coloque `*` em `ALLOWED_ORIGIN` temporariamente. Para produção,
> use sempre o domínio HTTPS completo.

### 3.4 — Salvar

1. Clique em **Salvar**

✅ **Verificação:** A seção Variáveis de ambiente lista todas as variáveis configuradas.

---

## Etapa 4 — Ajustar o Timeout da Lambda

> **Por quê:** O Amazon Transcribe leva de 5 a 30 segundos para transcrever áudios curtos.
> O timeout padrão da Lambda é 3 segundos — a função vai expirar antes de receber a
> transcrição, resultando em erro para todas as mensagens de voz.

### 4.1 — Acessar a configuração geral

1. Ainda na aba **Configuração** da sua Lambda
2. No menu lateral esquerdo, clique em **Configuração geral**
3. Clique em **Editar**

### 4.2 — Alterar o timeout

1. Em **Tempo limite**:
   - Clique no campo de **minutos** e altere para `1`
   - O campo de **segundos** deve ficar em `0`
   - Resultado esperado: `1 min 0 sec`
2. Em **Memória**: verifique se está em pelo menos `256 MB`
   - Se estiver em menos (ex: 128 MB), altere para `256`

### 4.3 — Salvar

1. Clique em **Salvar**

✅ **Verificação:** Em Configuração geral, o campo **Tempo limite** mostra `1 min 0 sec`.

---

## Etapa 5 — Verificar Configuração do API Gateway

> **Por quê:** Áudio WebM de 60 segundos convertido para base64 pode chegar a 3–5 MB.
> O API Gateway precisa aceitar esse tamanho de payload.

### 5.1 — Acessar o API Gateway

1. Na barra de busca do Console AWS, digite `API Gateway`
2. Clique em **API Gateway** nos resultados
3. Clique na sua API na lista

---

**Se for HTTP API** (tipo mais comum em projetos novos):

1. No menu lateral esquerdo, clique em **Configurações**
2. Verifique o campo **Tamanho máximo do payload**
   - O valor deve ser `10 MB (10485760 bytes)`
3. Se não estiver em 10 MB:
   - Clique em **Editar**
   - Altere para `10485760`
   - Clique em **Salvar**

✅ **Verificação (HTTP API):** Configurações mostra `Tamanho máximo do payload: 10 MB`.

---

**Se for REST API**:

1. No menu lateral esquerdo, clique em **Configurações** (no menu principal da API, não do stage)
2. Role até a seção **Tipos de mídia binária**
3. Se a lista estiver vazia:
   - Clique em **Adicionar tipo de mídia binária**
   - Digite `*/*`
   - Clique em **Salvar alterações**
4. Após salvar, faça o deploy:
   - No menu lateral, clique em **Implantar API**
   - Em **Estágio de implantação**: selecione seu stage (ex: `$default` ou `prod`)
   - Clique em **Implantar**

✅ **Verificação (REST API):** Tipos de mídia binária contém `*/*` e o deploy foi concluído.

---

## Etapa 6 — Fazer Upload do Código da Lambda

> **Por quê:** O código no repositório (`funcao lambda/funcao.py`) foi atualizado com
> suporte a Transcribe, Polly e S3. A função atual na AWS pode estar com a versão antiga.

### 6.1 — Acessar o editor de código

1. Na página da sua função Lambda, clique na aba **Código**
2. O editor de código integrado abre mostrando os arquivos da função

### 6.2 — Verificar o nome do arquivo e handler

Antes de fazer o upload, confirme o handler configurado:

1. Vá em **Configuração → Configuração geral**
2. Veja o campo **Manipulador** — ex: `lambda_function.lambda_handler`
   - A parte antes do ponto (`lambda_function`) é o nome do arquivo `.py` esperado
   - A parte depois do ponto (`lambda_handler`) é a função dentro do arquivo

### 6.3 — Opção A: Copiar e colar (mais simples)

1. Na aba **Código**, no painel de arquivos à esquerda, clique no arquivo `.py` da função
   (geralmente `lambda_function.py`)
2. O conteúdo do arquivo abre no editor
3. Selecione todo o conteúdo (Ctrl+A) e apague
4. Abra o arquivo `funcao lambda/funcao.py` do repositório no seu computador
5. Copie todo o conteúdo e cole no editor
6. Clique em **Implantar** (botão laranja acima do editor de código)

### 6.4 — Opção B: Upload via arquivo ZIP

1. No seu computador, crie uma cópia do arquivo `funcao lambda/funcao.py`
2. Renomeie a cópia para o nome esperado pelo handler (ex: `lambda_function.py`)
3. Crie um arquivo ZIP contendo apenas esse arquivo
4. Na aba **Código** da Lambda, clique em **Fazer upload de** → **Arquivo .zip**
5. Clique em **Fazer upload**, selecione o ZIP criado
6. Clique em **Salvar**

> ⚠️ **Atenção:** O nome do arquivo dentro do ZIP deve corresponder ao handler configurado.
> Se o handler é `lambda_function.lambda_handler`, o arquivo deve se chamar `lambda_function.py`.

✅ **Verificação:** No editor de código, a data de **Última modificação** mostra a hora atual.

---

## Etapa 7 — Habilitar o Modelo Bedrock (se necessário)

> **Por quê:** O Amazon Bedrock requer que os modelos sejam habilitados explicitamente
> antes do uso. Se o modelo não estiver habilitado, a Lambda retornará erro de acesso.

### 7.1 — Acessar o Bedrock

1. Na barra de busca do Console AWS, digite `Bedrock`
2. Clique em **Amazon Bedrock** nos resultados

### 7.2 — Verificar o acesso ao modelo

1. No menu lateral esquerdo, em **Configurações do Bedrock**, clique em **Acesso ao modelo**
2. Na lista de modelos, localize **Amazon Nova Lite**
3. Verifique o status na coluna **Status de acesso**

### 7.3 — Habilitar o modelo (se necessário)

Se o status for diferente de **Acesso concedido** ✅:

1. Clique em **Modificar acesso ao modelo** (botão superior direito)
2. Marque a caixa ao lado de **Amazon Nova Lite**
3. Clique em **Próximo**
4. Revise a seleção e clique em **Enviar**
5. Aguarde até o status mudar para **Acesso concedido** (pode levar alguns minutos)

✅ **Verificação:** Amazon Nova Lite com status **Acesso concedido** ✅.

---

## Etapa 8 — Testes de Validação

> ⚠️ **Requisito:** O chat exige HTTPS para acessar o microfone. Se o `index.html` estiver
> hospedado localmente, use uma extensão como **Live Server** (VS Code), `localhost` via
> servidor HTTP local, ou hospede em um bucket S3 com CloudFront.

### Teste 8.1 — Texto simples (TTS desativado)

1. Abra o chat no navegador
2. Verifique se o indicador de status no cabeçalho mostra **"API configurada"** (cor azul)
   > Se mostrar erro, verifique se a URL da API no `script.js` está correta.
3. No campo de texto, digite: `Qual é a capital do Brasil?`
4. Clique em **Enviar**

✅ **Resultado esperado:** Resposta em texto aparece em menos de 10 segundos. Nenhum player
de áudio é exibido (TTS está desativado por padrão).

---

### Teste 8.2 — Texto com TTS ativado

1. Clique no botão 🔊 no cabeçalho (deve ficar colorido/ativo com `aria-pressed="true"`)
2. No campo de texto, digite uma mensagem e clique em **Enviar**

✅ **Resultado esperado:** A bolha de resposta da IA exibe o texto **e** um player de áudio.
O áudio toca automaticamente.

---

### Teste 8.3 — Gravação de voz

1. Clique no botão 🎤 (microfone) no composer
2. O navegador exibe um popup solicitando acesso ao microfone — clique em **Permitir**
3. Confirme que a barra de gravação aparece com:
   - Ponto vermelho pulsante (●)
   - Timer contando (ex: `0:03`)
   - Texto "Gravando…"
4. Fale claramente: `"Qual é a capital do Brasil?"`
5. Clique no botão ⏹ para parar a gravação

✅ **Resultado esperado:**
- Bolha do usuário com player de áudio da gravação
- Transcrição em itálico abaixo do player (ex: *"qual é a capital do brasil"*)
- Bolha da IA com a resposta correta

Tempo total esperado: menos de 40 segundos.

---

### Teste 8.4 — Voz com TTS (fluxo bidirecional completo)

1. Certifique-se de que o TTS está ativo (botão 🔊 colorido)
2. Clique no microfone 🎤, fale uma pergunta, clique em ⏹ para parar

✅ **Resultado esperado:**
- Bolha do usuário: player de áudio + transcrição em itálico
- Bolha da IA: texto da resposta + player de áudio da resposta
- O áudio da IA toca automaticamente

---

### Teste 8.5 — Parada automática em 60 segundos

1. Clique no microfone e aguarde sem parar manualmente
2. Observe o timer chegar em `1:00`

✅ **Resultado esperado:** A gravação para automaticamente e o áudio é enviado e processado normalmente.

---

### Teste 8.6 — Verificar logs no CloudWatch

1. Acesse o Console AWS → **CloudWatch**
2. No menu lateral esquerdo, clique em **Grupos de logs**
3. Na caixa de busca, pesquise `/aws/lambda/` seguido do nome da sua Lambda
4. Clique no Grupo de logs encontrado
5. Clique no Stream de log mais recente (topo da lista, ordenado por data)

✅ **O que verificar nos logs:**
- ❌ Sem erros `AccessDenied` (indica policy IAM incorreta)
- ❌ Sem erros `TRANSCRIBE_BUCKET não configurado` (indica variável de ambiente ausente)
- ✅ Linhas com `TranscriptionJobName: chat-xxxxxxxxxxxxxxxx` (job iniciado com sucesso)
- ✅ Sem exceções não tratadas (`Traceback` inesperado)

---

## Solução de Problemas Comuns

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| Status "Erro na API" no cabeçalho | URL da API incorreta no `script.js` ou Lambda não deployada | Verifique a constante `API_URL` no `script.js` e confirme que o código foi deployado |
| "Microfone negado" ou botão não funciona | Página não está em HTTPS | Hospede o `index.html` via HTTPS ou use `localhost` com servidor local |
| "TRANSCRIBE_BUCKET não configurado" no log | Variável de ambiente `TRANSCRIBE_BUCKET` ausente | Refaça a Etapa 3 |
| `AccessDenied` no CloudWatch | Policy IAM incompleta ou incorreta | Refaça a Etapa 2, verifique o nome do bucket no Resource |
| Lambda expira com timeout | Tempo limite ainda está em 3 segundos | Refaça a Etapa 4 |
| Erro 413 ao enviar áudio | Limite de payload do API Gateway excedido | Refaça a Etapa 5 |
| "Não foi possível transcrever o áudio" | Áudio muito curto, silencioso ou com muito ruído | Fale por pelo menos 2–3 segundos, claramente, próximo ao microfone |
| Resposta sem áudio (TTS ativo) | Polly falhou silenciosamente | Verifique se `POLLY_VOICE_ID=Camila` e `POLLY_ENGINE=neural` estão corretos nos logs |
| Modelo Bedrock retorna erro de acesso | Modelo não habilitado na conta | Refaça a Etapa 7 |
| Erro 403 nas respostas | CORS bloqueando a requisição | Verifique se `ALLOWED_ORIGIN` bate exatamente com o domínio do frontend |

---

## Resumo das Etapas Obrigatórias

| # | Etapa | Console | Tempo estimado |
|---|---|---|---|
| 1 | Criar bucket S3 + lifecycle | Amazon S3 | 5 min |
| 2 | Atualizar policy IAM | IAM | 5 min |
| 3 | Configurar variáveis de ambiente | Lambda | 3 min |
| 4 | Ajustar timeout para 60s | Lambda | 2 min |
| 5 | Verificar payload do API Gateway | API Gateway | 3 min |
| 6 | Upload do código da Lambda | Lambda | 5 min |
| 7 | Habilitar modelo Bedrock | Amazon Bedrock | 2 min |
| 8 | Executar testes de validação | Navegador + CloudWatch | 15 min |

**Tempo total estimado: ~40 minutos**
