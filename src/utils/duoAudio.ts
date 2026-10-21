// Web Audio API sound synthesizer for authentic Duolingo tactile feedback

export type DuoSoundType = 'correct' | 'wrong' | 'click' | 'complete' | 'chest' | 'pair_match' | 'pair_error' | 'pop';

const AUDIO_MUTE_STORAGE_KEY = 'duo_audio_muted';
const USER_PROGRESS_STORAGE_KEY = 'psychomaster_user_progress_v1';

let audioCtx: AudioContext | null = null;
let playedSoundCount = 0;
let lastPlayedSoundType: DuoSoundType | null = null;

function readInitialMuteState(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const progressRaw = window.localStorage.getItem(USER_PROGRESS_STORAGE_KEY);
      if (progressRaw) {
        const parsed = JSON.parse(progressRaw);
        if (typeof parsed?.customSettings?.soundEnabled === 'boolean') {
          const mutedFromSettings = !parsed.customSettings.soundEnabled;
          window.localStorage.setItem(AUDIO_MUTE_STORAGE_KEY, String(mutedFromSettings));
          return mutedFromSettings;
        }
      }
      const saved = window.localStorage.getItem(AUDIO_MUTE_STORAGE_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    }
  } catch {
    // ignore storage errors
  }
  return false;
}

let isMuted: boolean = readInitialMuteState();

export const getAudioMuted = (): boolean => isMuted;

export const isSoundEnabled = (): boolean => !isMuted;

export const setAudioMuted = (muted: boolean, options?: { skipProgressSync?: boolean }): void => {
  isMuted = Boolean(muted);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AUDIO_MUTE_STORAGE_KEY, String(isMuted));
      if (!options?.skipProgressSync) {
        const progressRaw = window.localStorage.getItem(USER_PROGRESS_STORAGE_KEY);
        if (progressRaw) {
          const parsed = JSON.parse(progressRaw);
          if (parsed && typeof parsed === 'object') {
            parsed.customSettings = {
              ...(parsed.customSettings || {}),
              soundEnabled: !isMuted,
            };
            window.localStorage.setItem(USER_PROGRESS_STORAGE_KEY, JSON.stringify(parsed));
          }
        }
      }
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('psychomaster:audio-mute-changed', {
          detail: { muted: isMuted, soundEnabled: !isMuted },
        })
      );
    }
  } catch {
    // ignore storage errors
  }
};

export const setSoundEnabled = (enabled: boolean, options?: { skipProgressSync?: boolean }): void => {
  setAudioMuted(!enabled, options);
};

export const toggleAudioMuted = (): boolean => {
  const next = !isMuted;
  setAudioMuted(next);
  if (!next) {
    playDuoSound('click');
  }
  return next;
};

export const syncAudioStateFromStorage = (): boolean => {
  isMuted = readInitialMuteState();
  return isMuted;
};

export const getAudioPlaybackStats = (): {
  isMuted: boolean;
  soundEnabled: boolean;
  playedSoundCount: number;
  lastPlayedSoundType: DuoSoundType | null;
} => ({
  isMuted,
  soundEnabled: !isMuted,
  playedSoundCount,
  lastPlayedSoundType,
});

export const resetAudioPlaybackStats = (): void => {
  playedSoundCount = 0;
  lastPlayedSoundType = null;
};

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (isMuted) return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const playDuoSound = (type: DuoSoundType): boolean => {
  if (isMuted) return false;
  playedSoundCount += 1;
  lastPlayedSoundType = type;
  try {
    const ctx = getAudioContext();
    if (!ctx) return true;

    const now = ctx.currentTime;

    if (type === 'pair_match') {
      // Pleasant bright ding when two matching cards pair up! (G5 -> C6)
      [783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.15, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.22);
      });
      return true;
    }

    if (type === 'pair_error') {
      // Small wobble thud on mismatch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(120, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
      return true;
    }

    if (type === 'pop') {
      // Bubble token placement pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.05);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
      return true;
    }

    if (type === 'correct') {
      // Signature Duolingo cheerful bright ascending chime (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.28);
      });
    } else if (type === 'wrong') {
      // Duolingo gentle low boing/error thud (two descending soft notes)
      const notes = [220, 164.81];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.16, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.38);
      });
    } else if (type === 'click') {
      // Tactile button tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'complete' || type === 'chest') {
      // Triumphant lesson completion fanfare (Arpeggio + rich chord)
      const arpeggio = [440, 554.37, 659.25, 880, 1108.73];
      arpeggio.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0.18, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.45);
      });
    }
  } catch {
    // Non-blocking fallback if audio context blocked by browser
  }
  return true;
};
