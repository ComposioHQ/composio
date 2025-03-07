import numpy as np
from typing import Optional, Dict, Any
import soundfile as sf
import librosa

class AudioProcessor:
    """A local audio processing tool for the Composio SDK."""
    
    def __init__(self, sample_rate: int = 44100):
        """Initialize the audio processor.
        
        Args:
            sample_rate (int): The sample rate to use for processing. Defaults to 44100 Hz.
        """
        self.sample_rate = sample_rate
        
    def load_audio(self, file_path: str) -> tuple[np.ndarray, int]:
        """Load an audio file.
        
        Args:
            file_path (str): Path to the audio file.
            
        Returns:
            tuple: (audio_data, sample_rate)
        """
        return librosa.load(file_path, sr=self.sample_rate)
    
    def save_audio(self, file_path: str, audio_data: np.ndarray) -> None:
        """Save audio data to a file.
        
        Args:
            file_path (str): Path where to save the audio file.
            audio_data (np.ndarray): The audio data to save.
        """
        sf.write(file_path, audio_data, self.sample_rate)
    
    def apply_effects(self, audio_data: np.ndarray, effects: Dict[str, Any]) -> np.ndarray:
        """Apply audio effects to the audio data.
        
        Args:
            audio_data (np.ndarray): The audio data to process.
            effects (Dict[str, Any]): Dictionary of effects to apply.
                Supported effects:
                - 'gain': float (amplitude multiplier)
                - 'reverb': float (reverb amount, 0-1)
                - 'pitch_shift': float (semitones)
                
        Returns:
            np.ndarray: Processed audio data
        """
        processed_data = audio_data.copy()
        
        for effect, value in effects.items():
            if effect == 'gain':
                processed_data *= float(value)
            elif effect == 'reverb':
                # Simple convolution reverb
                reverb_length = int(self.sample_rate * float(value))
                impulse = np.exp(-np.linspace(0, 5, reverb_length))
                processed_data = np.convolve(processed_data, impulse, mode='same')
            elif effect == 'pitch_shift':
                processed_data = librosa.effects.pitch_shift(
                    processed_data,
                    sr=self.sample_rate,
                    n_steps=float(value)
                )
                
        return processed_data
    
    def get_audio_features(self, audio_data: np.ndarray) -> Dict[str, float]:
        """Extract audio features from the audio data.
        
        Args:
            audio_data (np.ndarray): The audio data to analyze.
            
        Returns:
            Dict[str, float]: Dictionary of audio features
        """
        features = {
            'rms_energy': float(np.sqrt(np.mean(audio_data**2))),
            'zero_crossing_rate': float(librosa.feature.zero_crossing_rate(audio_data)[0].mean()),
            'spectral_centroid': float(librosa.feature.spectral_centroid(
                y=audio_data, sr=self.sample_rate
            )[0].mean())
        }
        return features 