import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../lib/auth';

export interface DRCIPEvent {
  event: string;
  version: number;
  timestamp: string;
  data: Record<string, unknown>;
}

interface WSRequest {
  url?: string;
  headers: { host?: string };
  wsPayload?: { sub: string; role: string };
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<AuthenticatedWebSocket> = new Set();
  private static instance: WebSocketService;

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
      verifyClient: this.verifyClient.bind(this),
    });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  private async verifyClient(info: { req: WSRequest }, callback: (res: boolean, code?: number, message?: string) => void): Promise<void> {
    try {
      const url = new URL(info.req.url || '', `http://${info.req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');

      if (!token) {
        callback(false, 4001, 'Authentication required');
        return;
      }

      const payload = await verifyToken(token);
      if (!payload) {
        callback(false, 4001, 'Invalid or expired token');
        return;
      }

      info.req.wsPayload = { sub: payload.sub, role: payload.role };
      callback(true);
    } catch {
      callback(false, 4001, 'Invalid or expired token');
    }
  }

  private handleConnection(ws: AuthenticatedWebSocket, req: WSRequest): void {
    if (req.wsPayload) {
      ws.userId = req.wsPayload.sub;
      ws.userRole = req.wsPayload.role;
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws as AuthenticatedWebSocket));
    }
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

  publishAssignmentCreated(assignmentId: string, incidentId: string) {
    this.broadcast({
      event: 'assignment.created',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { assignment_id: assignmentId, incident_id: incidentId },
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

  publishIncidentResolved(incidentId: string, publicId: string) {
    this.broadcast({
      event: 'incident.resolved',
      version: 1,
      timestamp: new Date().toISOString(),
      data: { incident_id: incidentId, public_id: publicId },
    });
  }
}