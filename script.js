// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

// URL pública do API Gateway (rota POST /chat)
const API_URL = "https://cax0vprdtj.execute-api.us-east-1.amazonaws.com/chat";

// Tempo máximo de gravação em milissegundos (60 s)
const MAX_RECORD_MS = 60_000;

// =============================================================================
// ELEMENTOS DO DOM
// =============================================================================

const chatForm        = document.querySelector("#chatForm");
const messageInput    = document.querySelector("#messageInput");
const messagesEl      = document.querySelector("#messages");
const sendButton      = document.querySelector("#sendButton");
const connectionStatus= document.querySelector("#connectionStatus");
const micBtn          = document.querySelector("#micBtn");
const recordingBar    = document.querySelector("#recordingBar");
const recordingLabel  = document.querySelector("#recordingLabel");
const recTimer        = document.querySelector("#recTimer");
const ttsToggle       = document.querySelector("#ttsToggle");
const iconMic         = micBtn.querySelector(".icon-mic");
const iconStop        = micBtn.querySelector(".icon-stop");

// =============================================================================
// ESTADO
// =============================================================================

const hasApiUrl   = API_URL.startsWith("https://");
let mediaRecorder = null;
let audioChunks   = [];
let timerInterval = null;
let recSeconds    = 0;
let ttsEnabled    = true;   // síntese de voz da IA ativada por padrão
let isProcessing  = false;

// =============================================================================
// STATUS DA API
// =============================================================================

if (hasApiUrl) {
  connectionStatus.textContent = "API configurada";
  connectionStatus.classList.add("online");
}

// =============================================================================
// TTS TOGGLE (ativar/desativar resposta em áudio da IA)
// =============================================================================

ttsToggle.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsToggle.setAttribute("aria-pressed", String(ttsEnabled));
  ttsToggle.setAttribute(
    "aria-label",
    ttsEnabled ? "Resposta em áudio ativada" : "Resposta em áudio desativada"
  );
  ttsToggle.classList.toggle("tts-off", !ttsEnabled);
  ttsToggle.title = ttsEnabled
    ? "Desativar resposta em áudio"
    : "Ativar resposta em áudio";
});

// =============================================================================
// ENVIO VIA TEXTO (formulário)
// =============================================================================

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text || isProcessing) return;

  messageInput.value = "";
  autoResizeInput();

  await sendTextMessage(text);
});

messageInput.addEventListener("input", autoResizeInput);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

// =============================================================================
// GRAVAÇÃO DE ÁUDIO — MediaRecorder API
// =============================================================================

micBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
  } else {
    await startRecording();
  }
});

async function startRecording() {
  if (isProcessing) return;

  // Solicita permissão ao microfone
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    addMessage(
      "assistant",
      "Não foi possível acessar o microfone. Verifique as permissões do navegador."
    );
    return;
  }

  // Escolhe o formato suportado pelo navegador
  const mimeType = getSupportedMimeType();
  const options  = mimeType ? { mimeType } : {};

  audioChunks  = [];
  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  });

  mediaRecorder.addEventListener("stop", () => {
    stream.getTracks().forEach((t) => t.stop());
    handleRecordingComplete(mediaRecorder.mimeType || mimeType || "audio/webm");
  });

  mediaRecorder.start(250); // coleta chunks a cada 250 ms

  // UI: modo gravando
  setRecordingUI(true);

  // Timer de duração
  recSeconds = 0;
  recTimer.textContent = formatTime(0);
  timerInterval = setInterval(() => {
    recSeconds++;
    recTimer.textContent = formatTime(recSeconds);
    if (recSeconds * 1000 >= MAX_RECORD_MS) stopRecording();
  }, 1000);
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  clearInterval(timerInterval);
  mediaRecorder.stop();
  setRecordingUI(false);
}

function setRecordingUI(recording) {
  micBtn.setAttribute("aria-pressed", String(recording));
  micBtn.setAttribute("aria-label", recording ? "Parar gravação" : "Gravar mensagem de voz");
  micBtn.classList.toggle("recording", recording);
  iconMic.hidden  = recording;
  iconStop.hidden = !recording;
  recordingBar.hidden = !recording;
  sendButton.disabled = recording;
  messageInput.disabled = recording;
  if (recording) {
    recordingLabel.textContent = "Gravando…";
  }
}

async function handleRecordingComplete(mimeType) {
  if (audioChunks.length === 0) return;

  const blob   = new Blob(audioChunks, { type: mimeType });
  audioChunks  = [];

  // Mostra mensagem do usuário com player de áudio
  const audioUrl    = URL.createObjectURL(blob);
  const userArticle = addAudioMessage("user", audioUrl);

  if (!hasApiUrl) {
    addMessage("assistant", "Configure a URL da API Gateway no script.js para usar o recurso de voz.");
    return;
  }

  // Converte para base64 e envia
  const base64 = await blobToBase64(blob);
  await sendAudioMessage(base64, mimeType, userArticle);
}

// =============================================================================
// COMUNICAÇÃO COM A API
// =============================================================================

async function sendTextMessage(text) {
  addMessage("user", text);

  if (!hasApiUrl) {
    addMessage(
      "assistant",
      "Interface pronta. Configure a URL da API Gateway no script.js."
    );
    return;
  }

  setProcessing(true);
  const loadingEl = addMessage("assistant", "Pensando…", true);

  try {
    const data = await callApi({ message: text, tts: ttsEnabled });
    loadingEl.remove();

    const replyText = data.reply || "Recebi uma resposta vazia da API.";
    const replyEl   = addMessage("assistant", replyText);

    // Reproduz áudio se TTS ativado e API retornou áudio
    if (ttsEnabled && data.audio_base64) {
      appendAudioPlayer(replyEl, data.audio_base64, data.audio_mime || "audio/mp3");
    }
  } catch (err) {
    loadingEl.remove();
    showApiError(err);
  } finally {
    setProcessing(false);
    messageInput.focus();
  }
}

async function sendAudioMessage(base64, mimeType, userArticle) {
  setProcessing(true);
  const loadingEl = addMessage("assistant", "Transcrevendo e processando…", true);

  try {
    const data = await callApi({
      audio_base64: base64,
      audio_mime:   mimeType,
      tts:          ttsEnabled,
    });

    loadingEl.remove();

    // Exibe transcrição na bolha do usuário
    if (data.transcript) {
      const transcriptEl = document.createElement("p");
      transcriptEl.className = "transcript-label";
      transcriptEl.textContent = `"${data.transcript}"`;
      userArticle.querySelector(".message-bubble").appendChild(transcriptEl);
    }

    const replyText = data.reply || "Recebi uma resposta vazia da API.";
    const replyEl   = addMessage("assistant", replyText);

    if (ttsEnabled && data.audio_base64) {
      appendAudioPlayer(replyEl, data.audio_base64, data.audio_mime || "audio/mp3");
    }
  } catch (err) {
    loadingEl.remove();
    showApiError(err);
  } finally {
    setProcessing(false);
  }
}

async function callApi(payload) {
  const response = await fetch(API_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// FUNÇÕES DE MENSAGEM / UI
// =============================================================================

/**
 * Adiciona uma mensagem de texto simples no chat.
 * @returns {HTMLElement} o <article> criado
 */
function addMessage(role, text, isLoading = false) {
  const article = createMessageShell(role, isLoading);

  const bubble = article.querySelector(".message-bubble");
  const p      = document.createElement("p");
  p.textContent = text;
  bubble.appendChild(p);

  messagesEl.appendChild(article);
  scrollToBottom();
  return article;
}

/**
 * Adiciona uma mensagem com player de áudio (mensagem do usuário após gravação).
 * @returns {HTMLElement} o <article> criado
 */
function addAudioMessage(role, audioUrl) {
  const article = createMessageShell(role);

  const bubble = article.querySelector(".message-bubble");
  const label  = document.createElement("p");
  label.className   = "audio-sent-label";
  label.textContent = "🎤 Mensagem de voz";

  const audio       = document.createElement("audio");
  audio.controls    = true;
  audio.src         = audioUrl;
  audio.className   = "inline-audio";
  audio.setAttribute("aria-label", "Reproduzir mensagem de voz enviada");

  bubble.appendChild(label);
  bubble.appendChild(audio);
  messagesEl.appendChild(article);
  scrollToBottom();
  return article;
}

/**
 * Insere um player de áudio na bolha de resposta da IA.
 */
function appendAudioPlayer(articleEl, base64, mimeType) {
  const blob    = base64ToBlob(base64, mimeType);
  const url     = URL.createObjectURL(blob);
  const bubble  = articleEl.querySelector(".message-bubble");

  const wrapper = document.createElement("div");
  wrapper.className = "audio-reply-wrapper";

  const label   = document.createElement("span");
  label.className   = "audio-reply-label";
  label.textContent = "🔊 Ouvir resposta";

  const audio       = document.createElement("audio");
  audio.controls    = true;
  audio.src         = url;
  audio.autoplay    = true;
  audio.className   = "inline-audio";
  audio.setAttribute("aria-label", "Reproduzir resposta em áudio");

  wrapper.appendChild(label);
  wrapper.appendChild(audio);
  bubble.appendChild(wrapper);
  scrollToBottom();
}

/**
 * Cria o shell de um artigo de mensagem (avatar + bubble vazia).
 */
function createMessageShell(role, isLoading = false) {
  const article       = document.createElement("article");
  article.className   = `message ${role}${isLoading ? " loading" : ""}`;

  const avatarDiv     = document.createElement("div");
  avatarDiv.className = "message-avatar";

  const img           = document.createElement("img");
  img.className       = "avatar-logo";
  if (role === "assistant") {
    img.src = "./imagens/logo.png";
    img.alt = "Agente IA";
  } else {
    img.src = "./imagens/user-avatar.svg";
    img.alt = "Usuário";
  }
  avatarDiv.appendChild(img);

  const bubble        = document.createElement("div");
  bubble.className    = "message-bubble";

  article.append(avatarDiv, bubble);
  return article;
}

function showApiError(err) {
  connectionStatus.textContent = "Erro na API";
  connectionStatus.classList.remove("online");
  connectionStatus.classList.add("error");
  addMessage(
    "assistant",
    `Não consegui falar com a API. Verifique a URL, o CORS e os logs da Lambda. Detalhe: ${err.message}`
  );
}

function setProcessing(value) {
  isProcessing        = value;
  sendButton.disabled = value;
  micBtn.disabled     = value;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${messageInput.scrollHeight}px`;
}

// =============================================================================
// UTILITÁRIOS DE ÁUDIO
// =============================================================================

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader    = new FileReader();
    reader.onload   = () => resolve(reader.result.split(",")[1]);
    reader.onerror  = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
