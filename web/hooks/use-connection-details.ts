import { useCallback, useEffect, useState } from 'react';
import { decodeJwt } from 'jose';
import { ConnectionDetails } from '@/app/api/connection-details/route';
import { AppConfig } from '@/lib/types';

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

export default function useConnectionDetails(appConfig: AppConfig) {
  // Generate room connection details, including:
  //   - A random Room name
  //   - A random Participant name
  //   - An Access Token to permit the participant to join the room
  //   - The URL of the LiveKit server to connect to
  //
  // In real-world application, you would likely allow the user to specify their
  // own participant name, and possibly to choose from existing rooms to join.

  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  // Distinguishes "token hasn't arrived yet" (connectionDetails null, no error →
  // show connecting) from "the fetch actually failed" (error set → show error).
  const [connectionError, setConnectionError] = useState<Error | null>(null);

  const fetchConnectionDetails = useCallback(async () => {
    setConnectionDetails(null);
    setConnectionError(null);
    // For cross-origin embeds, the standalone bundle records the origin it was
    // served from (the LiveKit app) so token requests reach the API rather than
    // the host site. Falls back to the current origin for same-origin usage.
    const apiBase =
      (typeof window !== 'undefined' &&
        (window as Window & { __lkApiBase?: string }).__lkApiBase) ||
      window.location.origin;
    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details',
      apiBase
    );

    let data: ConnectionDetails;
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sandbox-Id': appConfig.sandboxId ?? '',
        },
        body: JSON.stringify({
          room_config: appConfig.agentName
            ? {
                agents: [{ agent_name: appConfig.agentName }],
              }
            : undefined,
          // Per-site config forwarded to the agent worker (dispatch metadata).
          template: appConfig.template,
          site_id: appConfig.sandboxId,
        }),
      });
      data = await res.json();
    } catch (error) {
      console.error('Error fetching connection details:', error);
      const err = new Error('Error fetching connection details!');
      setConnectionError(err);
      throw err;
    }

    setConnectionDetails(data);
    return data;
  }, []);

  useEffect(() => {
    fetchConnectionDetails();
  }, [fetchConnectionDetails]);

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) {
      return true;
    }

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) {
      return true;
    }
    const expiresAt = new Date(jwtPayload.exp - ONE_MINUTE_IN_MILLISECONDS);

    const now = new Date();
    return expiresAt >= now;
  }, [connectionDetails?.participantToken]);

  const existingOrRefreshConnectionDetails = useCallback(async () => {
    if (isConnectionDetailsExpired() || !connectionDetails) {
      return fetchConnectionDetails();
    } else {
      return connectionDetails;
    }
  }, [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]);

  return {
    connectionDetails,
    connectionError,
    refreshConnectionDetails: fetchConnectionDetails,
    existingOrRefreshConnectionDetails,
  };
}
