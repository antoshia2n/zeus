import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

/**
 * Firebase ID トークンを取得する
 * shia2n-core が export する `auth`（Firebase Auth インスタンス）を利用
 */
export function useIdToken() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    // shia2n-core から auth を直接 import
    let unsubscribe = null;
    let intervalId  = null;

    import("shia2n-core").then(({ auth }) => {
      if (!auth) return;
      unsubscribe = auth.onAuthStateChanged(async (user) => {
        // 既存のインターバルをクリア
        if (intervalId) clearInterval(intervalId);
        if (!user) { setToken(null); return; }

        const t = await user.getIdToken();
        setToken(t);

        // ID token は1時間で期限切れ → 50分ごとに強制リフレッシュ
        intervalId = setInterval(async () => {
          const fresh = await user.getIdToken(true);
          setToken(fresh);
        }, 50 * 60 * 1000);
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (intervalId)  clearInterval(intervalId);
    };
  }, []);

  return token;
}

/**
 * プロジェクトツリーを取得
 */
export function useProjectTree(uid, token) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!uid || !token) return;
    setLoading(true);
    try {
      const res = await api.projects.tree({ user_id: uid }, token);
      setTree(res.tree || []);
    } catch (e) {
      console.error("useProjectTree", e);
    } finally {
      setLoading(false);
    }
  }, [uid, token]);

  useEffect(() => { reload(); }, [reload]);

  return { tree, loading, reload };
}

/**
 * アイテム一覧（プロジェクト or フォルダ指定）
 */
export function useItems(uid, token, { projectId, folderId, itemType } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!uid || !token) return;
    setLoading(true);
    try {
      const params = { user_id: uid };
      if (projectId)  params.project_id = projectId;
      if (folderId)   params.folder_id  = folderId;
      if (itemType)   params.item_type  = itemType;
      const res = await api.items.list(params, token);
      setItems(res.items || []);
    } catch (e) {
      console.error("useItems", e);
    } finally {
      setLoading(false);
    }
  }, [uid, token, projectId, folderId, itemType]);

  useEffect(() => { reload(); }, [reload]);

  return { items, setItems, loading, reload };
}

/**
 * フォルダツリーを取得
 */
export function useFolderTree(uid, token) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!uid || !token) return;
    setLoading(true);
    try {
      const res = await api.folders.tree({ user_id: uid }, token);
      setTree(res.tree || []);
    } catch (e) {
      console.error("useFolderTree", e);
    } finally {
      setLoading(false);
    }
  }, [uid, token]);

  useEffect(() => { reload(); }, [reload]);

  return { tree, loading, reload };
}
