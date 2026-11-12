import { useState, useEffect, useCallback, useRef } from "react";
import { listDocuments, listDocumentsConditional } from "../services/api";
import {
  DEFAULT_CACHE_TTL_MS,
  readSessionCache,
  writeSessionCache,
} from "../utils/sessionCache";

const DOCUMENTS_CACHE_KEY = "documents";

export function useDocumentsData() {
  const cachedData = readSessionCache(DOCUMENTS_CACHE_KEY);
  const cacheRef = useRef(cachedData);

  const [documents, setDocuments] = useState(() => cachedData?.documents || []);
  const [loading, setLoading] = useState(() => !cachedData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const syncFetchedData = useCallback((docs) => {
    const payload = { documents: docs };
    cacheRef.current = { ...payload, cachedAt: Date.now() };
    writeSessionCache(DOCUMENTS_CACHE_KEY, payload);
    setDocuments(docs);
    setError(null);
  }, []);

  const fetchData = useCallback(
    async ({ force = false, background = true } = {}) => {
      const cached = cacheRef.current ?? readSessionCache(DOCUMENTS_CACHE_KEY);
      const isFreshCache =
        cached && Date.now() - cached.cachedAt <= DEFAULT_CACHE_TTL_MS;

      if (cached && isFreshCache && !force) {
        cacheRef.current = cached;
        setDocuments(cached.documents || []);
        setError(null);
        return;
      }

      const shouldBlock = !background;
      if (shouldBlock) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        if (force) {
          const docs = await listDocuments();
          syncFetchedData(docs);
          return;
        }

        const docsRes = await listDocumentsConditional();

        const docs = docsRes.notModified
          ? cached?.documents || documents
          : docsRes.documents || [];

        syncFetchedData(docs);
      } catch (err) {
        console.error(err);
        setError("Could not load data. Is the backend running?");
      } finally {
        if (shouldBlock) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [syncFetchedData, documents],
  );

  useEffect(() => {
    const cached = cacheRef.current ?? readSessionCache(DOCUMENTS_CACHE_KEY);
    if (cached) {
      cacheRef.current = cached;
      setDocuments(cached.documents || []);
      setLoading(false);

      const isStale = Date.now() - cached.cachedAt > DEFAULT_CACHE_TTL_MS;
      if (isStale) {
        void fetchData({ background: true });
      }
      return;
    }

    void fetchData({ background: false });
  }, [fetchData]);

  const refresh = useCallback(
    (options = {}) => {
      const cached = cacheRef.current ?? readSessionCache(DOCUMENTS_CACHE_KEY);
      void fetchData({
        force: Boolean(options.force),
        background:
          options.background !== undefined
            ? options.background
            : Boolean(cached),
      });
    },
    [fetchData],
  );

  return { documents, loading, refreshing, error, refresh };
}
