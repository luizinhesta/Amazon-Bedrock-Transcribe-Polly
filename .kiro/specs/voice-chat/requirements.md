# Requisitos — Chat IA com Voz Bidirecional

## Visão Geral

O Chat IA com Amazon Bedrock já possui interação por texto. Este spec cobre a adição de
**voz bidirecional**: o usuário pode gravar um áudio e recebê-lo transcrito na tela, a IA
processa o texto transcrito e responde por escrito — e opcionalmente reproduz a resposta
em áudio sintetizado.

---

## Requisitos Funcionais

### RF-01 — Gravação de voz pelo usuário

**User story:** Como usuário, quero clicar em um botão de microfone, falar, clicar em parar
e ter minha mensagem enviada para a IA, sem precisar digitar nada.

**Critérios de aceite:**
- [ ] O botão de microfone solicita permissão ao navegador antes de gravar
- [ ] Durante a gravação, o botão muda de ícone (mic → stop) e exibe uma barra de status com timer
- [ ] A gravação para automaticamente após 60 segundos
- [ ] O usuário pode parar manualmente a qualquer momento clicando no botão novamente
- [ ] O áudio gravado é exibido como player inline na bolha de mensagem do usuário
- [ ] A gravação funciona nos formatos suportados pelo navegador (WebM/Opus, OGG, MP4)

### RF-02 — Transcrição de voz para texto

**User story:** Como usuário, quero ver na tela o que eu disse, para confirmar que a IA
entendeu corretamente minha mensagem.

**Critérios de aceite:**
- [ ] Após o envio do áudio, a transcrição aparece abaixo do player de áudio do usuário
- [ ] A transcrição é exibida em itálico entre aspas (ex: `"sua mensagem aqui"`)
- [ ] Se a transcrição falhar, uma mensagem de erro clara é exibida
- [ ] A transcrição usa o idioma português do Brasil (pt-BR)

### RF-03 — Resposta da IA via texto

**User story:** Como usuário, quero que a IA responda minha mensagem de voz da mesma forma
que responde mensagens de texto.

**Critérios de aceite:**
- [ ] O texto transcrito é enviado ao modelo Bedrock como se fosse digitado
- [ ] A resposta da IA aparece na tela como bolha de mensagem normal
- [ ] O comportamento é idêntico ao fluxo de texto puro

### RF-04 — Resposta da IA em áudio (TTS)

**User story:** Como usuário, quero ter a opção de ouvir a resposta da IA em áudio, sem
precisar ler o texto.

**Critérios de aceite:**
- [ ] Um botão no cabeçalho permite ativar/desativar a resposta em áudio (TTS)
- [ ] O estado do botão TTS é visualmente claro (ativo/inativo)
- [ ] Quando TTS está ativo, o áudio toca automaticamente após a resposta da IA
- [ ] Um player de áudio manual fica visível na bolha de resposta da IA
- [ ] O TTS funciona tanto para mensagens de texto quanto de voz
- [ ] A voz usada é a voz Camila (feminino, pt-BR, neural) do Amazon Polly

### RF-05 — Manutenção do modo texto

**User story:** Como usuário, quero continuar usando o chat por texto normalmente, sem que
o recurso de voz interfira.

**Critérios de aceite:**
- [ ] O campo de texto e o botão Enviar continuam funcionando como antes
- [ ] O recurso de voz é completamente opcional
- [ ] Texto e voz podem ser alternados livremente durante a mesma sessão

### RF-06 — Feedback visual durante processamento

**User story:** Como usuário, quero saber que meu áudio está sendo processado para não
ficar sem resposta visual.

**Critérios de aceite:**
- [ ] Durante gravação: barra de status com ponto vermelho pulsante e timer
- [ ] Durante transcrição/processamento: mensagem "Transcrevendo e processando…"
- [ ] Botões desabilitados durante processamento para evitar envio duplicado
- [ ] O formulário volta ao estado normal após receber a resposta

---

## Requisitos Não Funcionais

### RNF-01 — Segurança

- O bucket S3 de áudios temporários deve ter acesso público bloqueado
- Arquivos temporários de áudio devem ser deletados imediatamente após a transcrição
- Uma regra de lifecycle no S3 deve expirar automaticamente arquivos com mais de 1 dia
- O domínio do frontend deve ser o único permitido no CORS (via `ALLOWED_ORIGIN`)
- A Lambda deve ter apenas as permissões mínimas necessárias (least privilege)
- Nenhum dado de áudio do usuário deve ser persistido além do necessário para transcrição

### RNF-02 — Desempenho

- O timeout da Lambda deve ser de 60 segundos (Transcribe leva 5–30s para áudios curtos)
- O Amazon Transcribe deve receber arquivos de áudio de no máximo 60 segundos
- Respostas de texto puro devem continuar com latência inferior a 10 segundos

### RNF-03 — Confiabilidade

- Falhas no Transcribe (job FAILED ou timeout) devem retornar mensagem amigável ao usuário
- Falhas no Polly não devem impedir a exibição da resposta em texto
- A Lambda trata erros de cada serviço AWS de forma isolada

### RNF-04 — Compatibilidade

- O frontend usa apenas APIs nativas do navegador (MediaRecorder API, Web Audio API)
- Compatível com Chrome 89+, Firefox 86+, Edge 91+, Safari 14.1+
- O layout é responsivo e funciona em dispositivos móveis
- Em navegadores sem suporte à MediaRecorder API, o botão de microfone não deve crashar

### RNF-05 — Manutenibilidade

- Todas as configurações da Lambda são feitas via variáveis de ambiente (sem hardcode)
- A URL da API no frontend é isolada em uma constante no topo do `script.js`
- A policy IAM do repositório deve refletir todas as permissões necessárias

### RNF-06 — Acessibilidade

- Botões com `aria-label` e `aria-pressed` para leitores de tela
- Barra de gravação com `aria-live="assertive"` para anúncio em leitores de tela
- Players de áudio com `aria-label` descritivos

---

## Restrições e Dependências

| Item | Detalhe |
|---|---|
| **Região AWS** | Todos os serviços devem estar na mesma região (padrão: `us-east-1`) |
| **Modelo Bedrock** | `amazon.nova-lite-v1:0` deve estar habilitado na conta/região |
| **Voz Polly** | Voz `Camila` requer engine `neural` — disponível em `us-east-1` e outras |
| **Contexto HTTPS** | MediaRecorder API exige HTTPS ou localhost |
| **Limite Polly** | Máximo de 3.000 caracteres por chamada SynthesizeSpeech |
| **Formato áudio** | Transcribe aceita: webm, ogg, mp4, wav, flac |
| **Tamanho payload** | API Gateway HTTP API suporta até 10 MB; REST API requer configuração |

---

## Fora do Escopo (este spec)

- Histórico de conversa multi-turno (contexto entre mensagens)
- Autenticação de usuários
- Gravação de conversas para análise posterior
- Múltiplos idiomas além de pt-BR
- Streaming de resposta do Bedrock em tempo real
