"use client";

import { useEffect, useState } from "react";
import { getSession, type StoredSession } from "./auth";

export type SessionState = {
  session: StoredSession | null;
  /**
   * False until the stored session has been read in the browser. Callers must
   * wait for this before deciding that someone is signed out or lacks a role.
   */
  ready: boolean;
};

/**
 * Reads the stored session after mount.
 *
 * The session lives in browser storage, which is unavailable while a client
 * component is pre-rendered on the server. Reading it during render therefore
 * yields null in the pre-rendered HTML, and because that read is not state,
 * nothing re-renders once the real session is available. Pages that did this
 * showed their signed-out or missing-permission branch permanently after a full
 * page load. Reading it in an effect gives the component a state update to react
 * to, and `ready` lets callers hold back that branch until the answer is known.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  return { session, ready };
}
