import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LiveEvent } from '@pos/shared';

export type LiveStatus = 'connecting' | 'live' | 'offline';

export function useLiveSync(enabled: boolean): LiveStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const pending = new Set<string>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      for (const topic of pending) qc.invalidateQueries({ queryKey: [topic] });
      pending.clear();
    };

    const connect = () => {
      if (closed) return;
      setStatus('connecting');
      source = new EventSource('/api/events');
      source.onopen = () => setStatus('live');
      source.addEventListener('change', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as LiveEvent;
          data.topics.forEach((t) => pending.add(t));
          clearTimeout(flushTimer);
          flushTimer = setTimeout(flush, 150);
        } catch {
          return;
        }
      });
      source.onerror = () => {
        setStatus('offline');
        source?.close();
        retryTimer = setTimeout(connect, 4000);
      };
    };
    connect();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && source?.readyState !== EventSource.OPEN) {
        clearTimeout(retryTimer);
        source?.close();
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, qc]);

  return status;
}
