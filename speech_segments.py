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
        gap = b"\0\0" * 1200  # 50ms, with no silence synthesis required.
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
