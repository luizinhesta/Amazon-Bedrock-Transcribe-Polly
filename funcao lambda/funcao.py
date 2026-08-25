"""
Lambda principal do Chat IA com Amazon Bedrock.

Suporta dois modos de entrada:
  1. Texto puro  → { "message": "..." }
  2. Áudio       → { "audio_base64": "...", "audio_mime": "audio/webm", "tts": true }

Fluxo de áudio:
  audio_base64 → salva em S3 (temp) → Amazon Transcribe → texto
                                                          ↓
                                                    Amazon Bedrock
                                                          ↓
                                          (se tts=true) Amazon Polly
                                                          ↓
                                          { reply, transcript, audio_base64 }

Fluxo de texto:
  message → Amazon Bedrock → (se tts=true) Amazon Polly
                                              ↓
                              { reply, audio_base64? }

Variáveis de ambiente da Lambda:
  AWS_REGION          – região AWS         (padrão: us-east-1)
  BEDROCK_MODEL_ID    – modelo Bedrock     (padrão: amazon.nova-lite-v1:0)
  ALLOWED_ORIGIN      – domínio do front   (padrão: https://chat.inhesta.net)
  TRANSCRIBE_BUCKET   – bucket S3 para áudio temporário (OBRIGATÓRIO para áudio)
  POLLY_VOICE_ID      – voz do Polly       (padrão: Camila  — pt-BR neural)
  POLLY_ENGINE        – neural | standard  (padrão: neural)

Permissões IAM necessárias na role da Lambda:
  bedrock:InvokeModel
  transcribe:StartTranscriptionJob
  transcribe:GetTranscriptionJob
  polly:SynthesizeSpeech
  s3:PutObject
  s3:GetObject
  s3:DeleteObject
  (no bucket configurado em TRANSCRIBE_BUCKET)
"""

import base64
import json
import os
import time
import traceback
import uuid
from io import BytesIO

import boto3
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# Configuração via variáveis de ambiente
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


AWS_REGION         = _env("AWS_REGION",         "us-east-1")
MODEL_ID           = _env("BEDROCK_MODEL_ID",    "amazon.nova-lite-v1:0")
ALLOWED_ORIGIN     = _env("ALLOWED_ORIGIN",      "https://chat.inhesta.net")
TRANSCRIBE_BUCKET  = _env("TRANSCRIBE_BUCKET",   "")   # obrigatório para áudio
POLLY_VOICE_ID     = _env("POLLY_VOICE_ID",      "Camila")
POLLY_ENGINE       = _env("POLLY_ENGINE",        "neural")

# Tempo máximo de espera pela transcrição (segundos)
TRANSCRIBE_TIMEOUT = 55

# ---------------------------------------------------------------------------
# Clientes AWS (criados uma vez — reutilizados entre invocações warm)
# ---------------------------------------------------------------------------

bedrock_runtime = boto3.client("bedrock-runtime",    region_name=AWS_REGION)
transcribe_cl   = boto3.client("transcribe",         region_name=AWS_REGION)
polly_cl        = boto3.client("polly",              region_name=AWS_REGION)
s3_cl           = boto3.client("s3",                 region_name=AWS_REGION)

# ---------------------------------------------------------------------------
# Handler principal
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "")
    ).upper()

    if method == "OPTIONS":
        return _resp(204, {})

    if method != "POST":
        return _resp(405, {"error": "Método não permitido."})

    if not MODEL_ID:
        return _resp(500, {"error": "BEDROCK_MODEL_ID não configurado."})

    try:
        body = _parse_body(event)

        # ── Rota de ÁUDIO ───────────────────────────────────────────────────
        if body.get("audio_base64"):
            return _handle_audio(body)

        # ── Rota de TEXTO ───────────────────────────────────────────────────
        user_message = str(body.get("message", "")).strip()
        if not user_message:
            return _resp(400, {"error": "Forneça 'message' ou 'audio_base64'."})

        return _handle_text(user_message, tts=bool(body.get("tts", False)))

    except json.JSONDecodeError:
        return _resp(400, {"error": "JSON inválido no corpo da requisição."})
    except ClientError as err:
        print(f"AWS ClientError: {err}")
        traceback.print_exc()
        return _resp(502, {
            "error":  "Erro ao chamar serviço AWS.",
            "detail": err.response.get("Error", {}).get("Message", str(err)),
        })
    except Exception as err:
        print(f"Unexpected error: {err}")
        traceback.print_exc()
        return _resp(500, {"error": "Erro interno na Lambda."})


# ---------------------------------------------------------------------------
# Rota de texto
# ---------------------------------------------------------------------------

def _handle_text(user_message: str, tts: bool) -> dict:
    reply = _ask_bedrock(user_message)

    result = {"reply": reply}
    if tts:
        audio_b64, audio_mime = _synthesize_speech(reply)
        if audio_b64:
            result["audio_base64"] = audio_b64
            result["audio_mime"]   = audio_mime

    return _resp(200, result)


# ---------------------------------------------------------------------------
# Rota de áudio
# ---------------------------------------------------------------------------

def _handle_audio(body: dict) -> dict:
    audio_b64  = body["audio_base64"]
    audio_mime = str(body.get("audio_mime", "audio/webm"))
    tts        = bool(body.get("tts", False))

    if not TRANSCRIBE_BUCKET:
        return _resp(500, {
            "error": "TRANSCRIBE_BUCKET não configurado. "
                     "Crie um bucket S3 e defina esta variável de ambiente na Lambda."
        })

    # 1. Salva áudio temporariamente no S3
    extension  = _mime_to_ext(audio_mime)
    s3_key     = f"transcribe-temp/{uuid.uuid4()}{extension}"
    audio_data = base64.b64decode(audio_b64)

    s3_cl.put_object(
        Bucket=TRANSCRIBE_BUCKET,
        Key=s3_key,
        Body=audio_data,
        ContentType=audio_mime,
    )

    # 2. Inicia job de transcrição
    job_name   = f"chat-{uuid.uuid4().hex[:16]}"
    media_uri  = f"s3://{TRANSCRIBE_BUCKET}/{s3_key}"
    media_fmt  = _mime_to_transcribe_format(audio_mime)

    transcribe_cl.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": media_uri},
        MediaFormat=media_fmt,
        LanguageCode="pt-BR",
        Settings={"ShowSpeakerLabels": False},
    )

    # 3. Aguarda conclusão (polling)
    transcript_text = _wait_for_transcription(job_name)

    # 4. Remove arquivo temporário do S3
    try:
        s3_cl.delete_object(Bucket=TRANSCRIBE_BUCKET, Key=s3_key)
    except Exception:
        pass  # não crítico

    if not transcript_text:
        return _resp(422, {"error": "Não foi possível transcrever o áudio. Tente falar mais claramente."})

    # 5. Envia transcrição ao Bedrock
    reply = _ask_bedrock(transcript_text)

    # 6. Síntese de voz (opcional)
    result = {"reply": reply, "transcript": transcript_text}
    if tts:
        audio_out_b64, audio_out_mime = _synthesize_speech(reply)
        if audio_out_b64:
            result["audio_base64"] = audio_out_b64
            result["audio_mime"]   = audio_out_mime

    return _resp(200, result)


# ---------------------------------------------------------------------------
# Amazon Bedrock — Converse API
# ---------------------------------------------------------------------------

def _ask_bedrock(user_message: str) -> str:
    response = bedrock_runtime.converse(
        modelId=MODEL_ID,
        system=[{
            "text": (
                "Você é um assistente de IA em um site público. "
                "Responda sempre em português do Brasil, com clareza, "
                "objetividade e tom cordial. "
                "Prefira respostas curtas e diretas (no máximo 8 linhas), "
                "exceto quando o usuário pedir detalhes."
            )
        }],
        messages=[{
            "role":    "user",
            "content": [{"text": user_message}],
        }],
        inferenceConfig={
            "maxTokens":   350,
            "temperature": 0.7,
            "topP":        0.9,
        },
    )

    text        = response["output"]["message"]["content"][0]["text"]
    stop_reason = response.get("stopReason")

    if stop_reason == "max_tokens":
        text += "\n\n[Resposta interrompida por limite de tamanho. Peça 'continue de onde parou'.]"

    return text


# ---------------------------------------------------------------------------
# Amazon Transcribe — polling de job assíncrono
# ---------------------------------------------------------------------------

def _wait_for_transcription(job_name: str) -> str | None:
    """Aguarda o job do Transcribe e retorna o texto transcrito."""
    import urllib.request

    deadline = time.time() + TRANSCRIBE_TIMEOUT
    while time.time() < deadline:
        resp   = transcribe_cl.get_transcription_job(TranscriptionJobName=job_name)
        status = resp["TranscriptionJob"]["TranscriptionJobStatus"]

        if status == "COMPLETED":
            uri = resp["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
            # Baixa o JSON de transcrição
            with urllib.request.urlopen(uri) as f:
                data = json.loads(f.read().decode("utf-8"))
            return data["results"]["transcripts"][0]["transcript"].strip()

        if status == "FAILED":
            reason = resp["TranscriptionJob"].get("FailureReason", "desconhecido")
            print(f"Transcription job failed: {reason}")
            return None

        time.sleep(3)

    print(f"Transcription job timed out after {TRANSCRIBE_TIMEOUT}s")
    return None


# ---------------------------------------------------------------------------
# Amazon Polly — síntese de texto em fala
# ---------------------------------------------------------------------------

def _synthesize_speech(text: str) -> tuple[str | None, str]:
    """
    Converte texto em áudio MP3 via Amazon Polly.
    Retorna (base64_string, mime_type) ou (None, "") em caso de erro.
    """
    # Polly tem limite de ~3000 caracteres por chamada
    text_chunk = text[:2900]

    try:
        response = polly_cl.synthesize_speech(
            Text=text_chunk,
            OutputFormat="mp3",
            VoiceId=POLLY_VOICE_ID,
            Engine=POLLY_ENGINE,
            LanguageCode="pt-BR",
        )
        audio_stream = response["AudioStream"].read()
        audio_b64    = base64.b64encode(audio_stream).decode("utf-8")
        return audio_b64, "audio/mpeg"

    except ClientError as err:
        print(f"Polly error: {err}")
        return None, ""


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def _parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def _mime_to_ext(mime: str) -> str:
    mapping = {
        "audio/webm":       ".webm",
        "audio/ogg":        ".ogg",
        "audio/mp4":        ".mp4",
        "audio/mpeg":       ".mp3",
        "audio/wav":        ".wav",
        "audio/x-wav":      ".wav",
        "audio/flac":       ".flac",
    }
    base = mime.split(";")[0].strip().lower()
    return mapping.get(base, ".webm")


def _mime_to_transcribe_format(mime: str) -> str:
    base = mime.split(";")[0].strip().lower()
    mapping = {
        "audio/webm":  "webm",
        "audio/ogg":   "ogg",
        "audio/mp4":   "mp4",
        "audio/mpeg":  "mp3",
        "audio/wav":   "wav",
        "audio/x-wav": "wav",
        "audio/flac":  "flac",
    }
    return mapping.get(base, "webm")


def _resp(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Content-Type":                 "application/json",
        },
        "body": json.dumps(body, ensure_ascii=True),
    }
