"""Page-independent FIFO playback and background preparation of ticket clips."""
import hashlib
import json
import queue
import threading
import time
import uuid
from speech_segments import ticket_plan


class DesktopSpeech:
    def __init__(self, cache, get_state, resolve_voice, play, warmup=True):
        self.cache, self.get_state, self.resolve_voice, self.play = cache, get_state, resolve_voice, play
        self.jobs = queue.Queue()
        self.busy = False
        self.warming = False
        self.completed = 0
        self.last_error = None
        self.last_compose_ms = None
        threading.Thread(target=self._play_loop, daemon=True).start()
        if warmup:
            threading.Thread(target=self._warm_loop, daemon=True).start()

    def plan(self, body):
        state = self.get_state()
        parts, voice = ticket_plan(state.get('config') or {}, body.get('brandKey'), body.get('unit'), body.get('number'), body.get('kind', 'ongoing'))
        return parts, self.resolve_voice(voice)

    def enqueue(self, body):
        parts, voice = self.plan(body)
        ready = self.cache.ready(parts, voice)
        job_id = uuid.uuid4().hex
        self.jobs.put((job_id, parts, voice))
        return {'queued': True, 'jobId': job_id, 'cacheReady': ready}

    def status(self):
        return {'queued': self.jobs.qsize(), 'playing': self.busy, 'warming': self.warming,
                'completed': self.completed, 'lastError': self.last_error,
                'lastComposeMs': self.last_compose_ms, 'cachedClips': len(self.cache.memory)}

    def _play_loop(self):
        while True:
            _, parts, voice = self.jobs.get()
            self.busy = True
            try:
                started = time.perf_counter()
                audio = self.cache.compose(parts, voice)
                self.last_compose_ms = round((time.perf_counter() - started) * 1000, 2)
                self.play(audio)  # Synchronous on this worker only; next job waits.
                self.completed += 1
                self.last_error = None
            except Exception as error:
                self.last_error = str(error)
            finally:
                self.busy = False
                self.jobs.task_done()

    def _warm_loop(self):
        previous = None
        while True:
            try:
                state = self.get_state()
                config = state.get('config') or {}
                highest = max([0] + [int(n) for slots in state.get('queues', {}).values() for n in slots.values()])
                bucket = highest // 25
                signature = hashlib.sha256(json.dumps([config.get('brands'), config.get('announcements'), config.get('testDrive', {}).get('callbackPrefix'), config.get('testDrive', {}).get('callbackSuffix'), bucket], sort_keys=True).encode()).hexdigest()
                if signature != previous:
                    self.warming = True
                    parts = set()
                    voice = self.resolve_voice((config.get('announcements') or {}).get('voice', ''))
                    for brand in config.get('brands', []):
                        for index, _ in enumerate(brand.get('models', []), 1):
                            for kind in ('ongoing', 'callback'):
                                plan, _ = ticket_plan(config, brand['key'], index, 1, kind)
                                parts.update(plan)
                    numbers = set(range(0, 151)) | set(range(max(151, highest - 10), min(99999, highest + 50) + 1))
                    parts.update(' '.join(str(number).zfill(2)) for number in numbers)
                    for text in sorted(parts):
                        while self.busy or not self.jobs.empty():
                            time.sleep(0.02)
                        self.cache.ensure(text, voice)
                    previous = signature
                    self.warming = False
            except Exception as error:
                self.last_error = str(error)
                self.warming = False
            time.sleep(1)
