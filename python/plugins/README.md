# Composio Plugins

## Audio Processing Tool

The Audio Processing Tool is a local audio processing utility that can be used with the Composio SDK. It provides functionality for loading, processing, and analyzing audio files.

### Installation

Install the required dependencies:

```bash
pip install -r requirements.txt
```

### Features

- Load and save audio files
- Apply audio effects:
  - Gain adjustment
  - Reverb
  - Pitch shifting
- Extract audio features:
  - RMS energy
  - Zero crossing rate
  - Spectral centroid

### Usage Example

```python
from plugins.audio_processor import AudioProcessor

# Initialize the processor
processor = AudioProcessor(sample_rate=44100)

# Load audio
audio_data, _ = processor.load_audio('input.wav')

# Apply effects
effects = {
    'gain': 1.5,
    'reverb': 0.3,
    'pitch_shift': 2.0
}
processed_audio = processor.apply_effects(audio_data, effects)

# Get audio features
features = processor.get_audio_features(audio_data)

# Save processed audio
processor.save_audio('output.wav', processed_audio)
```

### API Reference

#### AudioProcessor

```python
class AudioProcessor:
    def __init__(self, sample_rate: int = 44100)
    def load_audio(self, file_path: str) -> tuple[np.ndarray, int]
    def save_audio(self, file_path: str, audio_data: np.ndarray) -> None
    def apply_effects(self, audio_data: np.ndarray, effects: Dict[str, Any]) -> np.ndarray
    def get_audio_features(self, audio_data: np.ndarray) -> Dict[str, float]
```

For more detailed examples, see the `examples/audio_processing_example.py` file. 