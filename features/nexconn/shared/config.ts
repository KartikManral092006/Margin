export const NEXCONN_AREAS = {
  SG: { primary: "https://api.sg-light-api.com", backup: "https://api-b.sg-light-api.com" },
  NA: { primary: "https://api.us-light-api.com", backup: "https://api-b.us-light-api.com" },
  SA: { primary: "https://api.sau-light-api.com", backup: "https://api-b.sau-light-api.com" },
} as const;

export type NexconnArea = keyof typeof NEXCONN_AREAS;

export const DEV_LECTURE_CHANNEL_ID = "devlecture1";
export const SYSTEM_USER_ID = "marginbot";
export const SYSTEM_USER_NAME = "Margin";
