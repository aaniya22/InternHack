import { useCallback, useState } from "react";

export interface GrantCollection {
  id: string;
  name: string;
  favorite: boolean;
  createdAt: number;
}

interface CollectionsState {
  collections: GrantCollection[];
  itemsByCollection: Record<string, number[]>;
}

const STORAGE_KEY = "grantCollections";
const LEGACY_KEY = "savedGrants";
const DEFAULT_COLLECTION_ID = "default";

function loadState(): CollectionsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as CollectionsState;
  } catch {
    /* fall through to migration */
  }

  // Migrate legacy flat "savedGrants" set into a default collection
  let legacyIds: number[] = [];
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) legacyIds = JSON.parse(legacy) as number[];
  } catch {
    legacyIds = [];
  }

  const migrated: CollectionsState = {
    collections: [
      {
        id: DEFAULT_COLLECTION_ID,
        name: "Saved",
        favorite: true,
        createdAt: Date.now(),
      },
    ],
    itemsByCollection: { [DEFAULT_COLLECTION_ID]: legacyIds },
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch {
    /* ignore write failures (e.g. private mode) */
  }

  return migrated;
}

function persist(state: CollectionsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore write failures */
  }
}

export function useGrantCollections() {
  const [state, setState] = useState<CollectionsState>(loadState);

  const createCollection = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => {
      const id = `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const next: CollectionsState = {
        collections: [
          ...prev.collections,
          { id, name: trimmed, favorite: false, createdAt: Date.now() },
        ],
        itemsByCollection: { ...prev.itemsByCollection, [id]: [] },
      };
      persist(next);
      return next;
    });
  }, []);

  const renameCollection = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((prev) => {
      const next: CollectionsState = {
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === id ? { ...c, name: trimmed } : c,
        ),
      };
      persist(next);
      return next;
    });
  }, []);

  const deleteCollection = useCallback((id: string) => {
    if (id === DEFAULT_COLLECTION_ID) return; // keep at least one collection
    setState((prev) => {
      const { [id]: _removed, ...restItems } = prev.itemsByCollection;
      const next: CollectionsState = {
        collections: prev.collections.filter((c) => c.id !== id),
        itemsByCollection: restItems,
      };
      persist(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setState((prev) => {
      const next: CollectionsState = {
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === id ? { ...c, favorite: !c.favorite } : c,
        ),
      };
      persist(next);
      return next;
    });
  }, []);

  // Moves a grant into `toCollectionId`, removing it from every other collection
  const moveOpportunity = useCallback(
    (grantId: number, toCollectionId: string) => {
      setState((prev) => {
        const itemsByCollection: Record<string, number[]> = {};
        for (const [colId, ids] of Object.entries(prev.itemsByCollection)) {
          itemsByCollection[colId] = ids.filter((gid) => gid !== grantId);
        }
        itemsByCollection[toCollectionId] = [
          ...(itemsByCollection[toCollectionId] ?? []),
          grantId,
        ];
        const next: CollectionsState = { ...prev, itemsByCollection };
        persist(next);
        return next;
      });
    },
    [],
  );
  const toggleItemInCollection = useCallback(
    (grantId: number, collectionId: string) => {
      setState((prev) => {
        const current = prev.itemsByCollection[collectionId] ?? [];
        const has = current.includes(grantId);
        const next: CollectionsState = {
          ...prev,
          itemsByCollection: {
            ...prev.itemsByCollection,
            [collectionId]: has
              ? current.filter((gid) => gid !== grantId)
              : [...current, grantId],
          },
        };
        persist(next);
        return next;
      });
    },
    [],
  );
  const removeFromCollection = useCallback(
    (grantId: number, collectionId: string) => {
      setState((prev) => {
        const next: CollectionsState = {
          ...prev,
          itemsByCollection: {
            ...prev.itemsByCollection,
            [collectionId]: (prev.itemsByCollection[collectionId] ?? []).filter(
              (gid) => gid !== grantId,
            ),
          },
        };
        persist(next);
        return next;
      });
    },
    [],
  );

  const searchCollections = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return state.collections;
      return state.collections.filter((c) => c.name.toLowerCase().includes(q));
    },
    [state.collections],
  );

  const collectionIdsForGrant = useCallback(
    (grantId: number) =>
      Object.entries(state.itemsByCollection)
        .filter(([, ids]) => ids.includes(grantId))
        .map(([id]) => id),
    [state.itemsByCollection],
  );

  return {
    collections: state.collections,
    itemsByCollection: state.itemsByCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    toggleFavorite,
    moveOpportunity,
    toggleItemInCollection,
    removeFromCollection,
    searchCollections,
    collectionIdsForGrant,
    DEFAULT_COLLECTION_ID,
  };
}
