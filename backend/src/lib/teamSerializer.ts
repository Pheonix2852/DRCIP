import type { FieldTeam, FieldTeamMember, User } from '@prisma/client';

export type TeamWithRelations = FieldTeam & {
  leader: User;
  members: FieldTeamMember[];
};

export const teamInclude = { leader: true, members: true } as const;

export function serializeMember(member: FieldTeamMember) {
  return {
    id: member.id,
    member_name: member.memberName,
    member_role: member.memberRole,
    contact_reference: member.contactReference,
    is_active: member.isActive,
    joined_at: member.joinedAt,
  };
}

export function serializeTeam(team: TeamWithRelations) {
  return {
    id: team.publicId,
    name: team.name,
    status: team.status,
    capability_profile: team.capabilityProfile,
    leader: {
      id: team.leader.publicId,
      name: team.leader.fullName,
    },
    members: team.members.map(serializeMember),
    created_at: team.createdAt,
    updated_at: team.updatedAt,
  };
}
