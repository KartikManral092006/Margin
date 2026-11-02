import { newAlnumId } from "@/lib/ids";

// User IDs double as Nexconn user IDs, which allow letters and digits only.
export const newUserId = newAlnumId;
