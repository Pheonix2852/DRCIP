import { Router, type Response } from 'express';
import { AppRequest } from '../middleware/index';
import { AppError } from '../middleware/errorHandler';
import { requireRole } from '../middleware/auth';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  reportAnalyticsQuerySchema,
  type ReportAnalyticsQueryInput,
  type ReportAnalyticsResponse,
} from '@drcip/contracts';

const router = Router();

const analyticsGuard = requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR');

const SNAPSHOT_LABEL = 'current snapshot';

const DEGRADED_PREDICTION_MESSAGE =
  'AI prediction performance metrics are unavailable. Prediction outputs are not currently persisted in the database.';

type TimeStat = ReportAnalyticsResponse['response_times']['time_to_assign_ms'];

interface ResolvedFilters {
  date_from: Date | null;
  date_to: Date | null;
  disaster_type: string | null;
  response_zone_id: string | null;
}

interface IncidentRow {
  id: string;
  status: string;
  disasterType: string;
  confirmedSeverity: string | null;
  peopleAffected: number;
  createdAt: Date;
  resolvedAt: Date | null;
  responseZoneName: string | null;
}

interface StatusCountRow {
  status: string;
  count: bigint;
}

interface ShelterTotalsRow {
  total: bigint;
  capacity: bigint;
  occupancy: bigint;
}

interface TriageRow {
  triage_count: bigint;
}

interface ReportRow {
  label: string;
  value: string | number;
}

interface ReportSection {
  title: string;
  rows: ReportRow[];
}

// ponytail: report aggregation reads the date-filtered incident rows and groups
// them in memory. Swap the incident read for SQL GROUP BY queries if a report
// ever spans enough rows to matter.

function parseUtcDate(value: string | undefined, field: string): Date | null {
  if (value === undefined || value === '') return null;
  // A timestamp without a zone designator is interpreted as UTC, not server-local.
  const zoned = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const parsed = new Date(zoned);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'INVALID_QUERY', `Invalid ${field} value: ${value}`);
  }
  return parsed;
}

function resolveFilters(query: ReportAnalyticsQueryInput): ResolvedFilters {
  const dateFrom = parseUtcDate(query.date_from, 'date_from');
  const dateTo = parseUtcDate(query.date_to, 'date_to');
  if (dateFrom !== null && dateTo !== null && dateFrom.getTime() > dateTo.getTime()) {
    throw new AppError(400, 'INVALID_QUERY', 'date_from must not be later than date_to');
  }
  return {
    date_from: dateFrom,
    date_to: dateTo,
    disaster_type: query.disaster_type ?? null,
    response_zone_id: query.response_zone_id ?? null,
  };
}

function summarize(values: number[]): TimeStat {
  if (values.length === 0) return { avg: null, median: null, p90: null, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    avg: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1],
    count: sorted.length,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function tally(values: (string | null)[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

function statusRecord(rows: StatusCountRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = Number(row.count);
  return out;
}

async function computeAnalytics(query: ReportAnalyticsQueryInput): Promise<ReportAnalyticsResponse> {
  const filters = resolveFilters(query);

  const [incidentRows, resourceStatusRows, teamStatusRows, shelterStatusRows, shelterTotalsRow] =
    await Promise.all([
      prisma.$queryRaw<IncidentRow[]>`
        SELECT
          i.id,
          i.status,
          i."disasterType",
          i."confirmedSeverity",
          i."peopleAffected",
          i."createdAt",
          i."resolvedAt",
          rz.name AS "responseZoneName"
        FROM "Incident" i
        LEFT JOIN "ResponseZone" rz ON i."responseZoneId" = rz.id
        WHERE TRUE
          ${filters.date_from ? Prisma.sql`AND i."createdAt" >= ${filters.date_from}` : Prisma.empty}
          ${filters.date_to ? Prisma.sql`AND i."createdAt" <= ${filters.date_to}` : Prisma.empty}
          ${filters.disaster_type ? Prisma.sql`AND i."disasterType" = ${filters.disaster_type}::"DisasterType"` : Prisma.empty}
          ${filters.response_zone_id ? Prisma.sql`AND rz."publicId" = ${filters.response_zone_id}` : Prisma.empty}
      `,
      prisma.$queryRaw<StatusCountRow[]>`
        SELECT "status"::text AS status, COUNT(*)::bigint AS count FROM "Resource" GROUP BY "status"
      `,
      prisma.$queryRaw<StatusCountRow[]>`
        SELECT "status"::text AS status, COUNT(*)::bigint AS count FROM "FieldTeam" GROUP BY "status"
      `,
      prisma.$queryRaw<StatusCountRow[]>`
        SELECT "status"::text AS status, COUNT(*)::bigint AS count FROM "Shelter" GROUP BY "status"
      `,
      prisma.$queryRaw<ShelterTotalsRow[]>`
        SELECT
          COUNT(*)::bigint AS total,
          COALESCE(SUM("totalCapacity"), 0)::bigint AS capacity,
          COALESCE(SUM("currentOccupancy"), 0)::bigint AS occupancy
        FROM "Shelter"
      `,
    ]);

  const incidentIds = incidentRows.map((row) => row.id);

  const [triageRow] = await Promise.all([
    incidentIds.length === 0
      ? Promise.resolve([{ triage_count: 0n }] as TriageRow[])
      : prisma.$queryRaw<TriageRow[]>`
          SELECT COUNT(DISTINCT "entityId")::bigint AS triage_count
          FROM "AuditLog"
          WHERE "action" = 'INCIDENT_TRIAGE'
            AND "entityId" IN (${Prisma.join(incidentIds)})
        `,
  ]);

  // Incidents created inside the window stay in scope for their own downstream
  // assignment/start/complete/resolve timestamps, which may fall after date_to.
  const assignments =
    incidentRows.length === 0
      ? []
      : await prisma.assignment.findMany({
          where: { incidentId: { in: incidentRows.map((row) => row.id) } },
          select: { incidentId: true, assignedAt: true, startedAt: true, completedAt: true },
          orderBy: { assignedAt: 'asc' },
        });

  const createdAtByIncident = new Map(incidentRows.map((row) => [row.id, row.createdAt]));

  const timeToAssign: number[] = [];
  const firstStartedByIncident = new Map<string, number>();
  const timeToComplete: number[] = [];
  const firstAssigned = new Set<string>();

  for (const assignment of assignments) {
    const createdAt = createdAtByIncident.get(assignment.incidentId);
    if (createdAt === undefined) continue;

    if (!firstAssigned.has(assignment.incidentId)) {
      firstAssigned.add(assignment.incidentId);
      timeToAssign.push(assignment.assignedAt.getTime() - createdAt.getTime());
    }

    if (assignment.startedAt !== null) {
      const delta = assignment.startedAt.getTime() - createdAt.getTime();
      const seen = firstStartedByIncident.get(assignment.incidentId);
      if (seen === undefined || delta < seen) firstStartedByIncident.set(assignment.incidentId, delta);
    }

    if (assignment.completedAt !== null) {
      timeToComplete.push(assignment.completedAt.getTime() - assignment.assignedAt.getTime());
    }
  }

  const trendCounts = new Map<string, number>();
  for (const row of incidentRows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    trendCounts.set(date, (trendCounts.get(date) ?? 0) + 1);
  }

  const resourceStatus = statusRecord(resourceStatusRows);
  const teamStatus = statusRecord(teamStatusRows);
  const shelterStatus = statusRecord(shelterStatusRows);

  const resourceTotal = Object.values(resourceStatus).reduce((sum, count) => sum + count, 0);
  const teamTotal = Object.values(teamStatus).reduce((sum, count) => sum + count, 0);
  const shelterTotal = Number(shelterTotalsRow[0]?.total ?? 0);
  const shelterCapacity = Number(shelterTotalsRow[0]?.capacity ?? 0);
  const shelterOccupancy = Number(shelterTotalsRow[0]?.occupancy ?? 0);
  const incidentTotal = incidentRows.length;
  const triageCount = Number(triageRow[0]?.triage_count ?? 0);
  const bySeverity = tally(incidentRows.map((row) => row.confirmedSeverity));

  return {
    filters: {
      date_from: query.date_from ?? null,
      date_to: query.date_to ?? null,
      disaster_type: query.disaster_type ?? null,
      response_zone_id: query.response_zone_id ?? null,
    },
    incidents: {
      total: incidentTotal,
      by_status: tally(incidentRows.map((row) => row.status)),
      by_disaster_type: tally(incidentRows.map((row) => row.disasterType)),
      by_response_zone: tally(incidentRows.map((row) => row.responseZoneName)),
      by_severity: bySeverity,
      people_affected_total: incidentRows.reduce((sum, row) => sum + Number(row.peopleAffected), 0),
      trend: [...trendCounts.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
    response_times: {
      time_to_assign_ms: summarize(timeToAssign),
      time_to_first_response_ms: summarize([...firstStartedByIncident.values()]),
      time_to_complete_ms: summarize(timeToComplete),
      time_to_resolve_ms: summarize(
        incidentRows
          .filter((row) => row.resolvedAt !== null)
          .map((row) => (row.resolvedAt as Date).getTime() - row.createdAt.getTime()),
      ),
    },
    resources: {
      total: resourceTotal,
      by_status: resourceStatus,
      utilization_rate: ratio((resourceStatus.ASSIGNED ?? 0) + (resourceStatus.DEPLOYED ?? 0), resourceTotal),
    },
    teams: {
      total: teamTotal,
      active: teamStatus.ACTIVE ?? 0,
      by_status: teamStatus,
    },
    shelters: {
      total: shelterTotal,
      total_capacity: shelterCapacity,
      total_occupancy: shelterOccupancy,
      utilization_rate: ratio(shelterOccupancy, shelterCapacity),
      by_status: shelterStatus,
    },
    prediction: {
      triage_count: triageCount,
      triage_ratio: ratio(triageCount, incidentTotal),
      severity_distribution: bySeverity,
      prediction_available: false,
      degraded_message: DEGRADED_PREDICTION_MESSAGE,
    },
  };
}

function formatMs(value: number | null): string {
  if (value === null) return 'n/a';
  if (value < 60_000) return `${Math.round(value / 1000)}s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function recordRows(record: Record<string, number>, suffix?: string): ReportRow[] {
  return Object.entries(record).map(([key, count]) => ({
    label: suffix ? `${key} (${suffix})` : key,
    value: count,
  }));
}

function statRows(label: string, stat: TimeStat): ReportRow[] {
  return [
    { label: `${label} — average`, value: formatMs(stat.avg) },
    { label: `${label} — median`, value: formatMs(stat.median) },
    { label: `${label} — p90`, value: formatMs(stat.p90) },
    { label: `${label} — samples`, value: stat.count },
  ];
}

function reportSections(analytics: ReportAnalyticsResponse): ReportSection[] {
  return [
    {
      title: 'Filters',
      rows: [
        { label: 'Date from', value: analytics.filters.date_from ?? 'All time' },
        { label: 'Date to', value: analytics.filters.date_to ?? 'All time' },
        { label: 'Disaster type', value: analytics.filters.disaster_type ?? 'All types' },
        { label: 'Response zone', value: analytics.filters.response_zone_id ?? 'All zones' },
      ],
    },
    {
      title: 'Incident Summary',
      rows: [
        { label: 'Total incidents', value: analytics.incidents.total },
        { label: 'People affected', value: analytics.incidents.people_affected_total },
        { label: 'Average people affected', value: analytics.incidents.total === 0 ? 0 : (analytics.incidents.people_affected_total / analytics.incidents.total).toFixed(1) },
      ],
    },
    { title: 'Incidents by Status', rows: recordRows(analytics.incidents.by_status) },
    { title: 'Incidents by Disaster Type', rows: recordRows(analytics.incidents.by_disaster_type) },
    { title: 'Incidents by Response Zone', rows: recordRows(analytics.incidents.by_response_zone) },
    { title: 'Incidents by Confirmed Severity', rows: recordRows(analytics.incidents.by_severity) },
    {
      title: 'Incident Trend (by creation date, UTC)',
      rows: analytics.incidents.trend.map((point) => ({ label: point.date, value: point.count })),
    },
    {
      title: 'Response Times',
      rows: [
        ...statRows('Time to assign', analytics.response_times.time_to_assign_ms),
        ...statRows('Time to first response', analytics.response_times.time_to_first_response_ms),
        ...statRows('Time to complete assignment', analytics.response_times.time_to_complete_ms),
        ...statRows('Time to resolve incident', analytics.response_times.time_to_resolve_ms),
      ],
    },
    {
      title: `Resources (${SNAPSHOT_LABEL})`,
      rows: [
        { label: 'Total resources', value: analytics.resources.total },
        { label: 'Utilization rate', value: formatRate(analytics.resources.utilization_rate) },
        ...recordRows(analytics.resources.by_status),
      ],
    },
    {
      title: `Field Teams (${SNAPSHOT_LABEL})`,
      rows: [
        { label: 'Total teams', value: analytics.teams.total },
        { label: 'Active teams', value: analytics.teams.active },
        ...recordRows(analytics.teams.by_status),
      ],
    },
    {
      title: `Shelters (${SNAPSHOT_LABEL})`,
      rows: [
        { label: 'Total shelters', value: analytics.shelters.total },
        { label: 'Total capacity', value: analytics.shelters.total_capacity },
        { label: 'Current occupancy', value: analytics.shelters.total_occupancy },
        { label: 'Utilization rate', value: formatRate(analytics.shelters.utilization_rate) },
        ...recordRows(analytics.shelters.by_status),
      ],
    },
    {
      title: 'Prediction & Triage',
      rows: [
        { label: 'Manual triage decisions', value: analytics.prediction.triage_count },
        { label: 'Triage ratio', value: formatRate(analytics.prediction.triage_ratio) },
        { label: 'Prediction metrics available', value: analytics.prediction.prediction_available ? 'Yes' : 'No' },
        { label: 'Notice', value: analytics.prediction.degraded_message },
        ...recordRows(analytics.prediction.severity_distribution, 'severity'),
      ],
    },
  ];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(analytics: ReportAnalyticsResponse): string {
  const lines = ['Section,Metric,Value'];
  for (const section of reportSections(analytics)) {
    for (const row of section.rows) {
      lines.push([section.title, row.label, row.value].map(csvCell).join(','));
    }
  }
  return lines.join('\r\n');
}

function toXlsx(analytics: ReportAnalyticsResponse, res: Response): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DRCIP';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Section', 'Metric', 'Value']).font = { bold: true };
  for (const section of reportSections(analytics)) {
    for (const row of section.rows) {
      summary.addRow([section.title, row.label, row.value]);
    }
  }
  summary.columns = [{ width: 34 }, { width: 40 }, { width: 24 }];

  const statusSheet = workbook.addWorksheet('Incidents by Status');
  statusSheet.addRow(['Status', 'Incidents', 'Share']).font = { bold: true };
  const total = analytics.incidents.total;
  for (const [status, count] of Object.entries(analytics.incidents.by_status)) {
    statusSheet.addRow([status, count, total === 0 ? 0 : count / total]);
  }
  statusSheet.columns = [{ width: 22 }, { width: 14 }, { width: 12 }];

  const timeSheet = workbook.addWorksheet('Response Times');
  timeSheet.addRow(['Metric', 'Average (ms)', 'Median (ms)', 'P90 (ms)', 'Samples']).font = { bold: true };
  const timeMetrics: [string, TimeStat][] = [
    ['Time to assign', analytics.response_times.time_to_assign_ms],
    ['Time to first response', analytics.response_times.time_to_first_response_ms],
    ['Time to complete assignment', analytics.response_times.time_to_complete_ms],
    ['Time to resolve incident', analytics.response_times.time_to_resolve_ms],
  ];
  for (const [label, stat] of timeMetrics) {
    timeSheet.addRow([label, stat.avg, stat.median, stat.p90, stat.count]);
  }
  timeSheet.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];

  const resourceSheet = workbook.addWorksheet('Resources');
  resourceSheet.addRow(['Metric', 'Value']).font = { bold: true };
  resourceSheet.addRow(['Total', analytics.resources.total]);
  resourceSheet.addRow(['Utilization rate', analytics.resources.utilization_rate]);
  for (const [status, count] of Object.entries(analytics.resources.by_status)) {
    resourceSheet.addRow([status, count]);
  }
  resourceSheet.columns = [{ width: 24 }, { width: 16 }];

  const shelterSheet = workbook.addWorksheet('Shelters');
  shelterSheet.addRow(['Metric', 'Value']).font = { bold: true };
  shelterSheet.addRow(['Total shelters', analytics.shelters.total]);
  shelterSheet.addRow(['Total capacity', analytics.shelters.total_capacity]);
  shelterSheet.addRow(['Current occupancy', analytics.shelters.total_occupancy]);
  shelterSheet.addRow(['Utilization rate', analytics.shelters.utilization_rate]);
  for (const [status, count] of Object.entries(analytics.shelters.by_status)) {
    shelterSheet.addRow([status, count]);
  }
  shelterSheet.columns = [{ width: 24 }, { width: 16 }];

  return workbook.xlsx.write(res);
}

function toPdf(analytics: ReportAnalyticsResponse, res: Response): void {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('DRCIP Operational Report');
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#555555').text(`Generated ${new Date().toISOString()} (UTC)`);
  doc.fillColor('#000000');

  for (const section of reportSections(analytics)) {
    if (doc.y > 700) doc.addPage();
    doc.moveDown(0.6).fontSize(12).text(section.title, { underline: true });
    doc.fontSize(9);
    for (const row of section.rows) {
      if (doc.y > 770) doc.addPage();
      doc.text(`${row.label}: ${row.value}`);
    }
  }

  doc.end();
}

function parseReportQuery(req: AppRequest): ReportAnalyticsQueryInput {
  return reportAnalyticsQuerySchema.parse(req.query);
}

router.get('/analytics', analyticsGuard, async (req: AppRequest, res, next) => {
  try {
    const analytics = await computeAnalytics(parseReportQuery(req));
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
});

router.get('/export.csv', analyticsGuard, async (req: AppRequest, res, next) => {
  try {
    const analytics = await computeAnalytics(parseReportQuery(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="drcip-report.csv"');
    res.send(toCsv(analytics));
  } catch (err) {
    next(err);
  }
});

router.get('/export.xlsx', analyticsGuard, async (req: AppRequest, res, next) => {
  try {
    const analytics = await computeAnalytics(parseReportQuery(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="drcip-report.xlsx"');
    await toXlsx(analytics, res);
  } catch (err) {
    next(err);
  }
});

router.get('/export.pdf', analyticsGuard, async (req: AppRequest, res, next) => {
  try {
    const analytics = await computeAnalytics(parseReportQuery(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="drcip-report.pdf"');
    toPdf(analytics, res);
  } catch (err) {
    next(err);
  }
});

export default router;
