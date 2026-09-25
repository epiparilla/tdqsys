import io
import os
import soundfile as sf
import numpy as np
import re
from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from kokoro_onnx import Kokoro

app = FastAPI()

# Allow CORS for local requests from the frontend display
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent cache directory for pre-rendered audio
CACHE_DIR = os.path.join(os.path.dirname(__file__), "audio_cache")
SPEAKER_CACHE_DIR = os.path.join(CACHE_DIR, "speakers")
NUMBER_CACHE_DIR = os.path.join(CACHE_DIR, "numbers")

# Ensure cache directories exist
os.makedirs(SPEAKER_CACHE_DIR, exist_ok=True)
os.makedirs(NUMBER_CACHE_DIR, exist_ok=True)

# Load the ONNX model and voices
print("Loading Kokoro TTS Model...")
kokoro = None
AUDIO_CACHE = {}
global_sr = 24000
import threading

highest_rendered = 99
render_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Config-driven model pronunciations.
# Reads the v2 config (data.json) so acronyms are no longer hardcoded.
# PRONOUNCE_MAP:  prefix (uppercase) -> {"text": spoken words, "key": cache key}
# ---------------------------------------------------------------------------
DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")
DEFAULT_SPEECH_UNITS = [
    ("RH", "R H"), ("BZ", "B Z"), ("UC", "U C"), ("RA", "R A"),
    ("YC", "Y C"), ("CC", "C C"), ("AH", "A H"),
    ("IS", "I S"), ("NX", "N X"), ("LBX", "L B X"), ("RX", "R X")
]

def _normalize_key(text):
    """'A H' -> 'A-H' so it survives as a safe filename/cache key."""
    return " ".join(text.split()).replace(" ", "-").upper()

def load_pronounce_map():
    units = {}
    try:
        if os.path.exists(DATA_FILE):
            import json
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                doc = json.load(f)
            brands = (doc.get("config") or {}).get("brands") or []
            for brand in brands:
                for m in brand.get("models") or []:
                    prefix = (m.get("prefix") or "").strip().upper()
                    if not prefix:
                        continue
                    text = (m.get("pronounce") or "").strip() or " ".join(prefix)
                    units[prefix] = {"text": text, "key": _normalize_key(text)}
    except Exception as e:
        print(f"Could not read data.json for pronunciations ({e}); using defaults.")
    if not units:
        for prefix, text in DEFAULT_SPEECH_UNITS:
            units[prefix] = {"text": text, "key": _normalize_key(text)}
    print(f"Loaded {len(units)} pronunciation units from config.")
    return units

pronounce_map = load_pronounce_map()

def speech_keys():
    """The set of cache keys needed for all configured model prefixes."""
    return {v["key"] for v in pronounce_map.values()}

def cache_path(key):
    """Return the file path for a cached audio key."""
    if key in ('prefix', 'suffix'):
        return os.path.join(SPEAKER_CACHE_DIR, f"{key}.wav")
    else:
        return os.path.join(SPEAKER_CACHE_DIR, f"{key}.wav")

def number_cache_path(num_str):
    """Return the file path for a cached number like '01', '02', etc."""
    return os.path.join(NUMBER_CACHE_DIR, f"{num_str}.wav")

def save_to_cache(key, audio, sr):
    """Save a numpy audio array to disk as WAV."""
    path = cache_path(key)
    sf.write(path, audio, sr, format='WAV')

def save_number_to_cache(num_str, audio, sr):
    """Save a number audio clip to disk as WAV."""
    path = number_cache_path(num_str)
    sf.write(path, audio, sr, format='WAV')

def load_from_cache(key):
    """Load a WAV file from disk into a numpy array. Returns None if not found."""
    path = cache_path(key)
    if os.path.exists(path):
        data, sr = sf.read(path)
        return data, sr
    return None

def load_number_from_cache(num_str):
    """Load a number WAV from disk. Returns None if not found."""
    path = number_cache_path(num_str)
    if os.path.exists(path):
        data, sr = sf.read(path)
        return data, sr
    return None

def cache_is_complete(max_num=150):
    """Check if all required cache files exist on disk."""
    for key in ('prefix', 'suffix'):
        if not os.path.exists(cache_path(key)):
            return False
    acronyms = speech_keys()
    for ac in acronyms:
        if not os.path.exists(cache_path(ac)):
            return False
    for i in range(1, max_num + 1):
        if not os.path.exists(number_cache_path(f"{i:02d}")):
            return False
    return True

def trim_silence(audio, threshold=0.015, keep_ms=5):
    """Removes trailing/leading silence from generated audio to prevent awkward pauses when concatenating"""
    non_silent_indices = np.where(np.abs(audio) > threshold)[0]
    if len(non_silent_indices) == 0:
        return audio
    pad = int(global_sr * (keep_ms / 1000.0))
    start = max(0, non_silent_indices[0] - pad)
    end = min(len(audio), non_silent_indices[-1] + pad)
    return audio[start:end]

def render_and_cache(text, key, voice="af_heart", speed=1.0, lang="en-us"):
    """Render audio with Kokoro, trim silence, save to cache, and store in memory."""
    global global_sr
    raw, sr = kokoro.create(text, voice=voice, speed=speed, lang=lang)
    trimmed = trim_silence(raw)
    save_to_cache(key, trimmed, sr)
    global_sr = sr
    AUDIO_CACHE[key] = trimmed
    return trimmed

def render_and_cache_number(num_str, voice="af_heart", speed=1.0, lang="en-us"):
    """Render a number clip, save to disk cache, and store in memory."""
    global global_sr
    spaced_num = " ".join(num_str)
    raw, sr = kokoro.create(spaced_num, voice=voice, speed=speed, lang=lang)
    trimmed = trim_silence(raw)
    save_number_to_cache(num_str, trimmed, sr)
    global_sr = sr
    AUDIO_CACHE[spaced_num] = trimmed
    return trimmed

def load_all_from_cache():
    """Load all pre-rendered WAVs from disk into the in-memory cache."""
    global global_sr
    print("Loading pre-rendered audio from disk cache...")
    for key in ('prefix', 'suffix'):
        path = cache_path(key)
        if os.path.exists(path):
            data, sr = sf.read(path)
            AUDIO_CACHE[key] = data
            global_sr = sr

    acronyms = speech_keys()
    for ac in acronyms:
        path = cache_path(ac)
        if os.path.exists(path):
            data, sr = sf.read(path)
            AUDIO_CACHE[ac] = data

    for i in range(1, 151):
        num_str = f"{i:02d}"
        spaced_num = " ".join(num_str)
        data, sr = sf.read(number_cache_path(num_str))
        AUDIO_CACHE[spaced_num] = data

    print(f"Loaded {len(AUDIO_CACHE)} audio clips from disk cache. Ready.")

    # Set highest_rendered to 150 since we pre-rendered that many
    global highest_rendered
    highest_rendered = 150

def render_all_from_scratch():
    """Full render of all clips — called when cache is missing or deleted."""
    print("Cache missing or incomplete — rendering all audio from scratch...")
    
    # 1. Prefix and Suffix
    print("Rendering prefix and suffix...")
    render_and_cache("Test driver", 'prefix')
    render_and_cache("you may now approach the registration area for your test drive.", 'suffix')
    
    # 2. Acronyms (config-driven pronunciations)
    print("Rendering acronyms...")
    for unit in pronounce_map.values():
        render_and_cache(unit["text"], unit["key"], speed=1.1)
        
    # 3. Numbers 01 to 150
    print("Rendering numbers 01 to 150...")
    for i in range(1, 151):
        num_str = f"{i:02d}"
        render_and_cache_number(num_str)
    
    global highest_rendered
    highest_rendered = 150
    print("Full render complete! All audio saved to disk cache. Ready.")

def background_render_range(start_val, end_val):
    """Render and cache numbers in a background thread. Also saves to disk."""
    print(f"Background thread started: Rendering {start_val} to {end_val}...")
    for i in range(start_val, end_val + 1):
        num_str = f"{i:02d}"
        spaced_num = " ".join(num_str)
        if spaced_num not in AUDIO_CACHE:
            try:
                render_and_cache_number(num_str)
            except Exception as e:
                print(f"Error rendering {spaced_num}: {e}")
    with render_lock:
        global highest_rendered
        if end_val > highest_rendered:
            highest_rendered = end_val
    print(f"Background thread finished: Numbers {start_val}-{end_val} cached and saved to disk.")

try:
    kokoro = Kokoro("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
    print("Kokoro Model Loaded Successfully!")
    
    if cache_is_complete(max_num=150):
        load_all_from_cache()
    else:
        render_all_from_scratch()
    
except Exception as e:
    print(f"Failed to load model or render audio: {e}")


@app.get("/api/speak")
async def speak(text: str, voice: str = "af_heart", speed: float = 1.0):
    if not kokoro:
        return Response(content="Model not loaded", status_code=500)
    
    try:
        samples, sample_rate = kokoro.create(
            text, voice=voice, speed=speed, lang="en-us"
        )
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV')
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except Exception as e:
        print(f"Error generating speech: {e}")
        return Response(content=f"Error generating speech: {e}", status_code=500)

@app.get("/api/speak_unit")
async def speak_unit(unit: str, voice: str = "af_heart", speed: float = 1.0):
    if not kokoro or not AUDIO_CACHE:
        return Response(content="Model or pre-rendered audio not loaded", status_code=500)
    
    try:
        letters = re.findall(r'[A-Za-z]', unit)
        numbers = re.findall(r'\d', unit)
        
        # Dynamic Continuous Background Rendering
        global highest_rendered
        if numbers:
            num_val = int("".join(numbers))
            with render_lock:
                if highest_rendered - num_val <= 10:
                    start_num = highest_rendered + 1
                    end_num = highest_rendered + 10
                    highest_rendered = end_num
                    print(f"Approaching queue limit ({num_val}). Triggering background render for {start_num} to {end_num}...")
                    threading.Thread(target=background_render_range, args=(start_num, end_num), daemon=True).start()
        
        # Format the keys to match the pre-rendered AUDIO_CACHE (config-driven)
        acronym_raw = "".join(letters).upper()
        entry = pronounce_map.get(acronym_raw)
        if entry is None:
            return Response(content=f"Unknown prefix: {acronym_raw}", status_code=400)
        acronym_key = entry["key"]
        acronym_text = entry["text"]
        
        number_key = " ".join(numbers)
        
        # Fallback generation for cache misses — also persist to disk
        if acronym_key not in AUDIO_CACHE:
            print(f"Cache miss for {acronym_key}, generating and saving to disk...")
            render_and_cache(acronym_text, acronym_key, voice=voice, speed=speed)
            
        if number_key not in AUDIO_CACHE:
            print(f"Cache miss for {number_key}, generating and saving to disk...")
            num_str = "".join(numbers)
            render_and_cache_number(num_str, voice=voice, speed=speed)
        
        # Zero-Latency Splicing
        pieces = []
        pieces.append(AUDIO_CACHE['prefix'])
        
        word_gap = np.zeros(int(global_sr * 0.05), dtype=np.float32)   # 50ms pause from main sentence
        block_gap = np.zeros(int(global_sr * 0.02), dtype=np.float32)  # 20ms pause between acronym and number
        
        pieces.append(word_gap)
        pieces.append(AUDIO_CACHE[acronym_key])
        pieces.append(block_gap)
        pieces.append(AUDIO_CACHE[number_key])
        pieces.append(word_gap)
        pieces.append(AUDIO_CACHE['suffix'])
        
        combined = np.concatenate(pieces)
        
        buffer = io.BytesIO()
        sf.write(buffer, combined, global_sr, format='WAV')
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except Exception as e:
        print(f"Error generating speech: {e}")
        return Response(content=f"Error generating speech: {e}", status_code=500)

if __name__ == "__main__":
    import uvicorn
    # Prefer config value (data.json), then AF_TTS_PORT env, then 8000.
    port = 8000
    try:
        if os.path.exists(DATA_FILE):
            import json
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                doc = json.load(f)
            port = int((doc.get("config") or {}).get("ttsPort") or os.environ.get("AF_TTS_PORT", "8000"))
    except Exception:
        port = int(os.environ.get("AF_TTS_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
