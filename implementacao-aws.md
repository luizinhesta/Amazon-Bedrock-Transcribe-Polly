# Guia de Implementação — Chat IA com Voz na AWS

> Este guia cobre toda a configuração do zero: criar cada serviço AWS necessário, fazer o deploy do código e validar o funcionamento. Siga as etapas na ordem apresentada.

---

## Visão geral das etapas

| # | Etapa | Console AWS | Tempo estimado |
|---|---|---|---|
| 1 | Habilitar modelo no Amazon Bedrock | Amazon Bedrock | 5 min |
| 2 | Criar a função Lambda | AWS Lambda | 10 min |
| 3 | Criar o API Gateway e conectar à Lambda | API Gateway | 10 min |
| 4 | Criar o bucket S3 para áudios temporários | Amazon S3 | 5 min |
| 5 | Criar e anexar a política IAM à Lambda | IAM | 5 min |
| 6 | Configurar variáveis de ambiente na Lambda | AWS Lambda | 3 min |
| 7 | Ajustar tempo limite e memória da Lambda | AWS Lambda | 2 min |
| 8 | Fazer upload do código da Lambda | AWS Lambda | 5 min |
| 9 | Configurar o frontend (script.js) | Editor de texto | 2 min |
| 10 | Testes de validação | Navegador + CloudWatch | 15 min |

**Tempo total estimado: ~60 minutos**

---

## Etapa 1 — Habilitar o Modelo no Amazon Bedrock

> **Por quê:** O Amazon Bedrock requer que cada modelo seja habilitado explicitamente na conta antes do uso. Sem isso, a Lambda retorna erro de acesso ao chamar o Bedrock.

### 1.1 — Acessar o Bedrock

1. Faça login no [Console AWS](https://console.aws.amazon.com)
2. Certifique-se de estar na região **Leste dos EUA (Norte da Virgínia) — us-east-1** (canto superior direito)
3. Na barra de busca superior, digite `Bedrock`
4. Clique em **Amazon Bedrock** nos resultados

### 1.2 — Acessar o gerenciamento de modelos

1. No menu lateral esquerdo, role até a seção **Configurações do Bedrock**
2. Clique em **Acesso ao modelo**

### 1.3 — Solicitar acesso ao modelo

1. Clique no botão **Modificar acesso ao modelo** (canto superior direito)
2. Na lista de modelos, localize a seção **Amazon**
3. Marque a caixa ao lado de **Nova Lite**
4. Clique em **Próximo**
5. Revise a seleção e clique em **Enviar**

> O acesso pode ser imediato ou levar alguns minutos para ser aprovado.

### 1.4 — Verificar

Aguarde até a coluna **Status de acesso** ao lado de **Amazon Nova Lite** mostrar **Acesso concedido** ✅.

---

## Etapa 2 — Criar a Função Lambda

> **Por quê:** A Lambda é o backend do projeto — ela recebe as requisições do chat, chama o Bedrock, Transcribe e Polly, e retorna as respostas.

### 2.1 — Acessar o Lambda

1. Na barra de busca do Console AWS, digite `Lambda`
2. Clique em **Lambda** nos resultados

### 2.2 — Criar a função

1. Clique em **Criar função** (botão laranja, canto superior direito)
2. Selecione **Criar do zero**
3. Preencha os campos:
   - **Nome da função**: `chat-ia-voz` (ou outro nome de sua preferência)
   - **Tempo de execução**: `Python 3.12`
   - **Arquitetura**: `x86_64`
4. Em **Permissões**, expanda **Alterar a função de execução padrão**
5. Selecione **Criar uma nova função com permissões básicas do Lambda**
   > Isso cria uma função de execução com permissão básica para o CloudWatch. Adicionaremos as demais permissões na Etapa 5.
6. Clique em **Criar função**

✅ **Verificação:** A página da função abre com a mensagem de que a função foi criada com sucesso.

### 2.3 — Anotar o ARN da função

Na página da função, no canto superior direito, copie o **ARN da função** — você precisará dele ao criar o API Gateway.

Formato: `arn:aws:lambda:us-east-1:123456789012:function:chat-ia-voz`

---

## Etapa 3 — Criar o API Gateway e Conectar à Lambda

> **Por quê:** O API Gateway expõe a Lambda como endpoint HTTPS público. O frontend faz requisições para esse endpoint.

### 3.1 — Acessar o API Gateway

1. Na barra de busca do Console AWS, digite `API Gateway`
2. Clique em **API Gateway** nos resultados

### 3.2 — Criar a API

1. Clique em **Criar API**
2. Na seção **API HTTP**, clique em **Compilar**

### 3.3 — Configurar integração

1. Em **Integrações**, clique em **Adicionar integração**
2. Em **Tipo de integração**, selecione **Lambda**
3. Em **Região da AWS**, selecione `us-east-1`
4. Em **Função do Lambda**, selecione a função criada (`chat-ia-voz`)
5. Em **Versão**, selecione `2.0`
6. Clique em **Próximo**

### 3.4 — Configurar rotas

1. Em **Método**, selecione `POST`
2. Em **Caminho do recurso**, digite `/chat`
3. Em **Destino de integração**, confirme que está selecionada sua função Lambda
4. Clique em **Próximo**

### 3.5 — Configurar estágio

1. Em **Nome do estágio**, deixe `$default`
2. Mantenha **Implantação automática** ativado
3. Clique em **Próximo**

### 3.6 — Revisar e criar

1. Revise as configurações
2. Clique em **Criar**

✅ **Verificação:** A API é criada e a página mostra o **URL de invocação** — anote essa URL, você precisará dela no passo 9.

Formato: `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com`

A rota completa do chat será: `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/chat`

### 3.7 — Verificar o tamanho máximo do payload

> **Por quê:** Áudio WebM de 60 segundos convertido para base64 pode chegar a 3–5 MB. O API Gateway precisa aceitar esse tamanho.

Para **API HTTP**, o limite padrão de payload já é **10 MB** — suficiente para este projeto. Não é necessário alterar nada.

✅ **Verificação:** Na seção **Desenvolver → Configurações**, o campo **Versão do formato de payload** mostra `2.0`.

### 3.8 — Configurar CORS

1. No menu lateral esquerdo, clique em **Desenvolver → CORS**
2. Clique em **Configurar**
3. Preencha os campos:
   - **Access-Control-Allow-Origin**: `*` (para testes; substitua pelo domínio em produção)
   - **Access-Control-Allow-Headers**: `Content-Type`
   - **Access-Control-Allow-Methods**: `POST, OPTIONS`
4. Clique em **Salvar**

> O CORS também é controlado na Lambda pela variável `ALLOWED_ORIGIN`. Ambas as configurações (API Gateway e Lambda) precisam estar corretas.

✅ **Verificação:** A seção CORS exibe as origens e os métodos configurados.

---

## Etapa 4 — Criar o Bucket S3 para Áudios Temporários

> **Por quê:** O Amazon Transcribe não aceita áudio enviado diretamente na chamada de API — ele precisa ler de um URI do S3. Este bucket serve como área de trânsito temporário.

### 4.1 — Acessar o S3

1. Na barra de busca do Console AWS, digite `S3`
2. Clique em **S3** nos resultados

### 4.2 — Criar o bucket

1. Clique em **Criar bucket** (botão laranja, canto superior direito)

### 4.3 — Configurações básicas

- **Nome do bucket**: escolha um nome único globalmente — ex: `chat-ia-audio-temp-2024`
  > O nome deve ser único em toda a AWS. Use letras minúsculas, números e hífens. Sem espaços ou caracteres especiais.
- **Região da AWS**: selecione `us-east-1 (Leste dos EUA - Norte da Virgínia)`
  > Deve ser a **mesma região** da Lambda e dos demais serviços.

### 4.4 — Bloquear acesso público

Em **Configurações de bloqueio de acesso público deste bucket**, certifique-se de que **todas as 4 opções estão marcadas** (comportamento padrão):

- ✅ Bloquear todo o acesso público
- ✅ Bloquear o acesso público a buckets e objetos concedido por meio de novas listas de controle de acesso (ACLs)
- ✅ Bloquear o acesso público a buckets e objetos concedido por meio de qualquer lista de controle de acesso (ACL)
- ✅ Bloquear o acesso entre contas e o acesso público a buckets e objetos por meio de qualquer política de bucket público ou ponto de acesso

### 4.5 — Demais configurações

- **Versionamento de bucket**: mantenha `Desabilitar`
- **Criptografia padrão**: mantenha `Criptografia do lado do servidor com chaves gerenciadas pelo Amazon S3 (SSE-S3)`
- Não altere nenhuma outra configuração

### 4.6 — Criar

1. Role até o final da página
2. Clique em **Criar bucket**

✅ **Verificação:** O bucket aparece na lista com o nome que você definiu.

### 4.7 — Configurar expiração automática (regra de ciclo de vida)

> **Por quê:** Caso a Lambda falhe antes de deletar o arquivo, a regra de ciclo de vida garante que o áudio seja removido automaticamente após 1 dia.

1. Clique no nome do bucket para abri-lo
2. Clique na aba **Gerenciamento**
3. Clique em **Criar regra de ciclo de vida**
4. Preencha:
   - **Nome da regra de ciclo de vida**: `delete-temp-audio`
   - **Escopo da regra**: selecione `Limitar o escopo desta regra usando um ou mais filtros`
   - Em **Prefixo**: digite `transcribe-temp/`
   - Em **Ações da regra de ciclo de vida**: marque `Expirar versões atuais dos objetos`
   - Em **Dias após a criação do objeto**: digite `1`
5. Clique em **Criar regra**

✅ **Verificação:** A aba Gerenciamento mostra a regra `delete-temp-audio` com status **Habilitada**.

---

## Etapa 5 — Criar e Anexar a Política IAM à Lambda

> **Por quê:** A função de execução da Lambda precisa de permissões para chamar o Bedrock, Transcribe, Polly, S3 e CloudWatch. Sem isso, cada chamada a esses serviços retorna `AccessDenied`.

### 5.1 — Localizar a função de execução da Lambda

1. Acesse o [Console Lambda](https://console.aws.amazon.com/lambda)
2. Clique na função `chat-ia-voz`
3. Clique na aba **Configuração**
4. No menu lateral esquerdo, clique em **Permissões**
5. Em **Função de execução**, clique no link do nome da função (abre o IAM em nova aba)

### 5.2 — Adicionar política inline

1. Na página da função de execução no IAM, clique em **Adicionar permissões**
2. Clique em **Criar política em linha**

### 5.3 — Inserir a política em JSON

1. No editor de política, clique na aba **JSON**
2. Selecione todo o conteúdo existente (Ctrl+A) e apague
3. Cole o JSON abaixo, substituindo `NOME-DO-SEU-BUCKET` pelo nome exato do bucket criado na Etapa 4:

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

> ⚠️ **Atenção:** Substitua `NOME-DO-SEU-BUCKET` pelo nome exato do bucket.
> Exemplo: `"Resource": "arn:aws:s3:::chat-ia-audio-temp-2024/*"`

### 5.4 — Salvar

1. Clique em **Próximo**
2. Em **Nome da política**: digite `chat-ia-policy`
3. Clique em **Criar política**

✅ **Verificação:** Na aba **Permissões** da função de execução, a política `chat-ia-policy` aparece na seção **Políticas em linha**.

---

## Etapa 6 — Configurar Variáveis de Ambiente na Lambda

> **Por quê:** A Lambda usa variáveis de ambiente para saber o nome do bucket, o modelo Bedrock, a voz do Polly e o domínio permitido no CORS. Sem `TRANSCRIBE_BUCKET`, o fluxo de voz falha imediatamente.

### 6.1 — Acessar as variáveis

1. Acesse a função Lambda `chat-ia-voz`
2. Clique na aba **Configuração**
3. No menu lateral esquerdo, clique em **Variáveis de ambiente**
4. Clique em **Editar**

### 6.2 — Adicionar as variáveis

Clique em **Adicionar variável de ambiente** para cada item abaixo:

| Chave | Valor |
|---|---|
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` |
| `ALLOWED_ORIGIN` | URL onde o `index.html` está hospedado (ex: `https://meusite.com`) |
| `TRANSCRIBE_BUCKET` | Nome exato do bucket criado na Etapa 4 (ex: `chat-ia-audio-temp-2024`) |
| `POLLY_VOICE_ID` | `Camila` |
| `POLLY_ENGINE` | `neural` |

> 💡 **Para testes locais:** se estiver abrindo o `index.html` diretamente no navegador (`file://`) ou via `localhost`, coloque `*` em `ALLOWED_ORIGIN` temporariamente. Em produção, use sempre o domínio HTTPS completo.

### 6.3 — Salvar

1. Clique em **Salvar**

✅ **Verificação:** A seção Variáveis de ambiente lista todas as 5 variáveis configuradas.

---

## Etapa 7 — Ajustar Tempo Limite e Memória da Lambda

> **Por quê:** O Amazon Transcribe leva de 5 a 30 segundos para transcrever áudios curtos. O tempo limite padrão da Lambda é 3 segundos — a função vai expirar antes de receber a transcrição.

### 7.1 — Acessar configuração geral

1. Na aba **Configuração** da Lambda
2. Clique em **Configuração geral** no menu lateral esquerdo
3. Clique em **Editar**

### 7.2 — Alterar tempo limite e memória

1. Em **Tempo limite**:
   - Altere o campo **min** para `1`
   - O campo **seg** deve ficar em `0`
   - Resultado: `1 min 0 seg`
2. Em **Memória**:
   - Verifique se está em pelo menos `256 MB`
   - Se estiver em menos (ex: 128 MB), altere para `256`

### 7.3 — Salvar

1. Clique em **Salvar**

✅ **Verificação:** Configuração geral mostra **Tempo limite: 1 min 0 seg** e **Memória: 256 MB**.

---

## Etapa 8 — Fazer Upload do Código da Lambda

> **Por quê:** O código do repositório (`funcao lambda/funcao.py`) precisa ser enviado para a AWS para que a função execute.

### 8.1 — Verificar o manipulador configurado

Antes do upload, confirme qual manipulador está configurado na Lambda:

1. Em **Configuração → Configuração geral**
2. Veja o campo **Manipulador** — ex: `lambda_function.lambda_handler`
   - A parte antes do ponto (`lambda_function`) é o nome do arquivo `.py` esperado
   - A parte depois do ponto (`lambda_handler`) é a função dentro do arquivo

> Se o manipulador estiver como `lambda_function.lambda_handler`, o arquivo precisa se chamar `lambda_function.py`.

### 8.2 — Opção A: Copiar e colar no editor (mais simples)

1. Na aba **Código** da Lambda, no painel de arquivos à esquerda, clique no arquivo `.py` existente (geralmente `lambda_function.py`)
2. O conteúdo abre no editor
3. Selecione tudo (Ctrl+A) e apague
4. Abra o arquivo `funcao lambda/funcao.py` do repositório no seu computador
5. Copie todo o conteúdo e cole no editor da Lambda
6. Clique em **Implantar** (botão laranja acima do editor)

### 8.3 — Opção B: Upload via arquivo ZIP

1. No seu computador, faça uma cópia do arquivo `funcao lambda/funcao.py`
2. Renomeie a cópia para o nome esperado pelo manipulador (ex: `lambda_function.py`)
3. Crie um arquivo ZIP contendo apenas esse arquivo
4. Na aba **Código** da Lambda, clique em **Fazer upload de** → **Arquivo .zip**
5. Clique em **Fazer upload**, selecione o ZIP criado e clique em **Salvar**

> ⚠️ O nome do arquivo dentro do ZIP deve corresponder ao manipulador. Se o manipulador é `lambda_function.lambda_handler`, o arquivo deve se chamar `lambda_function.py`.

✅ **Verificação:** No editor de código, o conteúdo do arquivo mostra o código do repositório com os comentários do projeto. O campo **Última modificação** mostra a hora atual.

---

## Etapa 9 — Configurar o Frontend

> **Por quê:** O `script.js` precisa da URL do API Gateway para enviar as requisições.

### 9.1 — Abrir o script.js

Abra o arquivo `script.js` do repositório em um editor de texto.

### 9.2 — Atualizar a URL da API

Localize a linha no topo do arquivo:

```javascript
const API_URL = "https://cax0vprdtj.execute-api.us-east-1.amazonaws.com/chat";
```

Substitua pela URL do seu API Gateway criado na Etapa 3 + `/chat`:

```javascript
const API_URL = "https://SEU-ID.execute-api.us-east-1.amazonaws.com/chat";
```

> A URL completa do endpoint é: **URL de invocação** (anotado na Etapa 3) + `/chat`
> Exemplo: `https://ab12cd34ef.execute-api.us-east-1.amazonaws.com/chat`

### 9.3 — Salvar o arquivo

Salve o `script.js`.

### 9.4 — Hospedar o frontend

O chat exige HTTPS para acessar o microfone (exigência da API MediaRecorder). Opções para hospedar:

| Opção | Como usar |
|---|---|
| **Amazon S3 + CloudFront** | Recomendado para produção. Veja a seção abaixo. |
| **Live Server (extensão do VS Code)** | Para testes rápidos locais — instale a extensão e clique em "Go Live" |
| **GitHub Pages** | Gratuito para repositórios públicos |
| **Netlify / Vercel** | Arraste a pasta do projeto para o site |

> Se usar localhost ou `file://`, defina `ALLOWED_ORIGIN=*` na Lambda (apenas para testes).

#### Hospedar no S3 + CloudFront (recomendado para produção)

1. Crie um bucket S3 com **Hospedagem de site estático** habilitada
2. Faça upload de `index.html`, `script.js`, `style.css` e da pasta `imagens/`
3. Crie uma distribuição do CloudFront apontando para o bucket
4. Use o domínio do CloudFront em `ALLOWED_ORIGIN` na Lambda

---

## Etapa 10 — Testes de Validação

> ⚠️ **Requisito:** O chat precisa estar acessível via HTTPS para funcionar com o microfone.

### Teste 10.1 — Verificar conectividade com a API

1. Abra o chat no navegador
2. Verifique se o indicador de status no cabeçalho mostra **"API configurada"** (texto azul)

> Se mostrar outra coisa, verifique se a URL em `API_URL` no `script.js` está correta e salva.

---

### Teste 10.2 — Texto simples (síntese de voz desativada)

1. Certifique-se de que o botão 🔊 está **desativado** (cinza)
2. No campo de texto, digite: `Qual é a capital do Brasil?`
3. Clique em **Enviar** (ou pressione Enter)

✅ **Resultado esperado:** Resposta em texto aparece em menos de 10 segundos. Nenhum player de áudio é exibido.

---

### Teste 10.3 — Texto com síntese de voz ativada

1. Clique no botão 🔊 no cabeçalho (deve ficar colorido e com `aria-pressed="true"`)
2. Digite uma mensagem e clique em **Enviar**

✅ **Resultado esperado:** A bolha de resposta da IA exibe o texto **e** um player de áudio. O áudio toca automaticamente com a voz Camila em português.

---

### Teste 10.4 — Gravação de voz

1. Certifique-se de estar em uma página HTTPS
2. Clique no botão 🎤 (microfone) no campo de envio
3. O navegador exibe um popup solicitando acesso ao microfone — clique em **Permitir**
4. Confirme que a barra de gravação aparece com:
   - Ponto vermelho pulsante (●)
   - Contador de tempo (ex: `0:03`)
   - Texto "Gravando…"
5. Fale claramente: `"Qual é a capital do Brasil?"`
6. Clique no botão ⏹ para parar a gravação

✅ **Resultado esperado:**
- Bolha do usuário com player de áudio da gravação
- Transcrição em itálico abaixo do player (ex: *"qual é a capital do brasil"*)
- Bolha da IA com a resposta correta

Tempo total esperado: menos de 40 segundos.

---

### Teste 10.5 — Voz com síntese de voz (fluxo bidirecional completo)

1. Ative a síntese de voz (botão 🔊 colorido)
2. Clique no microfone 🎤, fale uma pergunta e clique em ⏹

✅ **Resultado esperado:**
- Bolha do usuário: player de áudio + transcrição em itálico
- Bolha da IA: texto da resposta + player de áudio
- O áudio da IA toca automaticamente

---

### Teste 10.6 — Parada automática em 60 segundos

1. Clique no microfone e aguarde sem parar manualmente
2. Observe o contador chegar em `1:00`

✅ **Resultado esperado:** A gravação para automaticamente e o áudio é processado normalmente.

---

### Teste 10.7 — Verificar logs no CloudWatch

1. Acesse o Console AWS → **CloudWatch**
2. No menu lateral esquerdo, clique em **Grupos de logs**
3. Na caixa de busca, pesquise `/aws/lambda/chat-ia-voz`
4. Clique no grupo de logs encontrado
5. Clique no stream de log mais recente

✅ **O que verificar nos logs:**
- ❌ Sem erros `AccessDenied` (indica política IAM incorreta)
- ❌ Sem erros `TRANSCRIBE_BUCKET não configurado` (indica variável de ambiente ausente)
- ✅ Linhas com `TranscriptionJobName: chat-xxxxxxxxxxxxxxxx` (job iniciado com sucesso)
- ✅ Sem exceções não tratadas (`Traceback` inesperado)

---

## Solução de Problemas Comuns

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| Status "API pendente" no cabeçalho | `API_URL` no `script.js` não foi atualizada | Atualize a constante `API_URL` com a URL do seu API Gateway |
| Erro de CORS no console do navegador | `ALLOWED_ORIGIN` não corresponde ao domínio do frontend | Corrija a variável `ALLOWED_ORIGIN` na Lambda para corresponder exatamente ao domínio (sem barra no final) |
| "Microfone negado" ou botão não funciona | Página não está em HTTPS | Hospede o `index.html` via HTTPS ou use `localhost` com servidor local |
| `TRANSCRIBE_BUCKET não configurado` no log | Variável de ambiente ausente | Refaça a Etapa 6 e verifique se a variável foi salva |
| `AccessDenied` no CloudWatch | Política IAM incompleta ou nome do bucket incorreto | Refaça a Etapa 5 e verifique o ARN do bucket no campo `Resource` da política |
| Lambda expira antes de concluir | Tempo limite ainda está em 3 segundos | Refaça a Etapa 7 e aumente o tempo limite para 60 segundos |
| Erro 413 ao enviar áudio | Limite de payload do API Gateway excedido | Verifique se o tipo da API é HTTP API (limite padrão de 10 MB) |
| "Não foi possível transcrever o áudio" | Áudio muito curto, silencioso ou com muito ruído | Fale por pelo menos 2–3 segundos, claramente, próximo ao microfone |
| Resposta sem áudio mesmo com síntese ativada | Polly falhou — provavelmente motor ou voz incorretos | Verifique se `POLLY_VOICE_ID=Camila` e `POLLY_ENGINE=neural` nos logs do CloudWatch |
| Modelo Bedrock retorna erro de acesso | Modelo não habilitado na conta | Refaça a Etapa 1 e aguarde o status **Acesso concedido** |
| Erro 403 em todas as respostas | CORS bloqueado pelo API Gateway ou pela Lambda | Verifique a configuração de CORS no API Gateway (Etapa 3.8) e a variável `ALLOWED_ORIGIN` (Etapa 6) |
| Função Lambda não encontrada | Manipulador configurado incorretamente | Vá em Configuração → Configuração geral e verifique o campo **Manipulador**. Deve ser `lambda_function.lambda_handler` se o arquivo se chama `lambda_function.py` |
