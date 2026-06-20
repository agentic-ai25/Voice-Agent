import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

// CORS: the widget runs on third-party sites, so the token request is cross-origin.
// No cookies/credentials are used, so a wildcard origin is safe here.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sandbox-Id',
  'Access-Control-Max-Age': '86400',
  // Private Network Access: when the widget runs on a public HTTPS site (e.g.
  // salesforce.com) and this API is on localhost, Chrome sends a PNA preflight
  // and blocks the request unless the local server opts in with this header.
  'Access-Control-Allow-Private-Network': 'true',
};

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    // Parse agent configuration from request body
    const body = await req.json();
    const agentName: string = body?.room_config?.agents?.[0]?.agent_name;
    // Per-site config the widget requested: which prompt template the agent
    // should use and which page index to navigate against. Forwarded to the
    // agent worker via agent dispatch metadata.
    const template: string | undefined = body?.template ?? undefined;
    const siteId: string | undefined = body?.site_id ?? undefined;
    // Persistent per-browser id, forwarded so the agent can attribute the session
    // to a unique user in analytics.
    const visitorId: string | undefined = body?.visitor_id ?? undefined;
    const agentMetadata =
      template || siteId || visitorId
        ? JSON.stringify({ template, site_id: siteId, visitor_id: visitorId })
        : undefined;

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      agentName,
      agentMetadata
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500, headers: CORS_HEADERS });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName?: string,
  agentMetadata?: string
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (agentName) {
    at.roomConfig = new RoomConfiguration({
      // metadata is read by the agent worker (ctx.job.metadata) to pick the
      // per-site prompt template and page index.
      agents: [agentMetadata ? { agentName, metadata: agentMetadata } : { agentName }],
    });
  }

  return at.toJwt();
}
