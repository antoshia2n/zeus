import { useCallback, useEffect, useState } from "react";
import {
  listEntries,
  addEntry,
  updateEntry,
  deleteEntry,
} from "../lib/zeus.js";

export function useEntries(uid, { enabled = true, source = null } = {}) {
  const [entries, setEntries]     = useState([]);
  const [ready, setReady]         = useState(false);
  const [loading, setLoading]     = useState(false);

  const reload = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const { data } = await listEntries(uid, { source });
    setEntries(data);
    setReady(true);
    setLoading(false);
  }, [uid, source]);

  useEffect(() => {
    if (!uid || !enabled) return;
    reload();
  }, [uid, enabled, reload]);

  const create = useCallback(
    async (payload) => {
      if (!uid) return { data: null, error: new Error("no uid") };
      const { data, error } = await addEntry(uid, payload);
      if (!error && data) setEntries((prev) => [data, ...prev]);
      return { data, error };
    },
    [uid]
  );

  const update = useCallback(async (id, patch, opts) => {
    const { data, error } = await updateEntry(id, patch, opts);
    if (!error && data) {
      setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
    }
    return { data, error };
  }, []);

  const remove = useCallback(async (id) => {
    const { error } = await deleteEntry(id);
    if (!error) setEntries((prev) => prev.filter((e) => e.id !== id));
    return { error };
  }, []);

  return { entries, ready, loading, reload, create, update, remove };
}
