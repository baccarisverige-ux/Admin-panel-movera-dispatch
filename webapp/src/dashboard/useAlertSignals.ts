import { useEffect, useRef, useState } from "react";

/** Plays a short tone and shows a browser notification when a new urgent item appears. */

const MUTE_KEY = "movera-admin-alert-sound";

/** The bell's sound switch, shared by every part of the panel that plays a sound. */
export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return false;
  }
}

/** True once the person has clicked or typed on the page: before that a browser refuses to start sound. */
function hadGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : gestureSeen;
}

let gestureSeen = false;
if (typeof document !== "undefined") {
  const seen = () => { gestureSeen = true; };
  document.addEventListener("pointerdown", seen, { once: true, capture: true });
  document.addEventListener("keydown", seen, { once: true, capture: true });
}

function playOn(context: AudioContext, urgent: boolean) {
  const start = context.currentTime;
  const notes = urgent ? [880, 660, 880] : [660];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + index * 0.22);
    gain.gain.exponentialRampToValueAtTime(0.18, start + index * 0.22 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.22 + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + index * 0.22);
    oscillator.stop(start + index * 0.22 + 0.21);
  });
  window.setTimeout(() => void context.close(), 1200);
}

/**
 * A short tone made with Web Audio. The audio context is only made after the person has clicked or typed
 * (UI-16): made earlier, the browser refuses it and logs "AudioContext was not allowed to start". With
 * waitForClick, a tone asked for before that plays on the first click instead of not at all.
 */
export function tone(urgent: boolean, waitForClick = false) {
  if (typeof window === "undefined") return;
  const AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
  if (!AudioContext) return;
  const start = () => {
    try {
      const context = new AudioContext();
      if (context.state === "suspended") void context.resume().then(() => playOn(context, urgent), () => void context.close());
      else playOn(context, urgent);
    } catch {
      // Sound is a convenience; the on-screen alert stays either way.
    }
  };
  if (hadGesture()) {
    start();
    return;
  }
  if (!waitForClick) return;
  const resume = () => {
    document.removeEventListener("pointerdown", resume);
    document.removeEventListener("keydown", resume);
    start();
  };
  document.addEventListener("pointerdown", resume, { once: true });
  document.addEventListener("keydown", resume, { once: true });
}

export type Signal = { id: string; title: string; body: string; urgent: boolean; sound?: boolean; notify?: boolean };

export function useAlertSignals(signals: Signal[], ready: boolean) {
  const [muted, setMuted] = useState(readMuted);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);

  useEffect(() => {
    if (!ready) return;
    // The first load only remembers what is already there; later loads announce what is new.
    if (seen.current === null) {
      seen.current = new Set(signals.map((signal) => signal.id));
      return;
    }
    const added = signals.filter((signal) => !seen.current!.has(signal.id));
    for (const signal of added) seen.current.add(signal.id);
    if (!added.length) return;
    setFresh(added.map((signal) => signal.id));
    window.setTimeout(() => setFresh([]), 6000);
    const loud = added.filter((signal) => signal.sound !== false);
    if (!muted && loud.length) tone(loud.some((signal) => signal.urgent));
    if (permission === "granted" && document.visibilityState !== "visible") {
      for (const signal of added.filter((signal) => signal.notify !== false).slice(0, 3)) {
        try {
          new Notification(signal.title, { body: signal.body, tag: signal.id });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    }
  }, [signals, ready, muted, permission]);

  return {
    muted,
    fresh,
    permission,
    toggleMute() {
      setMuted((value) => {
        try {
          localStorage.setItem(MUTE_KEY, value ? "on" : "off");
        } catch {
          // Remembering the choice is optional.
        }
        return !value;
      });
    },
    async askPermission() {
      if (typeof Notification === "undefined") return;
      setPermission(await Notification.requestPermission());
    },
  };
}
