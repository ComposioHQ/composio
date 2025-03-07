"""
Local Audio Processing Tool for Composio SDK
"""

import os
import wave
import numpy as np
from typing import Optional, Dict, Any, List, Tuple
import soundfile as sf
import librosa
import torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

class AudioProcessingTool:
    """A tool for local audio processing tasks including transcription, analysis, and basic transformations."""
    
    def __init__(self, model_name: str = "facebook/wav2vec2-base-960h"):
        """
        Initialize the AudioProcessingTool.
        
        Args:
            model_name (str): Name of the pre-trained model to use for speech recognition
        """
        self.model_name = model_name
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = None
        self.model = None
        
    def _load_model(self):
        """Load the speech recognition model and processor."""
        if self.processor is None or self.model is None:
            self.processor = Wav2Vec2Processor.from_pretrained(self.model_name)
            self.model = Wav2Vec2ForCTC.from_pretrained(self.model_name).to(self.device)
    
    def load_audio(self, file_path: str) -> Tuple[np.ndarray, int]:
        """
        Load an audio file and return the audio data and sample rate.
        
        Args:
            file_path (str): Path to the audio file
            
        Returns:
            Tuple[np.ndarray, int]: Audio data and sample rate
        """
        audio_data, sample_rate = librosa.load(file_path, sr=None)
        return audio_data, sample_rate
    
    def transcribe(self, file_path: str) -> str:
        """
        Transcribe speech from an audio file to text.
        
        Args:
            file_path (str): Path to the audio file
            
        Returns:
            str: Transcribed text
        """
        self._load_model()
        audio_data, sample_rate = self.load_audio(file_path)
        
        # Resample if necessary
        if sample_rate != 16000:
            audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=16000)
            sample_rate = 16000
        
        inputs = self.processor(audio_data, sampling_rate=sample_rate, return_tensors="pt").to(self.device)
        with torch.no_grad():
            logits = self.model(inputs.input_values).logits
        
        predicted_ids = torch.argmax(logits, dim=-1)
        transcription = self.processor.batch_decode(predicted_ids)[0]
        return transcription
    
    def analyze_audio(self, file_path: str) -> Dict[str, Any]:
        """
        Analyze audio file and return various properties.
        
        Args:
            file_path (str): Path to the audio file
            
        Returns:
            Dict[str, Any]: Dictionary containing audio properties
        """
        audio_data, sample_rate = self.load_audio(file_path)
        
        # Calculate various audio features
        duration = len(audio_data) / sample_rate
        tempo, _ = librosa.beat.beat_track(y=audio_data, sr=sample_rate)
        rms = librosa.feature.rms(y=audio_data)[0]
        spectral_centroids = librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)[0]
        
        return {
            "duration": duration,
            "sample_rate": sample_rate,
            "tempo": tempo,
            "avg_amplitude": float(np.mean(np.abs(audio_data))),
            "max_amplitude": float(np.max(np.abs(audio_data))),
            "avg_rms": float(np.mean(rms)),
            "avg_spectral_centroid": float(np.mean(spectral_centroids))
        }
    
    def apply_effects(self, file_path: str, output_path: str, effects: Dict[str, Any]) -> str:
        """
        Apply audio effects to the input file and save the result.
        
        Args:
            file_path (str): Path to the input audio file
            output_path (str): Path to save the processed audio
            effects (Dict[str, Any]): Dictionary of effects to apply
            
        Returns:
            str: Path to the processed audio file
        """
        audio_data, sample_rate = self.load_audio(file_path)
        
        # Apply requested effects
        if effects.get("normalize", False):
            audio_data = librosa.util.normalize(audio_data)
        
        if "pitch_shift" in effects:
            audio_data = librosa.effects.pitch_shift(
                audio_data, 
                sr=sample_rate, 
                n_steps=effects["pitch_shift"]
            )
        
        if "speed" in effects:
            audio_data = librosa.effects.time_stretch(audio_data, rate=effects["speed"])
        
        if "reverb" in effects:
            # Simple convolution reverb
            reverb_length = int(sample_rate * effects["reverb"])
            impulse_response = np.exp(-np.linspace(0, 5, reverb_length))
            audio_data = np.convolve(audio_data, impulse_response, mode='full')[:len(audio_data)]
        
        # Save the processed audio
        sf.write(output_path, audio_data, sample_rate)
        return output_path
    
    def split_audio(self, file_path: str, output_dir: str, segment_length: float = 10.0) -> List[str]:
        """
        Split audio file into segments of specified length.
        
        Args:
            file_path (str): Path to the audio file
            output_dir (str): Directory to save the segments
            segment_length (float): Length of each segment in seconds
            
        Returns:
            List[str]: List of paths to the generated segments
        """
        audio_data, sample_rate = self.load_audio(file_path)
        samples_per_segment = int(segment_length * sample_rate)
        
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Split the audio into segments
        segment_paths = []
        for i, start in enumerate(range(0, len(audio_data), samples_per_segment)):
            segment = audio_data[start:start + samples_per_segment]
            if len(segment) < samples_per_segment / 2:  # Skip very short segments
                continue
                
            segment_path = os.path.join(output_dir, f"segment_{i:03d}.wav")
            sf.write(segment_path, segment, sample_rate)
            segment_paths.append(segment_path)
        
        return segment_paths 