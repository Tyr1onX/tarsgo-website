import assert from 'node:assert/strict';
import test from 'node:test';
import { hasWorkbenchAccess, isInternalDashboardPath, getDashboardSectionMenu } from './dashboard-navigation.ts';
test('server-derived workbench eligibility gates both navigation variants', () => {
  for (const access of [false, undefined, true]) {
    const user = {id: 5, role:{name:'user'},workbenchAccess:access};
    assert.equal(hasWorkbenchAccess(user), access === true);
    assert.deepEqual(getDashboardSectionMenu(user).map(x=>x.key), access ? ['community','workbench','my-profile'] : ['community','my-profile']);
  }
});
test('internal route policy includes nested and future routes, keeps community and recruitment open', () => {
  for (const path of ['/dashboard/workbench','/dashboard/workbench/organization','/dashboard/workbench/future','/dashboard/timetable/','/dashboard/weekly-reports','/dashboard/leave','/dashboard/assignments','/dashboard/guide','/dashboard/team']) assert.equal(isInternalDashboardPath(path),true,path);
  for (const path of ['/dashboard','/dashboard/community/7','/dashboard/members/7','/dashboard/users/registrations','/dashboard/questions','/dashboard/admin','/dashboard/admin/users']) assert.equal(isInternalDashboardPath(path),false,path);
});
