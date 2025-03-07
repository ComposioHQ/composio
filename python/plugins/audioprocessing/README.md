# Composio Local Audio Processing Tool

This plugin provides local audio processing capabilities for the Composio SDK. It enables various audio processing tasks without requiring external API calls.

## Features

- **Audio Transcription**: Convert speech to text using the Wav2Vec2 model
- **Audio Analysis**: Extract various audio properties and features
- **Audio Effects**: Apply various audio effects including:
  - Normalization
  - Pitch shifting
  - Speed adjustment
  - Reverb
- **Audio Splitting**: Split audio files into segments of specified length

## Installation

Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Usage

```python
from composio.plugins.audioprocessing import AudioProcessingTool

# Initialize the tool
audio_tool = AudioProcessingTool()

# Transcribe audio
text = audio_tool.transcribe("path/to/audio.wav")
print(f"Transcription: {text}")

# Analyze audio properties
analysis = audio_tool.analyze_audio("path/to/audio.wav")
print(f"Audio analysis: {analysis}")

# Apply effects
effects = {
    "normalize": True,
    "pitch_shift": 2,  # Shift pitch up by 2 semitones
    "speed": 1.5,      # Speed up by 50%
    "reverb": 0.3      # Add reverb with 0.3s decay
}
processed_path = audio_tool.apply_effects(
    "path/to/input.wav",
    "path/to/output.wav",
    effects
)

# Split audio into segments
segments = audio_tool.split_audio(
    "path/to/audio.wav",
    "output/directory",
    segment_length=10.0  # 10-second segments
)
```

## Requirements

- Python 3.8+
- NumPy
- librosa
- soundfile
- PyTorch
- Transformers
- torchaudio

## Notes

- The speech recognition model (Wav2Vec2) will be downloaded on first use
- GPU acceleration is automatically used if available
- Audio files should be in a format supported by librosa (WAV, MP3, etc.) 