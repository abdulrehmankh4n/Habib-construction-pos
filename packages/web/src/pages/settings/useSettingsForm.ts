import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AppSettings } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';

export function useSettingsForm<K extends keyof AppSettings>(settings: AppSettings | undefined, section: K) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AppSettings[K] | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings[section]);
  }, [settings, section]);

  const save = useMutation({
    mutationFn: (value: AppSettings[K]) => api.put<AppSettings>('/settings', { [section]: value }),
    onSuccess: (updated) => {
      toast.success('Settings saved');
      qc.setQueryData(['settings'], updated);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = <F extends keyof AppSettings[K]>(field: F, value: AppSettings[K][F]) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d));

  return { draft, set, save, dirty: !!draft && !!settings && JSON.stringify(draft) !== JSON.stringify(settings[section]) };
}
