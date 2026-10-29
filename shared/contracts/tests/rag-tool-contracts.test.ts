import { describe, expect, it } from 'vitest';
import {
  RAG_TOOL_ALLOWED_ROLES,
  RAG_TOOL_LIMITS,
  RAG_TOOL_NAMES,
  ROLES,
} from '../src/domain';
import {
  getActiveIncidentsArgsSchema,
  getCurrentAssignmentsArgsSchema,
  getNearbyAmbulancesArgsSchema,
  getResourceStockArgsSchema,
  getShelterCapacityArgsSchema,
  ragIncidentRecordSchema,
  ragLiveEvidenceSchema,
  ragToolCallSchema,
  ragToolInvocationSchema,
} from '../src/schemas';

const toolNames = Object.values(RAG_TOOL_NAMES);

describe('RAG 2.0 frozen live-tool contracts', () => {
  it('freezes the six tool names', () => {
    expect(toolNames).toEqual([
      'get_active_incidents',
      'get_nearby_ambulances',
      'get_available_rescue_teams',
      'get_shelter_capacity',
      'get_resource_stock',
      'get_current_assignments',
    ]);
  });

  it('denies every live tool to citizens and resource stock to field officers', () => {
    for (const tool of toolNames) {
      expect(RAG_TOOL_ALLOWED_ROLES[tool]).not.toContain(ROLES.CITIZEN);
    }
    expect(RAG_TOOL_ALLOWED_ROLES.get_resource_stock).toEqual([
      ROLES.DISASTER_COORDINATOR,
      ROLES.ADMINISTRATOR,
    ]);
    for (const tool of toolNames) {
      if (tool !== 'get_resource_stock') {
        expect(RAG_TOOL_ALLOWED_ROLES[tool]).toContain(ROLES.FIELD_OFFICER);
      }
    }
  });

  it('applies default limits and rejects unknown arguments', () => {
    expect(getActiveIncidentsArgsSchema.parse({}).limit).toBe(RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT);
    expect(
      getNearbyAmbulancesArgsSchema.parse({ latitude: 22.5, longitude: 88.3, radius_km: 10 }).limit,
    ).toBe(RAG_TOOL_LIMITS.DEFAULT_RESULT_LIMIT);
    expect(() => getCurrentAssignmentsArgsSchema.parse({ unexpected: true })).toThrow();
  });

  it('bounds limits, radius and nearby coordinate completeness', () => {
    expect(() =>
      getNearbyAmbulancesArgsSchema.parse({
        latitude: 22.5,
        longitude: 88.3,
        radius_km: RAG_TOOL_LIMITS.MAX_RADIUS_KM + 1,
      }),
    ).toThrow();
    expect(() =>
      getNearbyAmbulancesArgsSchema.parse({
        latitude: 22.5,
        longitude: 88.3,
        radius_km: 10,
        limit: RAG_TOOL_LIMITS.MAX_RESULT_LIMIT + 1,
      }),
    ).toThrow();
    expect(() => getShelterCapacityArgsSchema.parse({ latitude: 22.5 })).toThrow();
    expect(() => getResourceStockArgsSchema.parse({ longitude: 88.3, radius_km: 10 })).toThrow();
  });

  it('keeps active incidents active and trims ids', () => {
    expect(() => getActiveIncidentsArgsSchema.parse({ status: 'RESOLVED' })).toThrow();
    expect(getCurrentAssignmentsArgsSchema.parse({ incident_id: '  INC-1  ' }).incident_id).toBe(
      'INC-1',
    );
    expect(() => getCurrentAssignmentsArgsSchema.parse({ incident_id: '   ' })).toThrow();
  });

  it('validates tool invocations against the matching argument schema', () => {
    expect(
      ragToolInvocationSchema.parse({
        tool: 'get_current_assignments',
        arguments: { limit: 5 },
      }),
    ).toMatchObject({ tool: 'get_current_assignments' });
    expect(() =>
      ragToolInvocationSchema.parse({
        tool: 'get_nearby_ambulances',
        arguments: { limit: 5 },
      }),
    ).toThrow();
  });

  it('rejects sensitive fields outside the record allowlists', () => {
    const incident = {
      incident_id: 'INC-1',
      disaster_type: 'FLOOD',
      description: 'Flooding',
      status: 'REPORTED',
      confirmed_severity: null,
      predicted_severity: null,
      people_affected: 3,
      latitude: 22.5,
      longitude: 88.3,
      address_text: null,
      state: null,
      district: null,
      response_zone_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(ragIncidentRecordSchema.parse(incident).incident_id).toBe('INC-1');
    expect(() =>
      ragIncidentRecordSchema.parse({ ...incident, contact_reference: 'secret' }),
    ).toThrow();
  });

  it('requires UTC as_of and a live-evidence discriminator', () => {
    const call = {
      tool: 'get_active_incidents',
      outcome: 'SUCCESS',
      as_of: new Date().toISOString(),
      returned_count: 1,
      truncated: false,
    };
    expect(ragToolCallSchema.parse(call).outcome).toBe('SUCCESS');
    expect(() => ragToolCallSchema.parse({ ...call, as_of: '2026-01-01' })).toThrow();
    expect(() => ragToolCallSchema.parse({ ...call, outcome: 'OK' })).toThrow();
    expect(
      ragLiveEvidenceSchema.parse({ ...call, evidence_type: 'LIVE_OPERATIONAL_DATA' })
        .evidence_type,
    ).toBe('LIVE_OPERATIONAL_DATA');
    expect(() => ragLiveEvidenceSchema.parse(call)).toThrow();
  });
});
