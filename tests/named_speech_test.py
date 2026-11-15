"""Name/fallback selection without model, live data or physical playback."""
import copy
import os
import sys
import tempfile
import threading
import unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from named_speech import DEFAULTS, named_plan, validate_named, registration_warmup, private_tickets
from speech_segments import SentenceCache, preview_plan, ticket_plan
from speech_service import DesktopSpeech, sentence_warmup
from speech_segments_test import CONFIG, wav_bytes


class NamedSpeech(unittest.TestCase):
    def setUp(self):
        self.config = copy.deepcopy(CONFIG)
        self.config['namedAnnouncements'] = {**DEFAULTS, 'enabled': True}
        self.body = {'brandKey': 'brand1', 'unit': 1, 'number': 1, 'kind': 'ongoing', 'clientName': 'Juan Dela Cruz'}

    def test_exact_requested_wording_and_both_actions(self):
        for kind in ('ongoing', 'callback'):
            named, _ = named_plan(self.config, 'brand1', 1, 1, kind, 'Juan Dela Cruz')
            fallback, _ = named_plan(self.config, 'brand1', 1, 1, kind)
            self.assertIn('Juan Dela Cruz', named[0])
            self.assertNotIn('A A 0 1', named[0])
            self.assertIn('A A 0 1', fallback[0])
            self.assertIn('Geely GX3 Pro', named[0])
        self.assertEqual(named_plan(self.config, 'brand1', 1, 1, name='Juan Dela Cruz')[0],
                         ['Test driver, Juan Dela Cruz, you may now approach the registration area to test drive the Geely GX3 Pro.'])

    def test_fallback_never_waits_for_blocked_name_render_or_repeats(self):
        with tempfile.TemporaryDirectory() as directory:
            started, release = threading.Event(), threading.Event()
            rendered, played = [], []
            def synth(text, *_):
                rendered.append(text)
                if 'Juan' in text:
                    started.set(); release.wait(3)
                return wav_bytes()
            cache = SentenceCache(directory, synth)
            fallback, voice = named_plan(self.config, 'brand1', 1, 1)
            cache.compose(fallback, voice)
            named, voice = named_plan(self.config, 'brand1', 1, 1, name='Juan Dela Cruz')
            worker = threading.Thread(target=lambda: cache.compose(named, voice)); worker.start()
            try:
                self.assertTrue(started.wait(1))
                service = DesktopSpeech(cache, lambda: {'config': self.config}, lambda v: v, played.append, warmup=False)
                self.assertEqual(service.plan(self.body), (fallback, voice))
                self.assertTrue(service.enqueue(self.body)['cacheReady'])
                service.jobs.join(); self.assertEqual(len(played), 1)
                self.assertFalse(release.is_set())
            finally:
                release.set(); worker.join(3)
            self.assertEqual(len(played), 1, 'Finishing a name never queues another call')
            self.assertEqual(service.plan(self.body), (named, voice))
            service.enqueue(self.body); service.jobs.join(); self.assertEqual(len(played), 2)
            self.assertEqual(len(rendered), 2)

    def test_disabled_missing_name_and_new_voice_use_correct_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = SentenceCache(directory, lambda *_: wav_bytes())
            service = DesktopSpeech(cache, lambda: {'config': self.config}, lambda v: v, lambda _: None, warmup=False)
            named, voice = named_plan(self.config, 'brand1', 1, 1, name='Juan Dela Cruz')
            cache.compose(named, voice)
            self.config['announcements']['voice'] = 'am_liam'
            self.assertEqual(service.plan(self.body), named_plan(self.config, 'brand1', 1, 1))
            self.assertEqual(service.plan({**self.body, 'clientName': ''}), named_plan(self.config, 'brand1', 1, 1))
            self.config['namedAnnouncements']['enabled'] = False
            self.assertEqual(service.plan(self.body), ticket_plan(self.config, 'brand1', 1, 1))

    def test_validation_and_previews(self):
        for draft in [{'fallbackTemplate': '{name}'}, {'nameTemplate': '{unknown}'}, {'nameTemplate': 'x' * 601}]:
            with self.assertRaises(ValueError): validate_named(draft)
        draft = {**CONFIG['announcements'], 'model': CONFIG['brands'][0]['models'][0], 'brandName': 'Geely',
                 'namedAnnouncements': self.config['namedAnnouncements'], 'namedVariant': 'name', 'clientName': 'Juan Dela Cruz'}
        self.assertEqual(preview_plan(draft), named_plan(self.config, 'brand1', 1, 1, name='Juan Dela Cruz'))

    def test_registered_fallbacks_before_names_and_batch_uses_fallback_wording(self):
        tickets = [self.body, {**self.body, 'number': 2, 'clientName': 'Ana Cruz'}]
        plans = list(registration_warmup(self.config, tickets))
        self.assertEqual(len(plans), 8)
        self.assertTrue(all('A A' in plan[0][0] for plan in plans[:4]))
        self.assertIn('Juan', plans[4][0][0])
        self.assertIn('you may now approach the registration area to test drive', next(sentence_warmup(self.config, {}))[0][0])
        state = {'config': self.config, 'namedTickets': tickets}
        first = DesktopSpeech._sentence_signature(state)
        tickets[0] = {**tickets[0], 'clientName': 'Corrected name'}
        self.assertNotEqual(first, DesktopSpeech._sentence_signature(state))

    def test_private_journal_is_scoped_to_current_run_location_mapping_and_waiting_clients(self):
        self.config['instanceId'] = 'local'
        entry = {'queue_run_id': 'run', 'vehicle_model_id': 'model', 'queue_number': 1, 'status': 'waiting', 'registrations': {'full_name': 'Juan Dela Cruz'}}
        journal = {'instanceId': 'local', 'snapshot': {'run': {'id': 'run', 'status': 'active'}, 'models': [{'id': 'model', 'brand_key': 'brand1', 'unit_index': 1, 'full_name': 'Geely GX3 Pro'}], 'entries': [entry]}}
        self.assertEqual(len(private_tickets({'config': self.config}, journal)), 1)
        for key, value in [('status', 'done'), ('queue_run_id', 'old')]:
            changed = copy.deepcopy(journal); changed['snapshot']['entries'][0][key] = value
            self.assertEqual(private_tickets({'config': self.config}, changed), [])
        journal['instanceId'] = 'foreign'
        self.assertEqual(private_tickets({'config': self.config}, journal), [])


if __name__ == '__main__': unittest.main()
