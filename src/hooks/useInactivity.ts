import { useEffect, useRef } from 'react';

interface UseInactivityProps {
  thresholdMinutes: number;
  isActive: boolean;
  onInactive: () => void;
}

export function useInactivity({ thresholdMinutes, isActive, onInactive }: UseInactivityProps) {
  const timeoutRef = useRef<number | null>(null);

  const resetTimer = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    if (isActive) {
      timeoutRef.current = window.setTimeout(() => {
        onInactive();
      }, thresholdMinutes * 60 * 1000);
    }
  };

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      return;
    }

    const events = ['mousemove', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => resetTimer();

    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [isActive, thresholdMinutes]);
}
