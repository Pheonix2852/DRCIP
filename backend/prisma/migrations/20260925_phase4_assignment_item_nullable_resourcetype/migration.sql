-- Phase 4: Field Team and Shelter assignment items carry no resource type.
-- Resource items store the resource type; team/shelter items leave it NULL.
ALTER TABLE "AssignmentItem" ALTER COLUMN "resourceType" DROP NOT NULL;