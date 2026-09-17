import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  nextPromptState, shouldPrompt, type PromptEvent, type PromptState,
} from '../services/reviewPrompt';

const KEY = 'pi.sharePrompt.v1';

// Counts river views and decides when the subject comes up. AsyncStorage
// rather than SecureStore: this is a counter, not a secret, and a failure to
// read it must never stop a screen from rendering.
async function load(): Promise<PromptState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PromptState) : null;
  } catch {
    return null;
  }
}

async function save(state: PromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Losing the counter costs at worst one extra ask, a month apart.
  }
}

export function useSharePrompt(countThisView: boolean) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!countThisView) return;
    let cancelled = false;

    (async () => {
      const state = nextPromptState(await load(), 'viewed');
      await save(state);
      // Shown one render after the screen has its data, so the reader sees
      // what they came for before anything is asked of them.
      if (!cancelled && shouldPrompt(state)) setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [countThisView]);

  const record = useCallback(async (event: PromptEvent) => {
    setVisible(false);
    await save(nextPromptState(await load(), event));
  }, []);

  return {
    visible,
    onActed: () => record('acted'),
    onDismiss: () => record('dismissed'),
  };
}
