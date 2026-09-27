// Shared domain types for DRCIP

export const ROLES = {
  CITIZEN: 'CITIZEN',
  FIELD_OFFICER: 'FIELD_OFFICER',
  DISASTER_COORDINATOR: 'DISASTER_COORDINATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const DISASTER_TYPES = {
  FLOOD: 'FLOOD',
  CYCLONE: 'CYCLONE',
  FIRE: 'FIRE',
  EARTHQUAKE: 'EARTHQUAKE',
  BUILDING_COLLAPSE: 'BUILDING_COLLAPSE',
  MEDICAL_EMERGENCY: 'MEDICAL_EMERGENCY',
  ROAD_BLOCKAGE: 'ROAD_BLOCKAGE',
  LANDSLIDE: 'LANDSLIDE',
} as const;

export type DisasterType = (typeof DISASTER_TYPES)[keyof typeof DISASTER_TYPES];

export const SEVERITY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[keyof typeof SEVERITY_LEVELS];

export const INCIDENT_STATUSES = {
  REPORTED: 'REPORTED',
  TRIAGE_PENDING: 'TRIAGE_PENDING',
  IN_RESPONSE: 'IN_RESPONSE',
  RESOLVED: 'RESOLVED',
} as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[keyof typeof INCIDENT_STATUSES];

export const RESOURCE_TYPES = {
  AMBULANCE: 'AMBULANCE',
  RESCUE_TEAM: 'RESCUE_TEAM',
  FOOD: 'FOOD',
  MEDICAL_KIT: 'MEDICAL_KIT',
  VEHICLE: 'VEHICLE',
  RELIEF_TRUCK: 'RELIEF_TRUCK',
  SHELTER: 'SHELTER',
  VOLUNTEER: 'VOLUNTEER',
  PERSONNEL: 'PERSONNEL',
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

export const RESOURCE_STATUSES = {
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  DEPLOYED: 'DEPLOYED',
  UNAVAILABLE: 'UNAVAILABLE',
  MAINTENANCE: 'MAINTENANCE',
} as const;

export type ResourceStatus = (typeof RESOURCE_STATUSES)[keyof typeof RESOURCE_STATUSES];

export const TEAM_STATUSES = {
  ACTIVE: 'ACTIVE',
  DEPLOYED: 'DEPLOYED',
  UNAVAILABLE: 'UNAVAILABLE',
  MAINTENANCE: 'MAINTENANCE',
} as const;

export type TeamStatus = (typeof TEAM_STATUSES)[keyof typeof TEAM_STATUSES];

export const SHELTER_STATUSES = {
  AVAILABLE: 'AVAILABLE',
  FULL: 'FULL',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type ShelterStatus = (typeof SHELTER_STATUSES)[keyof typeof SHELTER_STATUSES];

export const ASSIGNMENT_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[keyof typeof ASSIGNMENT_STATUSES];

export const ASSIGNMENT_EVENT_TYPES = {
  CREATED: 'CREATED',
  APPROVED: 'APPROVED',
  MODIFIED: 'MODIFIED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  BLOCKED: 'BLOCKED',
} as const;

export type AssignmentEventType = (typeof ASSIGNMENT_EVENT_TYPES)[keyof typeof ASSIGNMENT_EVENT_TYPES];

export const RECOMMENDATION_DECISIONS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  MODIFIED: 'MODIFIED',
  REJECTED: 'REJECTED',
} as const;

export type RecommendationDecision = (typeof RECOMMENDATION_DECISIONS)[keyof typeof RECOMMENDATION_DECISIONS];

export const PREDICTION_STATUSES = {
  SUCCESS: 'SUCCESS',
  UNAVAILABLE: 'UNAVAILABLE',
  ERROR: 'ERROR',
} as const;

export type PredictionStatus = (typeof PREDICTION_STATUSES)[keyof typeof PREDICTION_STATUSES];

export const NOTIFICATION_CHANNELS = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

export const NOTIFICATION_DELIVERY_STATUSES = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[keyof typeof NOTIFICATION_DELIVERY_STATUSES];

export const NOTIFICATION_TYPES = {
  INCIDENT_ESCALATION: 'INCIDENT_ESCALATION',
  INCIDENT_STATUS_UPDATE: 'INCIDENT_STATUS_UPDATE',
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  ASSIGNMENT_STATUS_UPDATE: 'ASSIGNMENT_STATUS_UPDATE',
  EMERGENCY_BROADCAST: 'EMERGENCY_BROADCAST',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_PRIORITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[keyof typeof NOTIFICATION_PRIORITIES];

export const RECIPIENT_SCOPES = {
  ALL: 'ALL',
  FIELD_OFFICERS: 'FIELD_OFFICERS',
  COORDINATORS: 'COORDINATORS',
  CITIZENS: 'CITIZENS',
} as const;

export type NotificationRecipientScope = (typeof RECIPIENT_SCOPES)[keyof typeof RECIPIENT_SCOPES];

export const AUDIT_ACTIONS = {
  INCIDENT_CREATE: 'INCIDENT_CREATE',
  INCIDENT_TRIAGE: 'INCIDENT_TRIAGE',
  INCIDENT_RESOLVE: 'INCIDENT_RESOLVE',
  TEAM_CREATE: 'TEAM_CREATE',
  TEAM_UPDATE: 'TEAM_UPDATE',
  TEAM_STATUS_UPDATE: 'TEAM_STATUS_UPDATE',
  TEAM_MEMBER_ADD: 'TEAM_MEMBER_ADD',
  RESOURCE_CREATE: 'RESOURCE_CREATE',
  RESOURCE_UPDATE: 'RESOURCE_UPDATE',
  SHELTER_CREATE: 'SHELTER_CREATE',
  SHELTER_UPDATE: 'SHELTER_UPDATE',
  ASSIGNMENT_CREATE: 'ASSIGNMENT_CREATE',
  ASSIGNMENT_STATUS_UPDATE: 'ASSIGNMENT_STATUS_UPDATE',
  ASSIGNMENT_FIELD_COMPLETE: 'ASSIGNMENT_FIELD_COMPLETE',
  ASSIGNMENT_FIELD_UPDATE: 'ASSIGNMENT_FIELD_UPDATE',
  ASSIGNMENT_EVENT_RECORD: 'ASSIGNMENT_EVENT_RECORD',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_ACTIVATE: 'USER_ACTIVATE',
  NOTIFICATION_DISPATCH: 'NOTIFICATION_DISPATCH',
  NOTIFICATION_BROADCAST: 'NOTIFICATION_BROADCAST',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const RAG_RESPONSE_STATUSES = {
  GROUNDED: 'GROUNDED',
  ABSTAINED: 'ABSTAINED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type RagResponseStatus = (typeof RAG_RESPONSE_STATUSES)[keyof typeof RAG_RESPONSE_STATUSES];

export const MEDIA_TYPES = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
} as const;

export type MediaType = (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES];

// Common error envelope
export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  request_id: string;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}