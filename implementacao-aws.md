# Guia de Implementação — Chat IA com Voz na AWS

> Este guia cobre toda a configuração do zero: criar cada serviço AWS necessário, fazer o deploy do código e validar o funcionamento. Siga as etapas na ordem apresentada.

---

## Visão geral das etapas

| # | Etapa | Console AWS | Tempo estimado |
|---|---|---|---|
| 1 | Verificar acesso ao modelo no Amazon Bedrock | Amazon Bedrock | 5 min |
| 2 | Criar a função Lambda | AWS Lambda | 10 min |
| 3 | Criar o API Gateway e conectar à Lambda | API Gateway | 10 min |
| 4 | Criar o bucket S3 e fazer upload do frontend | Amazon S3 | 10 min |
| 5 | Criar e anexar a política IAM à Lambda | IAM | 5 min |
| 6 | Configurar variáveis de ambiente na Lambda | AWS Lambda | 3 min |
| 7 | Ajustar tempo limite e memória da Lambda | AWS Lambda | 2 min |
| 8 | Fazer upload do código da Lambda | AWS Lambda | 5 min |
| 9 | Criar o certificado SSL/TLS no ACM | Certificate Manager | 5 min |
| 10 | Criar a distribuição CloudFront | CloudFront | 15 min |
| 11 | Criar o registro DNS no Route 53 | Route 53 | 5 min |
| 12 | Configurar o frontend e finalizar | Editor de texto | 5 min |
| 13 | Testes de validação | Navegador + CloudWatch | 15 min |

**Tempo total estimado: ~95 minutos**

![Descrição da imagem](<imagens/imagem%20(22).png>)

<p align="center">
  <img src="imagens/imagem%20(6).png" width="30%" />
  <img src="imagens/imagem%20(5).png" width="30%" />
  <img src="imagens/imagem%20(7).png" width="30%" />
</p>
<p align="center">
  <img src="imagens/imagem%20(8).png" width="30%" />
</p>

---

## Etapa 1 — Verificar Acesso ao Modelo no Amazon Bedrock

> **Informação importante:** Desde 2025, todos os modelos da **Amazon** (incluindo o Nova Lite) ficam disponíveis automaticamente na sua conta, sem necessidade de ativação manual. Basta ter as permissões corretas no IAM. Modelos de terceiros (Anthropic, Cohere, etc.) ainda exigem ativação.

### 1.1 — Confirmar que o modelo está disponível

1. Faça login no [Console AWS](https://console.aws.amazon.com)
2. Certifique-se de estar na região **Leste dos EUA (Norte da Virgínia) — us-east-1** (canto superior direito)
3. Na barra de busca superior, digite `Bedrock` e clique em **Amazon Bedrock**
4. No menu lateral esquerdo, clique em **Catálogo de modelos** (em inglês: **Model catalog**)
5. Na caixa de busca, digite `Nova Lite`
6. O modelo **Amazon Nova Lite** deve aparecer na lista

Se o modelo aparecer no catálogo, **você já tem acesso** — pode ir direto para a Etapa 2.

### 1.2 — Caso precise ativar (contas GovCloud ou cenários específicos)

Se por algum motivo o modelo não estiver acessível, o caminho para ativar manualmente é:

1. No menu lateral esquerdo, role até o final
2. Clique em **Acesso ao modelo** (em inglês: **Model access**), que fica dentro da seção **Configurações do Bedrock** / **Bedrock configurations**
3. Clique em **Modificar acesso ao modelo**
4. Localize **Amazon Nova Lite** na lista e marque a caixa
5. Clique em **Próximo** e depois em **Enviar**

> **Não encontrou "Acesso ao modelo"?** Essa opção pode estar oculta para contas comerciais comuns, pois os modelos da Amazon são liberados automaticamente. Nesse caso, não é necessário fazer nada — prossiga para a Etapa 2.

### 1.3 — Verificar

Para confirmar que consegue usar o modelo, acesse **Playgrounds → Chat** no menu lateral e selecione o modelo **Amazon Nova Lite v1**. Se o playground abrir sem erro de permissão, está tudo certo ✅.

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
   - **Nome da função**: `chat-ia-voz`
   - **Tempo de execução**: `Python 3.12`
   - **Arquitetura**: `x86_64`
4. Em **Permissões**, expanda **Alterar a função de execução padrão**
5. Selecione **Criar uma nova função com permissões básicas do Lambda**
   > Isso cria uma função de execução com permissão básica para o CloudWatch. Adicionaremos as demais permissões na Etapa 5.
6. Clique em **Criar função**

✅ **Verificação:** A página da função abre com a mensagem de que a função foi criada com sucesso.

![Descrição da imagem](<imagens/imagem%20(13).png>)

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

1. No campo **Nome da API**, digite `chat-ia-voz`
2. Em **Integrações**, clique em **Adicionar integração**
3. Em **Tipo de integração**, selecione **Lambda**
4. Em **Região da AWS**, selecione `us-east-1`
5. Em **Função do Lambda**, selecione a função criada (`chat-ia-voz`)
6. Em **Versão**, selecione `2.0`
7. Clique em **Próximo**

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

✅ **Verificação:** A API é criada com a mensagem de sucesso no topo da tela.

![Descrição da imagem](<imagens/imagem%20(12).png>)

### 3.7 — Configurar CORS

**Menu lateral esquerdo → Desenvolver → CORS**

1. Clique em **Configurar** (botão no canto superior direito da seção)
2. No campo **Access-Control-Allow-Origin**: clique na caixa, digite `*` e pressione Enter
   > Para testes use `*`. Na Etapa 12 você substituirá pelo domínio final `https://chat.dev.inhesta.net`
3. Confirme que **Access-Control-Allow-Headers** tem `content-type` — se não tiver, adicione
4. Confirme que **Access-Control-Allow-Methods** tem `POST` e `OPTIONS` — se não tiver, adicione
5. Clique em **Salvar**

✅ **Verificação:** Os campos mostram `*` em Origin, `content-type` em Headers, e `POST` + `OPTIONS` em Methods.

### 3.8 — Implantar a API

1. No menu lateral esquerdo, clique em **Implantar → Estágios**
2. Clique no estágio **$default**
3. No canto superior direito, clique em **Implantar**

✅ **Verificação:** A página do estágio mostra o **URL de invocação** — anote essa URL, você precisará dela na Etapa 12.

Formato: `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com`

A rota completa do chat será: `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/chat`

---

![Descrição da imagem](<imagens/imagem%20(3).png>)


## Etapa 4 — Criar o Bucket S3 e Fazer Upload do Frontend

> **Por quê:** O projeto usa **um único bucket S3** para duas finalidades:
> - **Raiz do bucket**: hospeda os arquivos do site (`index.html`, `script.js`, `style.css`, `imagens/`) servidos pelo CloudFront
> - **Pasta `transcribe-temp/`**: área temporária onde a Lambda salva os áudios antes de enviá-los ao Transcribe — criada automaticamente pela Lambda, sem necessidade de criação manual

### 4.1 — Acessar o S3

1. Na barra de busca do Console AWS, digite `S3`
2. Clique em **S3** nos resultados

### 4.2 — Criar o bucket

1. Clique em **Criar bucket** (botão laranja, canto superior direito)

### 4.3 — Configurações básicas

- **Nome do bucket**: escolha um nome único globalmente — ex: `meu-chat-audio-temp-2024`
  > O nome deve ser único em toda a AWS. Use letras minúsculas, números e hífens. Sem espaços ou caracteres especiais. Anote o nome — você vai usá-lo em várias etapas a seguir.
- **Região da AWS**: selecione `us-east-1 (Leste dos EUA - Norte da Virgínia)`
  > Deve ser a **mesma região** da Lambda e dos demais serviços.

![Descrição da imagem](<imagens/imagem%20(18).png>)

### 4.4 — Bloquear acesso público

Em **Configurações de bloqueio de acesso público deste bucket**, certifique-se de que **todas as 4 opções estão marcadas** (comportamento padrão):

- ✅ Bloquear todo o acesso público
- ✅ Bloquear o acesso público a buckets e objetos concedido por meio de novas listas de controle de acesso (ACLs)
- ✅ Bloquear o acesso público a buckets e objetos concedido por meio de qualquer lista de controle de acesso (ACL)
- ✅ Bloquear o acesso entre contas e o acesso público a buckets e objetos por meio de qualquer política de bucket público ou ponto de acesso

> O acesso público fica bloqueado porque o site será servido pelo CloudFront, que acessa o bucket via política OAC — não via URL pública.

### 4.5 — Demais configurações

- **Versionamento de bucket**: mantenha `Desabilitar`
- **Criptografia padrão**: mantenha `Criptografia do lado do servidor com chaves gerenciadas pelo Amazon S3 (SSE-S3)`
- Não altere nenhuma outra configuração

### 4.6 — Criar

1. Role até o final da página
2. Clique em **Criar bucket**

✅ **Verificação:** O bucket aparece na lista com o nome que você definiu.

### 4.7 — Fazer upload dos arquivos do site

1. Clique no nome do bucket para abri-lo
2. Clique em **Carregar**
3. Clique em **Adicionar arquivos** e selecione os seguintes arquivos do repositório:
   - `index.html`
   - `script.js`
   - `style.css`
4. Clique em **Adicionar pasta** e selecione a pasta `imagens/`
5. Clique em **Carregar**

✅ **Verificação:** O bucket mostra `index.html`, `script.js`, `style.css` e a pasta `imagens/` na raiz.

### 4.8 — Configurar expiração automática dos áudios (regra de ciclo de vida)

> **Por quê:** A Lambda deleta o áudio do S3 logo após a transcrição. Esta regra é um fallback — caso a Lambda falhe antes de deletar, o áudio é removido automaticamente após 1 dia.

1. Clique na aba **Gerenciamento**
2. Clique em **Criar regra de ciclo de vida**
3. Preencha:
   - **Nome da regra de ciclo de vida**: `delete-temp-audio`
   - **Escopo da regra**: selecione `Limitar o escopo desta regra usando um ou mais filtros`
   - Em **Prefixo**: digite `transcribe-temp/`
   - Em **Ações da regra de ciclo de vida**: marque `Expirar versões atuais dos objetos`
   - Em **Dias após a criação do objeto**: digite `1`
4. Clique em **Criar regra**

✅ **Verificação:** A aba Gerenciamento mostra a regra `delete-temp-audio` com status **Habilitada** e prefixo `transcribe-temp/`.

![Descrição da imagem](<imagens/imagem%20(17).png>)

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
3. Cole o JSON abaixo, substituindo **`NOME-DO-SEU-BUCKET`** pelo nome exato do bucket criado na Etapa 4:

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
      "Resource": "arn:aws:s3:::NOME-DO-SEU-BUCKET/transcribe-temp/*"
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

> ⚠️ **Atenção:** Substitua `NOME-DO-SEU-BUCKET` pelo nome exato do bucket e mantenha `/transcribe-temp/*` no final — isso restringe a Lambda apenas à pasta de áudios temporários, sem acesso aos arquivos do site.
>
> Exemplo: `"Resource": "arn:aws:s3:::meu-chat-audio-temp-2024/transcribe-temp/*"`

### 5.4 — Salvar

1. Clique em **Próximo**
2. Em **Nome da política**: digite `chat-ia-policy`
3. Clique em **Criar política**

✅ **Verificação:** Na aba **Permissões** da função de execução, a política `chat-ia-policy` aparece na seção **Políticas em linha**.

![Descrição da imagem](<imagens/imagem%20(4).png>)
![Descrição da imagem](<imagens/imagem%20(21).png>)


---

## Etapa 6 — Configurar Variáveis de Ambiente na Lambda

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
| `ALLOWED_ORIGIN` | `https://chat.dev.inhesta.net` |
| `TRANSCRIBE_BUCKET` | Nome exato do bucket criado na Etapa 4 (ex: `meu-chat-audio-temp-2024`) |
| `POLLY_VOICE_ID` | `Camila` |
| `POLLY_ENGINE` | `neural` |

> ⚠️ **`TRANSCRIBE_BUCKET`** é o **nome do bucket** — não uma pasta. A pasta `transcribe-temp/` é criada automaticamente pela Lambda quando ela faz o primeiro upload de áudio. Você não precisa criá-la manualmente.

### 6.3 — Salvar

1. Clique em **Salvar**

✅ **Verificação:** A seção Variáveis de ambiente lista todas as 5 variáveis configuradas.

![Descrição da imagem](<imagens/imagem%20(15).png>)
![Descrição da imagem](<imagens/imagem%20(16).png>)

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

### 8.1 — Acessar o editor de código

1. Na página da função `chat-ia-voz`, clique na aba **Código**
2. No painel de arquivos à esquerda do editor, clique no arquivo `lambda_function.py`
3. O código padrão da AWS abre no editor

### 8.2 — Substituir o código

1. Abra o arquivo `funcao lambda/funcao.py` do repositório no seu computador
2. Selecione todo o conteúdo (Ctrl+A) e copie (Ctrl+C)
3. Volte para o editor da Lambda no navegador
4. Clique dentro do editor de código e selecione tudo (Ctrl+A)
5. Cole o código copiado (Ctrl+V)

### 8.3 — Implantar o código

1. Clique no botão **Implantar** — fica logo acima do editor
2. Aguarde a mensagem verde: **"A função chat-ia-voz foi atualizada com êxito"**

✅ **Verificação:** O campo **Última modificação** em **Propriedades do código** mostra a hora atual.

![Descrição da imagem](<imagens/imagem%20(14).png>)

---

## Etapa 9 — Criar o Certificado SSL/TLS no ACM

> **Por quê:** O CloudFront exige um certificado HTTPS para associar um domínio personalizado. O AWS Certificate Manager (ACM) emite certificados gratuitos. O certificado **obrigatoriamente precisa ser criado na região us-east-1** — essa é uma exigência do CloudFront.

### 9.1 — Acessar o Certificate Manager

1. Confirme que a região selecionada é **us-east-1**
2. Na barra de busca, digite `Certificate Manager` e clique em **Certificate Manager**

### 9.2 — Solicitar certificado

1. Clique em **Solicitar um certificado**
2. Selecione **Solicitar um certificado público**
3. Clique em **Próximo**

### 9.3 — Configurar o domínio

1. Em **Nomes de domínio totalmente qualificados**, digite: `chat.dev.inhesta.net`
2. Em **Método de validação**, selecione **Validação de DNS**
3. Em **Algoritmo de chave**, mantenha `RSA 2048`
4. Clique em **Solicitar**

### 9.4 — Validar o certificado via DNS

1. O certificado é criado com status **Pendente de validação**
2. Clique no ID do certificado para abri-lo
3. Clique em **Criar registros no Route 53**
   > O ACM cria automaticamente o registro CNAME de validação no Route 53.
4. Confirme clicando em **Criar registros**

### 9.5 — Aguardar emissão

A validação leva de **5 a 30 minutos**. Quando o status mudar para **Emitido**, o certificado está pronto ✅.

> Anote o **ARN do certificado** — você precisará dele na Etapa 10.

---

## Etapa 10 — Criar a Distribuição CloudFront

> **Por quê:** O CloudFront serve os arquivos do S3 via HTTPS com o domínio personalizado `chat.dev.inhesta.net`. O HTTPS é obrigatório para o navegador permitir acesso ao microfone.

### 10.1 — Acessar o CloudFront

1. Na barra de busca do Console AWS, digite `CloudFront` e clique em **CloudFront**
2. Clique em **Criar distribuição**

### 10.2 — Configurar a origem (bucket S3)

1. Em **Domínio de origem**, clique na caixa e selecione o bucket criado na Etapa 4
   > Selecione o endpoint padrão do S3 (formato `meu-chat-audio-temp-2024.s3.amazonaws.com`) — **não** o endpoint de website estático
2. Em **Acesso à origem**, selecione **Controle de acesso de origem (recomendado)**
3. Clique em **Criar novo OAC**
   - Em **Nome**, deixe o nome gerado automaticamente
   - Em **Tipo de assinatura**, mantenha **Assinar solicitações (recomendado)**
   - Clique em **Criar**

### 10.3 — Configurar o comportamento padrão

1. Em **Política de protocolo do visualizador**, selecione **Redirecionar HTTP para HTTPS**
2. Em **Métodos HTTP permitidos**, mantenha `GET, HEAD`
3. Em **Política de cache**, mantenha `CachingOptimized`

### 10.4 — Configurar o documento padrão

1. Role até a seção **Configurações**
2. Em **Objeto raiz padrão**, digite `index.html`

### 10.5 — Configurar o domínio personalizado e certificado

1. Em **Nomes de domínio alternativos (CNAMEs)**, clique em **Adicionar item** e digite: `chat.dev.inhesta.net`
2. Em **Certificado SSL personalizado**, selecione o certificado `chat.dev.inhesta.net` criado na Etapa 9
   > Se o certificado não aparecer, verifique se ele foi criado na região **us-east-1** e se o status é **Emitido**.

### 10.6 — Criar a distribuição

1. Role até o final da página
2. Clique em **Criar distribuição**

### 10.7 — Atualizar a política do bucket S3

Logo após criar a distribuição, o CloudFront exibe um aviso:
> *"A política do bucket S3 precisa ser atualizada para permitir acesso do CloudFront"*

1. Clique no botão **Copiar política** que aparece no aviso
2. Abra o bucket no S3 em uma nova aba
3. Clique na aba **Permissões → Política do bucket → Editar**
4. Cole a política copiada
5. Clique em **Salvar alterações**

### 10.8 — Anotar o domínio do CloudFront

Na página da distribuição, anote o **Nome de domínio** — formato: `d1234abcdef.cloudfront.net`

✅ **Verificação:** A distribuição aparece na lista com status **Habilitado**. A implantação pode levar até 15 minutos — o status muda de **Em andamento** para **Implantado**.

![Descrição da imagem](<imagens/imagem%20(10).png>)
![Descrição da imagem](<imagens/imagem%20(11).png>)

---

## Etapa 11 — Criar o Registro DNS no Route 53

### 11.1 — Acessar o Route 53

1. Na barra de busca do Console AWS, digite `Route 53` e clique em **Route 53**
2. No menu lateral esquerdo, clique em **Zonas hospedadas**
3. Clique na zona `inhesta.net`

### 11.2 — Criar o registro

1. Clique em **Criar registro**
2. Preencha os campos:
   - **Nome do registro**: `chat.dev`
   - **Tipo de registro**: `A`
   - **Alias**: ative o toggle **Alias**
   - **Rota de tráfego para**: selecione **Alias para distribuição do CloudFront**
   - **Distribuição do CloudFront**: selecione a distribuição criada na Etapa 10
   - **Política de roteamento**: `Simples`
3. Clique em **Criar registros**

✅ **Verificação:** O registro `chat.dev.inhesta.net` aparece na lista com tipo `A` apontando para o CloudFront. A propagação leva de 1 a 5 minutos.

![Descrição da imagem](<imagens/imagem%20(9).png>)

---

## Etapa 12 — Configurar o Frontend e Finalizar

### 12.1 — Atualizar a URL da API no script.js

Abra o arquivo `script.js` no seu computador e localize a linha no topo:

```javascript
const API_URL = "https://jhmbcrf0o7.execute-api.us-east-1.amazonaws.com/chat";
```

Substitua pela URL do seu API Gateway (anotada na Etapa 3.8) + `/chat`:

```javascript
const API_URL = "https://SEU-ID.execute-api.us-east-1.amazonaws.com/chat";
```

Salve o arquivo.

### 12.2 — Atualizar o CORS no API Gateway

1. Acesse **API Gateway → chat-ia-voz → Desenvolver → CORS**
2. Clique em **Configurar**
3. Em **Access-Control-Allow-Origin**, remova `*` e adicione: `https://chat.dev.inhesta.net`
4. Clique em **Salvar**
5. Vá em **Implantar → Estágios → $default → Implantar** para aplicar a mudança

### 12.3 — Fazer upload do script.js atualizado no S3

1. Acesse o bucket no S3
2. Selecione o arquivo `script.js` existente
3. Clique em **Carregar**, selecione o `script.js` atualizado do seu computador e clique em **Carregar**
   > Isso substitui o arquivo antigo pelo novo com a URL correta da API.

### 12.4 — Invalidar o cache do CloudFront

> **Por quê:** O CloudFront faz cache dos arquivos. Após substituir o `script.js`, é necessário invalidar o cache para que os usuários recebam a versão nova.

1. Acesse o **CloudFront → sua distribuição → aba Invalidações**
2. Clique em **Criar invalidação**
3. Em **Caminhos de objeto**, digite: `/*`
4. Clique em **Criar invalidação**

Aguarde o status mudar para **Concluído** (leva 1 a 2 minutos).

✅ **Verificação final:** Acesse `https://chat.dev.inhesta.net` no navegador. O chat deve abrir com HTTPS (cadeado na barra de endereços).

---

## Etapa 13 — Testes de Validação

### Teste 13.1 — Verificar conectividade com a API

1. Acesse `https://chat.dev.inhesta.net` no navegador
2. Verifique o cadeado HTTPS na barra de endereços ✅
3. Verifique se o indicador de status no cabeçalho mostra **"API configurada"** (texto azul)

---

### Teste 13.2 — Texto simples (síntese de voz desativada)

1. Certifique-se de que o botão 🔊 está **desativado** (cinza)
2. No campo de texto, digite: `Qual é a capital do Brasil?`
3. Clique em **Enviar** (ou pressione Enter)

✅ **Resultado esperado:** Resposta em texto aparece em menos de 10 segundos. Nenhum reprodutor de áudio é exibido.

---

### Teste 13.3 — Texto com síntese de voz ativada

1. Clique no botão 🔊 no cabeçalho (deve ficar colorido)
2. Digite uma mensagem e clique em **Enviar**

✅ **Resultado esperado:** A bolha de resposta exibe o texto **e** um reprodutor de áudio. O áudio toca automaticamente com a voz Camila.

---

### Teste 13.4 — Gravação de voz

1. Clique no botão 🎤 (microfone) no campo de envio
2. Clique em **Permitir** no popup do microfone
3. Fale claramente: `"Qual é a capital do Brasil?"`
4. Clique no botão ⏹ para parar a gravação

✅ **Resultado esperado:**
- Bolha do usuário com reprodutor de áudio da gravação
- Transcrição em itálico abaixo do reprodutor
- Bolha da IA com a resposta correta

Tempo total esperado: menos de 40 segundos.

---

### Teste 13.5 — Voz com síntese de voz (fluxo bidirecional completo)

1. Ative a síntese de voz (botão 🔊 colorido)
2. Clique no microfone 🎤, fale uma pergunta e clique em ⏹

✅ **Resultado esperado:**
- Bolha do usuário: reprodutor de áudio + transcrição em itálico
- Bolha da IA: texto + reprodutor de áudio tocando automaticamente

---

### Teste 13.6 — Verificar logs no CloudWatch

1. Acesse **CloudWatch → Grupos de logs**
2. Busque `/aws/lambda/chat-ia-voz` e clique no stream mais recente

✅ **O que verificar:**
- ❌ Sem erros `AccessDenied`
- ❌ Sem erros `NoSuchBucket`
- ❌ Sem erros `TRANSCRIBE_BUCKET não configurado`
- ✅ Linhas com `TranscriptionJobName: chat-xxxxxxxxxxxxxxxx`
- ✅ Sem exceções não tratadas (`Traceback`)

![Descrição da imagem](<imagens/imagem%20(19).png>)
![Descrição da imagem](<imagens/imagem%20(20).png>)

---

## O que corrigir na sua configuração atual

Com base no que foi configurado até agora, você precisa ajustar os itens abaixo:

### 1 — Política IAM (Etapa 5)

A política atual aponta para `NOME-DO-SEU-BUCKET/*`. Precisa ser atualizada para o nome real do bucket com o prefixo correto:

1. Lambda → **Configuração → Permissões** → clique na função de execução
2. Na seção **Políticas em linha**, clique em `chat-ia-policy` → **Editar**
3. Na aba **JSON**, localize a linha:
   ```
   "Resource": "arn:aws:s3:::NOME-DO-SEU-BUCKET/*"
   ```
4. Substitua por:
   ```
   "Resource": "arn:aws:s3:::meu-chat-audio-temp-2024/transcribe-temp/*"
   ```
5. Clique em **Salvar alterações**

### 2 — Variável TRANSCRIBE_BUCKET (Etapa 6)

Confirme que o valor está exatamente como aparece no S3:

- Lambda → **Configuração → Variáveis de ambiente**
- `TRANSCRIBE_BUCKET` = `meu-chat-audio-temp-2024`

### 3 — Regra de ciclo de vida no bucket (Etapa 4.8)

Se ainda não foi criada:

1. S3 → bucket `meu-chat-audio-temp-2024` → aba **Gerenciamento**
2. Criar regra `delete-temp-audio` com prefixo `transcribe-temp/` e expiração em 1 dia

Após essas três correções, o fluxo de voz deve funcionar.

---

## Solução de Problemas Comuns

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| `NoSuchBucket` no CloudWatch | Nome do bucket errado na variável `TRANSCRIBE_BUCKET` | Confirme o nome exato do bucket no S3 e atualize a variável (Etapa 6) |
| `AccessDenied` no S3 | ARN do bucket incorreto na política IAM | Atualize o `Resource` da política com o nome real do bucket + `/transcribe-temp/*` (Etapa 5) |
| Status "API pendente" no cabeçalho | `API_URL` no `script.js` não foi atualizada | Atualize a constante `API_URL` e refaça o upload no S3 (Etapa 12.1 e 12.3) |
| Erro de CORS no console do navegador | `ALLOWED_ORIGIN` ou CORS do API Gateway incorretos | Atualize ambos com `https://chat.dev.inhesta.net` (Etapa 12.2) |
| "Microfone negado" | Página não está em HTTPS | Verifique se está acessando via `https://chat.dev.inhesta.net` |
| Lambda expira antes de concluir | Tempo limite ainda está em 3 segundos | Refaça a Etapa 7 — tempo limite para 60 segundos |
| "Não foi possível transcrever o áudio" | Áudio muito curto ou silencioso | Fale por pelo menos 2–3 segundos, claramente, próximo ao microfone |
| Resposta sem áudio com síntese ativada | Polly com motor ou voz incorretos | Verifique `POLLY_VOICE_ID=Camila` e `POLLY_ENGINE=neural` nas variáveis de ambiente |
| Site mostra arquivos antigos | Cache do CloudFront não foi invalidado | CloudFront → distribuição → Invalidações → Criar → `/*` |
| Certificado SSL não aparece no CloudFront | Certificado criado na região errada | Recrie o certificado na região **us-east-1** |
| `chat.dev.inhesta.net` não resolve | DNS não criado ou propagando | Verifique o registro A no Route 53 (Etapa 11) e aguarde até 5 minutos |
| CloudFront retorna 403 | Política do bucket S3 não foi atualizada | Refaça o passo 10.7 — copie e cole a política OAC no bucket |
