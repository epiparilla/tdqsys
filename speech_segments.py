"""Persistent, voice-specific clips and PCM stitching. No model/UI dependency."""
import hashlib
import io
import json
import os
import re
import threading
import uuid
import wave

DEFAULTS = {"voice": "af_heart", "prefix": "Test driver", "template": "{ticket}",
            "suffix": "you may now approach the registration area for your test drive."}
JOIN_GAP_MS = 10


def preview_plan(body):
    """Validate unsaved Settings values, then use the identical live planner."""
    if not isinstance(body, dict) or not isinstance(body.get('model'), dict):
        raise ValueError('Select a configured vehicle for the preview.')
    def field(source, key, limit, default=''):
        value = source.get(key, default)
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('Invalid speech preview field: ' + key)
        return value.strip()
    model = {key:field(body['model'],key,limit) for key,limit in [('label',120),('prefix',36),('pronounce',160),('shortnamePronounce',160)]}
    if not model['label'] and not model['prefix']:
        raise ValueError('Select a configured vehicle for the preview.')
    speech = {key:field(body,key,limit,DEFAULTS[key]) for key,limit in [('voice',64),('prefix',200),('template',400),('suffix',200)]}
    if not re.fullmatch(r'[a-z0-9_]{1,64}',speech['voice']):
        raise ValueError('Invalid preview voice.')
    text = ' '.join(speech[key] for key in ('prefix','template','suffix'))
    if '{ticket}' not in text or re.search(r'[{}]',re.sub(r'\{(?:ticket|counter|service)\}','',text)):
        raise ValueError('Include {ticket} and use only valid announcement placeholders.')
    config = {'brands':[{'key':'preview','name':field(body,'brandName',120),'models':[model]}],
              'announcements':speech,'testDrive':{'callbackPrefix':field(body,'callbackPrefix',200,'Test driver'),
              'callbackSuffix':field(body,'callbackSuffix',400,'please stand by, you are next in line to test')}}
    if body.get('kind','ongoing') == 'callback' and not all(config['testDrive'].values()):
        raise ValueError('Call-back prefix and suffix cannot be blank.')
    return ticket_plan(config,'preview',1,body.get('number',1),body.get('kind','ongoing'))


def ticket_plan(config, brand_key, unit, number, kind="ongoing"):
    if type(number) is not int or not 1 <= number <= 99999:
        raise ValueError("Invalid queue number.")
    brand = next((b for b in config.get("brands", []) if b.get("key") == brand_key), None)
    if not brand or type(unit) is not int or not 1 <= unit <= len(brand.get("models", [])):
        raise ValueError("Vehicle model is not configured.")
    model = brand["models"][unit - 1]
    pronunciation = model.get("pronounce", "").strip() or " ".join(model.get("prefix", ""))
    model_pronunciation = model.get("shortnamePronounce", "").strip() or model.get("label", "")
    digits = " ".join(str(number).zfill(2))
    speech = {**DEFAULTS, **(config.get("announcements") or {})}
    if kind == "callback":
        callback = config.get("testDrive") or {}
        parts = [callback.get("callbackPrefix") or "Test driver", pronunciation, digits,
                 callback.get("callbackSuffix") or "please stand by, you are next in line to test", model_pronunciation]
    elif kind == "ongoing":
        text = " ".join(speech[key] for key in ("prefix", "template", "suffix"))
        parts = []
        for item in re.split(r"(\{ticket\}|\{counter\}|\{service\})", text):
            if item == "{ticket}":
                parts.extend([pronunciation, digits])
            elif item == "{counter}":
                parts.append(model_pronunciation)
            elif item == "{service}":
                parts.append(brand.get("name", ""))
            else:
                parts.append(item)
    else:
        raise ValueError("Invalid announcement kind.")
    return [" ".join(str(part).split()) for part in parts if str(part).strip()], speech["voice"]


class SegmentCache:
    def __init__(self, directory, synthesize, seed_number=None):
        self.directory, self.synthesize, self.seed_number = directory, synthesize, seed_number
        self.lock = threading.RLock()
        self.memory = {}
        os.makedirs(directory, exist_ok=True)

    def filename(self, text, voice, speed=1.0):
        digest = hashlib.sha256(json.dumps([text, voice, speed, "pcm-v1"], ensure_ascii=False).encode()).hexdigest()
        return os.path.join(self.directory, digest + ".wav")

    def ready(self, parts, voice, speed=1.0):
        return all(self.filename(part, voice, speed) in self.memory or os.path.exists(self.filename(part, voice, speed)) for part in parts)

    def ensure(self, text, voice, speed=1.0):
        filename = self.filename(text, voice, speed)
        if filename in self.memory:
            return self.memory[filename]
        with self.lock:
            if filename in self.memory:
                return self.memory[filename]
            if os.path.exists(filename):
                with open(filename, "rb") as stream:
                    audio = stream.read()
            else:
                audio = self.seed_number(text, voice, speed) if self.seed_number else None
                audio = audio or self.synthesize(text, voice, speed)
                temporary = filename + "." + uuid.uuid4().hex + ".tmp"
                try:
                    with open(temporary, "xb") as stream:
                        stream.write(audio)
                    os.replace(temporary, filename)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            # Validate cache bytes before using them to compose speech.
            with wave.open(io.BytesIO(audio), "rb") as clip:
                if clip.getnchannels() != 1 or clip.getsampwidth() != 2 or clip.getframerate() != 24000:
                    raise ValueError("Speech clips must be mono PCM16 at 24kHz.")
            self.memory[filename] = audio
            return audio

    def compose(self, parts, voice, speed=1.0):
        frames = []
        gap = b"\0\0" * (24000 * JOIN_GAP_MS // 1000)
        for index, part in enumerate(parts):
            with wave.open(io.BytesIO(self.ensure(part, voice, speed)), "rb") as clip:
                if index:
                    frames.append(gap)
                frames.append(clip.readframes(clip.getnframes()))
        output = io.BytesIO()
        with wave.open(output, "wb") as combined:
            combined.setnchannels(1)
            combined.setsampwidth(2)
            combined.setframerate(24000)
            combined.writeframes(b"".join(frames))
        return output.getvalue()
