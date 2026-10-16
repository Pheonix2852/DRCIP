import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../lib/auth';
import prisma from '../lib/prisma';

export interface DRCIPEvent {
  event: string;
  version: number;
  timestamp: string;
  data: Record<string, unknown>;
}

interface AuthMessage {
  type: 'auth';
  token: string;
}

type WSMessages = AuthMessage;

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<AuthenticatedWebSocket> = new Set();
  private static instance: WebSocketService;

  private readonly AUTH_TIMEOUT_MS = 5000;
  private readonly CLOSE_CODE_AUTH_REQUIRED = 4001;

  static getInstance(server?: HttpServer): WebSocketService {
    if (!WebSocketService.instance) {
      if (!server) throw new Error('WebSocketService not initialized');
      WebSocketService.instance = new WebSocketService(server);
    }
    return WebSocketService.instance;
  }

  private constructor(server: HttpServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  private async handleConnection(ws: AuthenticatedWebSocket, _req: { url?: string; headers: { host?: string } }): Promise<void> {
    let authed = false;

    const authTimeout = setTimeout(() => {
      if (!authed) {
        ws.close(this.CLOSE_CODE_AUTH_REQUIRED, 'Authentication required');
      }
    }, this.AUTH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(authTimeout);
      this.clients.delete(ws);
    };

    ws.on('close', cleanup);

    ws.on('message', async (raw: Buffer) => {
      if (authed) {
        // Ignore subsequent messages (server only broadcasts)
        return;
      }

      try {
        const parsed = JSON.parse(raw.toString());
        const msg = parsed as WSMessages;

        if (!msg || msg.type !== 'auth' || typeof msg.token !== 'string') {
          ws.close(this.CLOSE_CODE_AUTH_REQUIRED, 'Invalid auth message');
          return;
        }

        const payload = await verifyToken(msg.token);
        if (!payload) {
          ws.close(this.CLOSE_CODE_AUTH_REQUIRED, 'Invalid or expired token');
          return;
        }

        const session = await prisma.session.findUnique({ where: { publicId: payload.jti } });
        if (!session || session.revokedAt || session.expiresAt < new Date()) {
          ws.close(this.CLOSE_CODE_AUTH_REQUIRED, 'Session revoked or expired');
          return;
        }

        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || !user.isActive) {
          ws.close(this.CLOSE_CODE_AUTH_REQUIRED, 'Account not found or inactive');
          return;
        }

        clearTimeout(authTimeout);
        authed = true;
        ws.userId = user.id;
        ws.userRole = user.role;
        this.clients.add(ws);
      } catch {
        ws.close(this.CLOSE_CODE_AUTH_REQUIRED, 'Invalid auth message');
      }
    });
  }

  broadcast(event: DRCIPEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  sendToUser(userId: string, event: DRCIPEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN && client.userId === userId) {
        client.send(payload);
      }
    }
  }

  publishIncidentCreated(incidentId: string, publicId: string) {
    this.broadcast({
      event: 'incident.created',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { incident_id: incidentId, public_id: publicId },
    });
  }

  publishIncidentUpdated(incidentId: string, publicId: string, status: string) {
    this.broadcast({
      event: 'incident.updated',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { incident_id: incidentId, public_id: publicId, status },
    });
  }

  publishResourceUpdated(resourceId: string, publicId: string, status: string) {
    this.broadcast({
      event: 'resource.updated',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { resource_id: resourceId, public_id: publicId, status },
    });
  }

  publishAssignmentCreated(assignmentPublicId: string, incidentPublicId: string) {
    this.broadcast({
      event: 'assignment.created',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { assignment_id: assignmentPublicId, incident_id: incidentPublicId },
    });
  }

  publishAssignmentUpdated(assignmentPublicId: string, incidentPublicId: string, status: string) {
    this.broadcast({
      event: 'assignment.updated',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { assignment_id: assignmentPublicId, incident_id: incidentPublicId, status },
    });
  }

  publishRecommendationReady(incidentId: string, recommendationId: string) {
    this.broadcast({
      event: 'recommendation.ready',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { incident_id: incidentId, recommendation_id: recommendationId },
    });
  }

  publishTeamUpdated(teamId: string, publicId: string, status: string) {
    this.broadcast({
      event: 'team.updated',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { team_id: teamId, public_id: publicId, status },
    });
  }

  // Recipient-scoped: sent only to the intended notification recipient's socket.
  publishNotificationCreated(recipientUserId: string, publicId: string, notificationType: string) {
    this.sendToUser(recipientUserId, {
      event: 'notification.created',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { notification_id: publicId, notification_type: notificationType },
    });
  }
}