import io
import copy
import os
import tempfile
import threading
import time
import unittest
import wave
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from speech_segments import SegmentCache, ticket_plan, preview_plan, JOIN_GAP_MS
from speech_service import DesktopSpeech

CONFIG = {'brands':[{'key':'brand1','name':'Geely','models':[{'label':'Geely GX3 Pro','prefix':'AA','pronounce':'A A'}]}],
          'announcements':{'voice':'af_heart','prefix':'Test driver','template':'{ticket}','suffix':'please approach'},
          'testDrive':{'callbackPrefix':'Test driver','callbackSuffix':'please stand by for'}}

def wav_bytes():
    output = io.BytesIO()
    with wave.open(output, 'wb') as clip:
        clip.setparams((1,2,24000,0,'NONE','not compressed'))
        clip.writeframes(b'\x01\0' * 240)
    return output.getvalue()

class SpeechSegments(unittest.TestCase):
    def test_previews_pause_warmup_without_queuing_playback_and_release_priority_on_error(self):
        with tempfile.TemporaryDirectory() as directory:
            def synth(*_):
                self.assertEqual(service.preparing_previews,1)
                return wav_bytes()
            cache=SegmentCache(directory,synth)
            service=DesktopSpeech(cache,lambda:{'config':CONFIG},lambda voice:voice,lambda _:self.fail('Preview must not queue physical playback'),warmup=False)
            self.assertTrue(service.preview_audio(['Preview'],'af_heart').startswith(b'RIFF'))
            self.assertEqual(service.preparing_previews,0);self.assertEqual(service.jobs.qsize(),0);self.assertEqual(service.completed,0)
            cache.compose=lambda *_:(_ for _ in ()).throw(ValueError('broken clip'))
            with self.assertRaises(ValueError):service.preview_audio(['Preview'],'af_heart')
            self.assertEqual(service.preparing_previews,0)
    def test_preview_uses_exact_live_segments_for_both_actions_and_reuses_audio_bytes(self):
        config=copy.deepcopy(CONFIG)
        config['announcements']['template']='{ticket} to {counter} for {service}'
        config['brands'][0]['models'][0]['shortnamePronounce']='G X three'
        body={**config['announcements'],'model':config['brands'][0]['models'][0],
              'brandName':'Geely','number':1,**config['testDrive']}
        with tempfile.TemporaryDirectory() as directory:
            calls=[];cache=SegmentCache(directory,lambda text,voice,speed:(calls.append((text,voice)),wav_bytes())[1])
            for kind in ('ongoing','callback'):
                body['kind']=kind
                parts,voice=preview_plan(body)
                self.assertEqual((parts,voice),ticket_plan(config,'brand1',1,1,kind))
                preview=cache.compose(parts,voice);count=len(calls)
                self.assertEqual(preview,cache.compose(*ticket_plan(config,'brand1',1,1,kind)))
                self.assertEqual(count,len(calls))
            self.assertEqual(config['announcements']['prefix'],CONFIG['announcements']['prefix'])

    def test_preview_rejects_invalid_values_and_unsaved_wording_gets_its_own_clips(self):
        body={**CONFIG['announcements'],'model':CONFIG['brands'][0]['models'][0],'brandName':'Geely'}
        old,_=preview_plan(body)
        edited={**body,'prefix':'Now serving'}
        self.assertNotEqual(old,preview_plan(edited)[0])
        for bad in [None,{}, {**body,'template':'{unknown}'},{**body,'number':0},{**body,'voice':'bad/voice'}, {**body,'prefix':'x'*201}]:
            with self.assertRaises(ValueError):preview_plan(bad)

    def test_pcm_join_is_ten_milliseconds_without_dropping_clip_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            cache=SegmentCache(directory,lambda *_:wav_bytes())
            audio=cache.compose(['First','Second','Third'],'af_heart')
            with wave.open(io.BytesIO(audio),'rb') as combined:
                self.assertEqual(JOIN_GAP_MS,10)
                self.assertEqual(combined.getnframes(),3*240+2*240)
    def test_shortname_pronunciation_replaces_only_spoken_model_and_is_warmed(self):
        config=copy.deepcopy(CONFIG)
        config['brands'][0]['models'][0]['shortnamePronounce']='G X three pro'
        config['announcements']['template']='{ticket} for {counter}'
        self.assertIn('G X three pro',ticket_plan(config,'brand1',1,1)[0])
        self.assertEqual(ticket_plan(config,'brand1',1,1,'callback')[0][-1],'G X three pro')
        self.assertEqual(ticket_plan(config,'brand1',1,1)[0][1],'A A')
    def test_normal_and_callback_use_pronunciation_and_full_digits(self):
        self.assertEqual(ticket_plan(CONFIG,'brand1',1,1)[0],['Test driver','A A','0 1','please approach'])
        self.assertEqual(ticket_plan(CONFIG,'brand1',1,101,'callback')[0],['Test driver','A A','1 0 1','please stand by for','Geely GX3 Pro'])

    def test_cached_composition_and_restart_never_synthesize_whole_sentences(self):
        calls=[]
        with tempfile.TemporaryDirectory() as directory:
            cache=SegmentCache(directory,lambda text,voice,speed:(calls.append((text,voice)),wav_bytes())[1])
            parts,voice=ticket_plan(CONFIG,'brand1',1,1)
            for part in parts:cache.ensure(part,voice)
            before=len(calls);audio=cache.compose(parts,voice)
            self.assertEqual(len(calls),before);self.assertTrue(audio.startswith(b'RIFF'))
            restarted=SegmentCache(directory,lambda *_:self.fail('Cache was not persistent'))
            self.assertEqual(restarted.compose(parts,voice),audio)
            cache.compose(parts,'af_nova');self.assertGreater(len(calls),before)
            self.assertNotIn('Test driver A A 0 1 please approach',[text for text,_ in calls])

    def test_templates_and_setting_changes_get_separate_clip_filenames(self):
        config={**CONFIG,'announcements':{**CONFIG['announcements'],'template':'{ticket} to {counter} at {service}'}}
        parts,_=ticket_plan(config,'brand1',1,7)
        self.assertEqual(parts,['Test driver','A A','0 7','to','Geely GX3 Pro','at','Geely','please approach'])
        with tempfile.TemporaryDirectory() as directory:
            cache=SegmentCache(directory,lambda *_:wav_bytes())
            self.assertNotEqual(cache.filename('prefix one','af_heart'),cache.filename('prefix two','af_heart'))
            self.assertNotEqual(cache.filename('0 1','af_heart'),cache.filename('0 1','af_nova'))

    def test_fifo_playback_outlives_request_and_does_not_interrupt_previous_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            cache=SegmentCache(directory,lambda *_:wav_bytes())
            gate=threading.Event();started=threading.Event();played=[]
            def play(audio):
                played.append(audio);started.set()
                if len(played)==1:gate.wait(2)
            service=DesktopSpeech(cache,lambda:{'config':CONFIG},lambda voice:voice,play,warmup=False)
            first=service.enqueue({'brandKey':'brand1','unit':1,'number':1})
            self.assertTrue(first['queued']);self.assertTrue(started.wait(1))
            service.enqueue({'brandKey':'brand1','unit':1,'number':2,'kind':'callback'})
            self.assertEqual(len(played),1)
            gate.set();service.jobs.join()
            self.assertEqual(len(played),2);self.assertEqual(service.completed,2);self.assertIsNone(service.last_error)

if __name__=='__main__':unittest.main()
