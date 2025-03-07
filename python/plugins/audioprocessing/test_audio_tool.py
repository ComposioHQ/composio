"""
Tests for the AudioProcessingTool
"""

import os
import pytest
import numpy as np
from .audio_tool import AudioProcessingTool

@pytest.fixture
def audio_tool():
    """Create an AudioProcessingTool instance for testing."""
    return AudioProcessingTool()

@pytest.fixture
def sample_audio(tmp_path):
    """Create a sample audio file for testing."""
    sample_rate = 16000
    duration = 1.0  # seconds
    t = np.linspace(0, duration, int(sample_rate * duration))
    # Generate a 440 Hz sine wave
    audio_data = np.sin(2 * np.pi * 440 * t)
    
    # Save the audio file
    audio_path = tmp_path / "test_audio.wav"
    import soundfile as sf
    sf.write(str(audio_path), audio_data, sample_rate)
    
    return str(audio_path)

def test_load_audio(audio_tool, sample_audio):
    """Test loading audio file."""
    audio_data, sample_rate = audio_tool.load_audio(sample_audio)
    assert isinstance(audio_data, np.ndarray)
    assert isinstance(sample_rate, int)
    assert len(audio_data.shape) == 1
    assert sample_rate > 0

def test_analyze_audio(audio_tool, sample_audio):
    """Test audio analysis."""
    analysis = audio_tool.analyze_audio(sample_audio)
    
    # Check required keys
    required_keys = [
        "duration", "sample_rate", "tempo", "avg_amplitude",
        "max_amplitude", "avg_rms", "avg_spectral_centroid"
    ]
    for key in required_keys:
        assert key in analysis
        
    # Check value types and ranges
    assert isinstance(analysis["duration"], float)
    assert isinstance(analysis["sample_rate"], int)
    assert isinstance(analysis["tempo"], float)
    assert 0 <= analysis["avg_amplitude"] <= 1
    assert 0 <= analysis["max_amplitude"] <= 1
    assert analysis["avg_rms"] >= 0
    assert analysis["avg_spectral_centroid"] >= 0

def test_apply_effects(audio_tool, sample_audio, tmp_path):
    """Test applying audio effects."""
    output_path = str(tmp_path / "processed.wav")
    effects = {
        "normalize": True,
        "pitch_shift": 2,
        "speed": 1.2
    }
    
    processed_path = audio_tool.apply_effects(sample_audio, output_path, effects)
    assert os.path.exists(processed_path)
    
    # Load and check the processed file
    audio_data, sample_rate = audio_tool.load_audio(processed_path)
    assert isinstance(audio_data, np.ndarray)
    assert isinstance(sample_rate, int)
    assert len(audio_data.shape) == 1

def test_split_audio(audio_tool, sample_audio, tmp_path):
    """Test splitting audio into segments."""
    output_dir = str(tmp_path / "segments")
    segment_length = 0.5  # seconds
    
    segment_paths = audio_tool.split_audio(sample_audio, output_dir, segment_length)
    
    # Check that segments were created
    assert len(segment_paths) > 0
    for path in segment_paths:
        assert os.path.exists(path)
        
        # Load and check each segment
        audio_data, sample_rate = audio_tool.load_audio(path)
        assert isinstance(audio_data, np.ndarray)
        assert isinstance(sample_rate, int)
        assert len(audio_data.shape) == 1

def test_transcribe(audio_tool, sample_audio):
    """Test audio transcription."""
    # Note: This test might take longer as it needs to download the model
    transcription = audio_tool.transcribe(sample_audio)
    assert isinstance(transcription, str)
    # Since we're using a sine wave, the transcription might be empty or noise
    # We just check that the method runs without errors 