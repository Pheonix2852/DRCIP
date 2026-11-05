// API contract types

import {
  Role,
  DisasterType,
  SeverityLevel,
  IncidentStatus,
  ResourceType,
  ResourceStatus,
  AssignmentStatus,
  TeamStatus,
  ShelterStatus,
  RecommendationDecision,
  PredictionStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  NotificationPriority,
  NotificationRecipientScope,
  RagResponseStatus,
  RagToolName,
  RagToolOutcome,
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

export interface RagCitation {
  document_id?: string;
  title: string;
  page?: number;
  section?: string;
  source_organization?: string;
}

// ---------------------------------------------------------------------------
// RAG 2.0 live-tool contract (implemented)
// See docs/02_Functional_Specification.md #12, docs/05_API_Contract.md #14
// ---------------------------------------------------------------------------

export type ActiveIncidentStatus = Exclude<IncidentStatus, 'RESOLVED'>;

export interface GetActiveIncidentsArgs {
  status?: ActiveIncidentStatus;
  disaster_type?: DisasterType;
  severity?: SeverityLevel;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  limit?: number;
}

export interface GetNearbyAmbulancesArgs {
  latitude: number;
  longitude: number;
  radius_km: number;
  status?: ResourceStatus;
  limit?: number;
}

export interface GetAvailableRescueTeamsArgs {
  capability?: string;
  limit?: number;
}

export interface GetShelterCapacityArgs {
  status?: 'AVAILABLE' | 'FULL' | 'UNAVAILABLE';
  min_available_capacity?: number;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  limit?: number;
}

export interface GetResourceStockArgs {
  resource_type?: ResourceType;
  status?: ResourceStatus;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
  limit?: number;
}

export interface GetCurrentAssignmentsArgs {
  incident_id?: string;
  status?: AssignmentStatus;
  limit?: number;
}

export interface RagToolArgumentMap {
  get_active_incidents: GetActiveIncidentsArgs;
  get_nearby_ambulances: GetNearbyAmbulancesArgs;
  get_available_rescue_teams: GetAvailableRescueTeamsArgs;
  get_shelter_capacity: GetShelterCapacityArgs;
  get_resource_stock: GetResourceStockArgs;
  get_current_assignments: GetCurrentAssignmentsArgs;
}

export type RagToolInvocation = {
  [T in RagToolName]: { tool: T; arguments: RagToolArgumentMap[T] };
}[RagToolName];

export interface RagIncidentRecord {
  incident_id: string;
  disaster_type: DisasterType;
  description: string;
  status: IncidentStatus;
  confirmed_severity: SeverityLevel | null;
  predicted_severity: SeverityLevel | null;
  people_affected: number;
  latitude: number | null;
  longitude: number | null;
  address_text: string | null;
  state: string | null;
  district: string | null;
  response_zone_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RagResourceRecord {
  resource_id: string;
  resource_type: ResourceType;
  name: string;
  status: ResourceStatus;
  quantity: number;
  unit: string | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string;
}

export interface RagTeamRecord {
  team_id: string;
  name: string;
  status: TeamStatus;
  capability_profile: Record<string, unknown>;
  member_count: number;
  updated_at: string;
}

export interface RagShelterRecord {
  shelter_id: string;
  name: string;
  status: ShelterStatus;
  total_capacity: number;
  current_occupancy: number;
  available_capacity: number;
  latitude: number | null;
  longitude: number | null;
  capabilities: Record<string, unknown>;
  updated_at: string;
}

export interface RagAssignmentItemRecord {
  resource_type: ResourceType | null;
  resource_id: string | null;
  team_id: string | null;
  shelter_id: string | null;
  quantity: number;
}

export interface RagAssignmentRecord {
  assignment_id: string;
  incident_id: string;
  status: AssignmentStatus;
  field_team_id: string | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  items: RagAssignmentItemRecord[];
}

export interface RagToolRecordMap {
  get_active_incidents: RagIncidentRecord;
  get_nearby_ambulances: RagResourceRecord;
  get_available_rescue_teams: RagTeamRecord;
  get_shelter_capacity: RagShelterRecord;
  get_resource_stock: RagResourceRecord;
  get_current_assignments: RagAssignmentRecord;
}

interface RagToolResultBase<T extends RagToolName> {
  tool: T;
  as_of: string;
}

export interface RagToolSuccessResult<T extends RagToolName> extends RagToolResultBase<T> {
  outcome: 'SUCCESS';
  records: RagToolRecordMap[T][];
  returned_count: number;
  truncated: boolean;
  total: number;
}

export interface RagToolEmptyResult<T extends RagToolName> extends RagToolResultBase<T> {
  outcome: 'EMPTY';
  records: [];
  returned_count: 0;
  truncated: false;
  total: 0;
}

export interface RagToolFailureResult<T extends RagToolName> extends RagToolResultBase<T> {
  outcome: 'UNAVAILABLE' | 'ERROR';
  records: [];
  returned_count: 0;
  truncated: false;
  message: string;
}

export type RagToolResult<T extends RagToolName> =
  | RagToolSuccessResult<T>
  | RagToolEmptyResult<T>
  | RagToolFailureResult<T>;

export interface RagToolCall {
  tool: RagToolName | 'INVALID';
  outcome: RagToolOutcome;
  as_of: string;
  returned_count: number;
  truncated: boolean;
  requested_tool?: string;
  error_code?: string;
}

export interface RagLiveEvidence extends Omit<RagToolCall, 'tool'> {
  tool: RagToolName;
  evidence_type: 'LIVE_OPERATIONAL_DATA';
}

export interface RagQueryResponse {
  status: RagResponseStatus;
  answer: string;
  citations: RagCitation[];
  tool_calls: RagToolCall[];
  rag_version: string;
  live_evidence?: RagLiveEvidence[];
  provider_status?: 'TOOL_CALL_REJECTED';
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