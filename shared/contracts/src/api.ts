// API contract types

import {
  Role,
  DisasterType,
  SeverityLevel,
  IncidentStatus,
  ResourceType,
  ResourceStatus,
  AssignmentStatus,
  RecommendationDecision,
  PredictionStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  NotificationPriority,
  NotificationRecipientScope,
  RagResponseStatus,
  Pagination,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ApiResponse,
} from './domain';

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    name: string;
    role: Role;
  };
}

// Users
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: Role;
}

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  created_by: string | null;
}

export interface UserListResponse {
  items: User[];
  pagination: Pagination;
}

// Audit
export interface AuditLogSummary {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface AuditLogDetail {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogSummary[];
  pagination: Pagination;
}

// Incidents
export interface CreateIncidentRequest {
  disaster_type: DisasterType;
  description: string;
  latitude: number;
  longitude: number;
  people_affected: number;
  emergency_contact_number: string;
}

export interface IncidentSummary {
  incident_id: string;
  status: IncidentStatus;
  created_at: string;
}

export interface LatestPrediction {
  severity?: SeverityLevel;
  confidence?: string;
  model_version?: string;
  status: PredictionStatus;
  generated_at?: string;
}

export interface IncidentDetails {
  id: string;
  public_id: string;
  reporter_user_id: string;
  disaster_type: DisasterType;
  description: string;
  people_affected: number;
  emergency_contact_number: string;
  latitude: number;
  longitude: number;
  address_text?: string;
  state?: string;
  district?: string;
  predicted_severity?: SeverityLevel;
  confirmed_severity?: SeverityLevel;
  latest_prediction?: LatestPrediction;
  status: IncidentStatus;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

// Resources
export interface ResourceSummary {
  id: string;
  public_id: string;
  resource_type: ResourceType;
  name: string;
  status: ResourceStatus;
  quantity: number;
  unit?: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
}

// Teams
export interface FieldTeamSummary {
  id: string;
  public_id: string;
  name: string;
  leader_user_id: string;
  status: string;
}

// Shelters
export interface ShelterSummary {
  id: string;
  public_id: string;
  name: string;
  latitude: number;
  longitude: number;
  total_capacity: number;
  current_occupancy: number;
  status: string;
}

// Assignments
export interface AssignmentSummary {
  id: string;
  public_id: string;
  incident_id: string;
  status: AssignmentStatus;
  assigned_by: string;
  assigned_at: string;
}

export interface CreateAssignmentRequest {
  recommendation_id?: string;
  items: {
    resource_type: ResourceType;
    resource_id?: string;
    team_id?: string;
    shelter_id?: string;
    quantity: number;
  }[];
  notes?: string;
}

// Recommendations
export interface RecommendationSummary {
  recommendation_id: string;
  incident_id: string;
  status: RecommendationDecision;
  items: {
    resource_type: ResourceType;
    resource_id?: string;
    team_id?: string;
    shelter_id?: string;
    quantity: number;
    rank?: number;
    travel_minutes?: number;
    rationale?: string;
  }[];
  objective_summary?: {
    estimated_travel_minutes?: number;
    unmet_demand?: number;
  };
  optimizer_version: string;
  generated_at: string;
}

// Notifications
export interface NotificationSummary {
  id: string;
  public_id: string;
  // Stable grouping key shared by every channel row of the same logical event for
  // one recipient (dedupeKey minus its channel segment). Used to render one
  // inbox item for an IN_APP + EMAIL pair.
  logical_key: string;
  channel: NotificationChannel;
  notification_type: NotificationType;
  priority: NotificationPriority;
  message: string;
  payload: Record<string, unknown>;
  delivery_status: NotificationDeliveryStatus;
  sent_at: string | null;
  read_at: string | null;
  incident_public_id: string | null;
  assignment_public_id: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationSummary[];
  pagination: Pagination;
}

export interface BroadcastNotificationRequest {
  message: string;
  severity: NotificationPriority;
  recipient_scope: NotificationRecipientScope;
}

// RAG
export interface RagQueryRequest {
  query: string;
  incident_id?: string;
}

export interface RagQueryResponse {
  status: RagResponseStatus;
  answer: string;
  citations: {
    document_id: string;
    title: string;
    page?: number;
    section?: string;
    source_organization?: string;
  }[];
  tool_calls: unknown[];
  rag_version: string;
}

// Intelligence
export interface SeverityPredictionRequest {
  incident_id: string;
  description: string;
  people_affected: number;
  disaster_type: DisasterType;
  latitude: number;
  longitude: number;
  event_context?: Record<string, unknown>;
  weather_context?: Record<string, unknown>;
}

export interface SeverityPredictionResponse {
  status: PredictionStatus;
  incident_id: string;
  severity?: SeverityLevel;
  confidence?: number;
  model_version?: string;
  prediction_id?: string;
  explanation?: string[];
  generated_at?: string;
  error_code?: string;
  message?: string;
}

export interface DemandForecastRequest {
  response_zone_id?: string;
  incident_id?: string;
  forecast_horizon_start: string;
  forecast_horizon_end: string;
  resource_types: ResourceType[];
  context?: Record<string, unknown>;
}

export interface DemandForecastResponse {
  status: PredictionStatus;
  forecast_id: string;
  scope?: {
    response_zone_id?: string;
    incident_id?: string;
  };
  forecast_horizon_start: string;
  forecast_horizon_end: string;
  items: {
    resource_type: ResourceType;
    quantity: number;
    lower_bound?: number;
    upper_bound?: number;
    quality_indicator?: number;
    provider_version: string;
    assumptions?: Record<string, unknown>;
  }[];
  generated_at: string;
  error_code?: string;
  message?: string;
}

export interface OptimizationRequest {
  incident_id: string;
  severity?: SeverityLevel;
  demand_estimate: {
    resource_type: ResourceType;
    quantity: number;
  }[];
  resource_candidates: {
    resource_type: ResourceType;
    resource_id: string;
    latitude: number;
    longitude: number;
    capacity?: number;
    capability?: string[];
  }[];
  team_candidates: {
    team_id: string;
    latitude: number;
    longitude: number;
    capability?: string[];
  }[];
  shelter_candidates: {
    shelter_id: string;
    latitude: number;
    longitude: number;
    capacity: number;
  }[];
  coordinates: {
    latitude: number;
    longitude: number;
  };
  constraints?: Record<string, unknown>;
}

export interface OptimizationResponse {
  status: PredictionStatus;
  recommendation_id: string;
  incident_id: string;
  items: {
    resource_type: ResourceType;
    resource_id?: string;
    team_id?: string;
    shelter_id?: string;
    quantity: number;
    rank?: number;
    travel_minutes?: number;
    rationale?: string;
  }[];
  objective_summary: {
    estimated_travel_minutes?: number;
    unmet_demand?: number;
  };
  solver_version: string;
  generated_at: string;
  error_code?: string;
  message?: string;
}

// Re-export common types via index.ts re-exports from domain.ts

// ---------------------------------------------------------------------------
// Phase 8 — Reports & Analytics
// See docs/02_Functional_Specification.md §13 and docs/06_UI_UX_Specification.md §18
// ---------------------------------------------------------------------------

export interface ReportAnalyticsResponse {
  filters: {
    date_from: string | null;
    date_to: string | null;
    disaster_type: string | null;
    response_zone_id: string | null;
  };
  incidents: {
    total: number;
    by_status: Record<string, number>;
    by_disaster_type: Record<string, number>;
    by_response_zone: Record<string, number>;
    by_severity: Record<string, number>;
    people_affected_total: number;
    trend: { date: string; count: number }[];
  };
  response_times: {
    time_to_assign_ms: { avg: number | null; median: number | null; p90: number | null; count: number };
    time_to_first_response_ms: { avg: number | null; median: number | null; p90: number | null; count: number };
    time_to_complete_ms: { avg: number | null; median: number | null; p90: number | null; count: number };
    time_to_resolve_ms: { avg: number | null; median: number | null; p90: number | null; count: number };
  };
  resources: {
    total: number;
    by_status: Record<string, number>;
    utilization_rate: number;
  };
  teams: {
    total: number;
    active: number;
    by_status: Record<string, number>;
  };
  shelters: {
    total: number;
    total_capacity: number;
    total_occupancy: number;
    utilization_rate: number;
    by_status: Record<string, number>;
  };
  prediction: {
    triage_count: number;
    triage_ratio: number;
    severity_distribution: Record<string, number>;
    prediction_available: false;
    degraded_message: string;
  };
}

export interface ResponseZoneSummary {
  public_id: string;
  name: string;
  is_active: boolean;
}

export interface ResponseZoneListResponse {
  items: ResponseZoneSummary[];
}