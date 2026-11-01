import type { ServiceHooks } from "@nexconn/chatui";
import { SYSTEM_USER_ID, SYSTEM_USER_NAME } from "@/features/nexconn/shared/config";

export const devHooks: ServiceHooks = {
  async reqUserProfiles(userIds) {
    return userIds.map((userId) => ({
      userId,
      name: userId === SYSTEM_USER_ID ? SYSTEM_USER_NAME : userId,
    }));
  },
  async reqGroupProfiles(groupIds) {
    return groupIds.map((groupId) => ({ groupId, name: "Dev lecture", memberCount: 0 }));
  },
  async reqSystemProfiles(systemIds) {
    return systemIds.map((systemId) => ({ systemId, name: SYSTEM_USER_NAME }));
  },
  async reqGroupMembers() {
    return [];
  },
};
