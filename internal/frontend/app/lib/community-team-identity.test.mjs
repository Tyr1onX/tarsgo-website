import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const identity = await readFile(new URL("../components/community-team-identity.tsx", import.meta.url), "utf8");
const author = await readFile(new URL("../components/community-author-profile.tsx", import.meta.url), "utf8");
const memberProfile = await readFile(new URL("../routes/dashboard/community-member-profile.tsx", import.meta.url), "utf8");
const post = await readFile(new URL("../routes/dashboard/community-post.tsx", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const adminClient = await readFile(new URL("./admin-users-client.ts", import.meta.url), "utf8");
const backendModel = await readFile(new URL("../../../backend/model/user.go", import.meta.url), "utf8");
const backendIdentity = await readFile(new URL("../../../backend/model/team_identity.go", import.meta.url), "utf8");
const backendAdmin = await readFile(new URL("../../../backend/service/adminuser/service.go", import.meta.url), "utf8");
const backendRepository = await readFile(new URL("../../../backend/service/adminuser/repository.go", import.meta.url), "utf8");
const router = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const communityService = await readFile(new URL("../../../backend/service/trainingqa/community.go", import.meta.url), "utf8");
const profileService = await readFile(new URL("../../../backend/service/trainingqa/community_member_profile.go", import.meta.url), "utf8");

test("unverified members have no badge while verified statuses use the four canonical labels", () => {
  assert.match(identity, /community_member: "社区成员"/);
  assert.match(identity, /reserve_member: "预备队员"/);
  assert.match(identity, /formal_member: "正式队员"/);
  assert.match(identity, /former_member: "往届队员"/);
  assert.match(identity, /if \(!status \|\| status === "community_member"\) return null/);
});

test("post, reply, author card and member homepage share one identity display", () => {
  assert.match(post, /teamIdentityStatus=\{post\.authorTeamIdentityStatus\}/);
  assert.match(post, /teamIdentityStatus=\{item\.authorTeamIdentityStatus\}/);
  assert.match(author, /<TeamIdentityBadge status=\{member\?\.teamIdentityStatus \?\? teamIdentityStatus\} \/>/);
  assert.match(memberProfile, /<TeamIdentityBadge status=\{member\.teamIdentityStatus\} \/>/);
  assert.match(communityService, /author\.team_identity_status AS author_team_identity_status/);
  assert.match(communityService, /u\.team_identity_status AS author_team_identity_status/);
  assert.match(profileService, /Select\("id, name, real_name, nickname, avatar_url, team_identity_status"\)/);
});

test("identity is an audited source independent of account roles and organization membership", () => {
  assert.match(backendModel, /TeamIdentityStatus string\s+`json:"-" gorm:"column:team_identity_status;size:32;not null;default:'community_member'/);
  assert.match(backendIdentity, /type TeamIdentityChange struct/);
  assert.match(backendRepository, /Update\("team_identity_status", nextStatus\)/);
  assert.match(backendRepository, /tx\.Create\(&model\.TeamIdentityChange/);
  const update = backendAdmin.slice(backendAdmin.indexOf("func (s *Service) UpdateTeamIdentity"), backendAdmin.indexOf("func (s *Service) UpdateCurrentRecruitmentGroup"));
  assert.match(update, /ensureUserAdminActor\(actor\)/);
  assert.match(update, /input\.AssessmentPassed \|\| !input\.LeaderConfirmed/);
  assert.match(update, /input\.PriorFormalMembershipConfirmed/);
  assert.doesNotMatch(update, /UpdateUserGroup|UpdateUser\(|RoleID|GroupMembers|XP/);
  assert.match(router, /superAdminAPI\.PATCH\("\/users\/:id\/team-identity", requireSameOriginRequest\(cfg\), adminUserHandler\.UpdateTeamIdentity\)/);
});

test("account management keeps system permission separate and requires evidence plus reason", () => {
  assert.match(adminPage, /<th>成员身份<\/th>/);
  assert.match(adminPage, /独立于系统权限、所属组别、组织头衔、社区等级和勋章/);
  assert.match(adminPage, /年级、招新结果或作业完成情况不会自动认定队员身份/);
  assert.match(adminPage, /reason: teamIdentityReason\.trim\(\)/);
  assert.match(adminPage, /teamIdentityDraft === "formal_member" && \(!assessmentPassed \|\| !leaderConfirmed\)/);
  assert.match(adminPage, /teamIdentityDraft === "former_member" && editing\.teamIdentityStatus !== "formal_member" && !priorFormalMembershipConfirmed/);
  assert.match(adminPage, /身份变更记录/);
  assert.match(adminClient, /`\/api\/admin\/users\/\$\{userId\}\/team-identity`/);
});
