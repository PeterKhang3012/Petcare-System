import { useCallback, useEffect, useState } from 'react';

export function useLoad<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<{ loader: typeof loader; revision: number; data?: T; error?: unknown }>();
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    loader().then(
      data => { if (active) setState({ loader, revision, data }); },
      error => { if (active) setState({ loader, revision, error }); },
    );
    return () => { active = false; };
  }, [loader, revision]);
  const current = state?.loader === loader && state.revision === revision ? state : undefined;
  return { data: current?.data, error: current?.error, loading: !current, reload };
}
