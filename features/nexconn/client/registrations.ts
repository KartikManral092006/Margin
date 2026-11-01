import type { CustomMessageRegistration } from "@nexconn/chat";
import type { ChatUICustomMessageRegistration } from "@nexconn/chatui";
import { defineMomentElementClass, MOMENT_TAG } from "@/features/nexconn/client/moment-element";
import { MG } from "@/features/nexconn/shared/messages";

export const MG_REGISTRATIONS: CustomMessageRegistration[] = [
  { messageType: MG.Moment, isPersisted: true, isCounted: true },
  { messageType: MG.MomentUpdate, isPersisted: false, isCounted: false },
  { messageType: MG.Sync, isPersisted: false, isCounted: false },
];

export function chatUIRegistrations(): ChatUICustomMessageRegistration[] {
  const elementClass = defineMomentElementClass();
  return MG_REGISTRATIONS.map((registration) =>
    registration.messageType === MG.Moment
      ? {
          ...registration,
          digest: () => "[Moment]",
          component: { tagName: MOMENT_TAG, elementClass },
        }
      : registration,
  );
}
