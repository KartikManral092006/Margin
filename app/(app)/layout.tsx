import { SessionRefresher } from "@/features/auth/components/session-refresher";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SessionRefresher />
      {children}
    </>
  );
}
