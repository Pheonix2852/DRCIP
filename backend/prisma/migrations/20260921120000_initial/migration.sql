-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CITIZEN', 'FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "DisasterType" AS ENUM ('FLOOD', 'CYCLONE', 'FIRE', 'EARTHQUAKE', 'BUILDING_COLLAPSE', 'MEDICAL_EMERGENCY', 'ROAD_BLOCKAGE', 'LANDSLIDE');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'TRIAGE_PENDING', 'IN_RESPONSE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('AMBULANCE', 'RESCUE_TEAM', 'FOOD', 'MEDICAL_KIT', 'VEHICLE', 'RELIEF_TRUCK', 'SHELTER', 'VOLUNTEER', 'PERSONNEL');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'DEPLOYED', 'UNAVAILABLE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('SUCCESS', 'UNAVAILABLE', 'ERROR');

-- CreateEnum
CREATE TYPE "RecommendationDecision" AS ENUM ('PENDING', 'APPROVED', 'MODIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldTeam" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "capabilityProfile" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "memberRole" TEXT NOT NULL,
    "contactReference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "disasterType" "DisasterType" NOT NULL,
    "description" TEXT NOT NULL,
    "peopleAffected" INTEGER NOT NULL,
    "emergencyContactNumber" TEXT NOT NULL,
    "location" JSONB NOT NULL,
    "addressText" TEXT,
    "state" TEXT,
    "district" TEXT,
    "responseZoneId" TEXT,
    "predictedSeverity" "SeverityLevel",
    "confirmedSeverity" "SeverityLevel",
    "status" "IncidentStatus" NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentMedia" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ResourceStatus" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "capacity" DECIMAL(65,30),
    "capabilityProfile" JSONB NOT NULL DEFAULT '{}',
    "location" JSONB,
    "contactReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseZone" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponseZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shelter" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" JSONB NOT NULL,
    "totalCapacity" INTEGER NOT NULL,
    "currentOccupancy" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shelter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeverityPrediction" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "severity" "SeverityLevel",
    "confidence" DECIMAL(65,30),
    "modelVersion" TEXT,
    "predictionId" TEXT,
    "predictionStatus" "PredictionStatus" NOT NULL,
    "explanation" JSONB,
    "inputReference" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeverityPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandForecast" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "responseZoneId" TEXT,
    "incidentId" TEXT,
    "forecastHorizonStart" TIMESTAMP(3) NOT NULL,
    "forecastHorizonEnd" TIMESTAMP(3) NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "lowerBound" DECIMAL(65,30),
    "upperBound" DECIMAL(65,30),
    "qualityIndicator" DECIMAL(65,30),
    "providerVersion" TEXT NOT NULL,
    "assumptions" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationRecommendation" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "recommendationStatus" "RecommendationDecision" NOT NULL,
    "optimizerVersion" TEXT NOT NULL,
    "objectiveSummary" JSONB,
    "constraintSummary" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationRecommendationItem" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT,
    "teamId" TEXT,
    "shelterId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "rank" INTEGER,
    "travelMinutes" DECIMAL(65,30),
    "rationale" TEXT,

    CONSTRAINT "AllocationRecommendationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "assignedBy" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fieldTeamId" TEXT,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentItem" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT,
    "teamId" TEXT,
    "shelterId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "AssignmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "incidentId" TEXT,
    "assignmentId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "notificationType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherObservation" (
    "id" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "temperature" DECIMAL(65,30),
    "precipitation" DECIMAL(65,30),
    "windSpeed" DECIMAL(65,30),
    "humidity" DECIMAL(65,30),
    "rawPayload" JSONB,
    "retrievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseDocument" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceOrganization" TEXT,
    "documentType" TEXT NOT NULL,
    "publicationDate" TIMESTAMP(3),
    "version" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "license" TEXT,
    "authorityLevel" TEXT NOT NULL,
    "approvedForRag" BOOLEAN NOT NULL DEFAULT false,
    "downloadedAt" TIMESTAMP(3) NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageUri" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "sectionTitle" TEXT,
    "textHash" TEXT NOT NULL,
    "qdrantPointId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBaseChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "toolCalls" JSONB,
    "ragVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicIdSequence" (
    "prefix" TEXT NOT NULL,
    "currentValue" INTEGER NOT NULL,

    CONSTRAINT "PublicIdSequence_pkey" PRIMARY KEY ("prefix")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_publicId_idx" ON "User"("publicId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FieldTeam_publicId_key" ON "FieldTeam"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldTeam_leaderUserId_key" ON "FieldTeam"("leaderUserId");

-- CreateIndex
CREATE INDEX "FieldTeam_publicId_idx" ON "FieldTeam"("publicId");

-- CreateIndex
CREATE INDEX "FieldTeam_leaderUserId_idx" ON "FieldTeam"("leaderUserId");

-- CreateIndex
CREATE INDEX "FieldTeamMember_teamId_idx" ON "FieldTeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_publicId_key" ON "Incident"("publicId");

-- CreateIndex
CREATE INDEX "Incident_publicId_idx" ON "Incident"("publicId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_disasterType_idx" ON "Incident"("disasterType");

-- CreateIndex
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");

-- CreateIndex
CREATE INDEX "Incident_reporterUserId_idx" ON "Incident"("reporterUserId");

-- CreateIndex
CREATE INDEX "IncidentMedia_incidentId_idx" ON "IncidentMedia"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_publicId_key" ON "Resource"("publicId");

-- CreateIndex
CREATE INDEX "Resource_publicId_idx" ON "Resource"("publicId");

-- CreateIndex
CREATE INDEX "Resource_resourceType_idx" ON "Resource"("resourceType");

-- CreateIndex
CREATE INDEX "Resource_status_idx" ON "Resource"("status");

-- CreateIndex
CREATE INDEX "Resource_teamId_idx" ON "Resource"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseZone_publicId_key" ON "ResponseZone"("publicId");

-- CreateIndex
CREATE INDEX "ResponseZone_publicId_idx" ON "ResponseZone"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Shelter_publicId_key" ON "Shelter"("publicId");

-- CreateIndex
CREATE INDEX "Shelter_publicId_idx" ON "Shelter"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "SeverityPrediction_publicId_key" ON "SeverityPrediction"("publicId");

-- CreateIndex
CREATE INDEX "SeverityPrediction_incidentId_idx" ON "SeverityPrediction"("incidentId");

-- CreateIndex
CREATE INDEX "SeverityPrediction_publicId_idx" ON "SeverityPrediction"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "DemandForecast_publicId_key" ON "DemandForecast"("publicId");

-- CreateIndex
CREATE INDEX "DemandForecast_incidentId_idx" ON "DemandForecast"("incidentId");

-- CreateIndex
CREATE INDEX "DemandForecast_responseZoneId_idx" ON "DemandForecast"("responseZoneId");

-- CreateIndex
CREATE INDEX "DemandForecast_publicId_idx" ON "DemandForecast"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationRecommendation_publicId_key" ON "AllocationRecommendation"("publicId");

-- CreateIndex
CREATE INDEX "AllocationRecommendation_incidentId_idx" ON "AllocationRecommendation"("incidentId");

-- CreateIndex
CREATE INDEX "AllocationRecommendation_publicId_idx" ON "AllocationRecommendation"("publicId");

-- CreateIndex
CREATE INDEX "AllocationRecommendationItem_recommendationId_idx" ON "AllocationRecommendationItem"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_publicId_key" ON "Assignment"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_recommendationId_key" ON "Assignment"("recommendationId");

-- CreateIndex
CREATE INDEX "Assignment_incidentId_idx" ON "Assignment"("incidentId");

-- CreateIndex
CREATE INDEX "Assignment_publicId_idx" ON "Assignment"("publicId");

-- CreateIndex
CREATE INDEX "Assignment_recommendationId_idx" ON "Assignment"("recommendationId");

-- CreateIndex
CREATE INDEX "AssignmentItem_assignmentId_idx" ON "AssignmentItem"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentEvent_assignmentId_idx" ON "AssignmentEvent"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_publicId_key" ON "Notification"("publicId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_idx" ON "Notification"("recipientUserId");

-- CreateIndex
CREATE INDEX "Notification_publicId_idx" ON "Notification"("publicId");

-- CreateIndex
CREATE INDEX "WeatherObservation_latitude_longitude_idx" ON "WeatherObservation"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseDocument_publicId_key" ON "KnowledgeBaseDocument"("publicId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseDocument_publicId_idx" ON "KnowledgeBaseDocument"("publicId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_documentId_idx" ON "KnowledgeBaseChunk"("documentId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseChunk_qdrantPointId_idx" ON "KnowledgeBaseChunk"("qdrantPointId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_publicId_key" ON "ChatSession"("publicId");

-- CreateIndex
CREATE INDEX "ChatSession_publicId_idx" ON "ChatSession"("publicId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");

-- AddForeignKey
ALTER TABLE "FieldTeam" ADD CONSTRAINT "FieldTeam_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTeamMember" ADD CONSTRAINT "FieldTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FieldTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_responseZoneId_fkey" FOREIGN KEY ("responseZoneId") REFERENCES "ResponseZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentMedia" ADD CONSTRAINT "IncidentMedia_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FieldTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeverityPrediction" ADD CONSTRAINT "SeverityPrediction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_responseZoneId_fkey" FOREIGN KEY ("responseZoneId") REFERENCES "ResponseZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecommendation" ADD CONSTRAINT "AllocationRecommendation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecommendation" ADD CONSTRAINT "AllocationRecommendation_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecommendationItem" ADD CONSTRAINT "AllocationRecommendationItem_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AllocationRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AllocationRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_fieldTeamId_fkey" FOREIGN KEY ("fieldTeamId") REFERENCES "FieldTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentItem" ADD CONSTRAINT "AssignmentItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentItem" ADD CONSTRAINT "AssignmentItem_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentItem" ADD CONSTRAINT "AssignmentItem_shelterId_fkey" FOREIGN KEY ("shelterId") REFERENCES "Shelter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEvent" ADD CONSTRAINT "AssignmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseChunk" ADD CONSTRAINT "KnowledgeBaseChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeBaseDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

