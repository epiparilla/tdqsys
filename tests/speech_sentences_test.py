"""Whole-sentence cache tests; no model, live data or physical speaker."""
import copy
import os
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from speech_segments import SentenceCache, ticket_plan, preview_plan
from speech_service import DesktopSpeech, sentence_warmup
from speech_segments_test import CONFIG, wav_bytes


class SpeechSentences(unittest.TestCase):
    def test_one_complete_render_per_action_and_restart_reuses_identical_wav(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            cache = SentenceCache(directory, lambda text, voice, speed: (calls.append((text, voice, speed)), wav_bytes())[1])
            for kind in ('ongoing', 'callback'):
                parts, voice = ticket_plan(CONFIG, 'brand1', 1, 1, kind)
                self.assertFalse(cache.ready(parts, voice))
                audio = cache.compose(parts, voice)
                self.assertEqual(calls[-1], (' '.join(parts), voice, 1.0))
                self.assertTrue(cache.ready(parts, voice))
                self.assertEqual(audio, wav_bytes(), 'No stitching or added gaps')
                restarted = SentenceCache(directory, lambda *_: self.fail('Unexpected re-render'))
                self.assertEqual(restarted.compose(parts, voice), audio)
            self.assertEqual(len(calls), 2)

    def test_voice_wording_number_and_model_have_separate_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = SentenceCache(directory, lambda *_: wav_bytes())
            base = cache.filename('Test driver E X 0 1 please approach', 'am_liam')
            for text, voice in [('Test driver E X 0 2 please approach', 'am_liam'),
                                ('Test driver C R Y 0 1 please approach', 'am_liam'),
                                ('Now serving E X 0 1 please approach', 'am_liam'),
                                ('Test driver E X 0 1 please approach', 'af_heart')]:
                self.assertNotEqual(base, cache.filename(text, voice))

    def test_preview_and_playback_share_sentence_without_saving_or_playing_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            calls, played = [], []
            cache = SentenceCache(directory, lambda text, *_: (calls.append(text), wav_bytes())[1])
            service = DesktopSpeech(cache, lambda: {'config': CONFIG}, lambda voice: voice, played.append, warmup=False)
            for kind in ('ongoing', 'callback'):
                draft = {**CONFIG['announcements'], **CONFIG['testDrive'], 'kind': kind,
                         'brandName': 'Geely', 'model': CONFIG['brands'][0]['models'][0]}
                played_before = len(played)
                preview = service.preview_audio(*preview_plan(draft))
                self.assertEqual(preview, cache.compose(*service.plan({'brandKey':'brand1','unit':1,'number':1,'kind':kind})))
                self.assertEqual(len(played), played_before)
                self.assertTrue(service.enqueue({'brandKey':'brand1','unit':1,'number':1,'kind':kind})['cacheReady'])
                service.jobs.join()
            self.assertEqual(len(calls), 2)
            self.assertEqual(len(played), 2)
            self.assertEqual(service.status()['mode'], 'whole-sentence')

    def test_50_number_batch_extends_at_25_per_model_and_round_robins(self):
        config = copy.deepcopy(CONFIG)
        config['brands'][0]['models'].append({'label':'Second', 'prefix':'BB','pronounce':'B B'})
        plans = list(sentence_warmup(config, {}))
        self.assertEqual(len(plans), 200)  # 2 models x 50 x 2 actions
        self.assertIn('B B', plans[2][0])  # Before model one's number 02.
        extended = list(sentence_warmup(config, {'brand1': {'1': 25, '2': 0}}))
        self.assertEqual(len(extended), (76 + 50) * 2)
        self.assertTrue(any('1 0 0' in parts and 'A A' in parts for parts, _ in extended))
        self.assertFalse(any('1 0 0' in parts and 'B B' in parts for parts, _ in extended))
        edge = list(sentence_warmup(CONFIG, {'brand1': {'1':99999}}))
        self.assertEqual(len(edge), 2)

    def test_cached_disk_and_memory_playback_do_not_wait_for_background_render(self):
        with tempfile.TemporaryDirectory() as directory:
            started, release = threading.Event(), threading.Event()
            def synth(text, *_):
                if text == 'Missing':
                    started.set()
                    release.wait(2)
                return wav_bytes()
            cache = SentenceCache(directory, synth)
            cache.compose(['Cached'], 'am_liam')
            worker = threading.Thread(target=lambda: cache.compose(['Missing'], 'am_liam'))
            worker.start()
            try:
                self.assertTrue(started.wait(1))
                self.assertEqual(cache.compose(['Cached'], 'am_liam'), wav_bytes())
                cache.memory.clear()
                self.assertEqual(cache.compose(['Cached'], 'am_liam'), wav_bytes())
                self.assertFalse(release.is_set())
            finally:
                release.set()
                worker.join(2)

    def test_ram_is_bounded_and_evicted_sentences_still_exist_on_disk(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            cache = SentenceCache(directory, lambda text, *_: (calls.append(text), wav_bytes())[1])
            for number in range(40):
                cache.compose([str(number)], 'am_liam')
            self.assertLessEqual(len(cache.memory), 32)
            self.assertEqual(cache.compose(['0'], 'am_liam'), wav_bytes())
            self.assertEqual(len(calls), 40)

    def test_warmup_abandons_obsolete_wording_between_renders(self):
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(CONFIG)
            calls = []
            def synth(text, *_):
                calls.append(text)
                config['announcements']['prefix'] = 'Changed wording'
                return wav_bytes()
            cache = SentenceCache(directory, synth)
            service = DesktopSpeech(cache, lambda: {'config':config}, lambda voice:voice, lambda _:None, warmup=False)
            with patch('speech_service.time.sleep', side_effect=StopIteration):
                with self.assertRaises(StopIteration):
                    service._warm_sentences()
            self.assertEqual(len(calls), 1)
            self.assertEqual(service.prepared, 1)
            self.assertFalse(service.warming)


if __name__ == '__main__':
    unittest.main()
