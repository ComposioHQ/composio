from plugins.audio_processor import AudioProcessor

def main():
    # Initialize the audio processor
    processor = AudioProcessor(sample_rate=44100)
    
    # Load an audio file
    audio_data, _ = processor.load_audio('input.wav')
    
    # Get audio features
    features = processor.get_audio_features(audio_data)
    print("Audio features:", features)
    
    # Apply some effects
    effects = {
        'gain': 1.5,  # Increase volume by 50%
        'reverb': 0.3,  # Add some reverb
        'pitch_shift': 2.0  # Shift pitch up by 2 semitones
    }
    
    processed_audio = processor.apply_effects(audio_data, effects)
    
    # Save the processed audio
    processor.save_audio('output.wav', processed_audio)
    
if __name__ == '__main__':
    main() 