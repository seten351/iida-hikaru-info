import type { AppearanceGuestInfo } from "@/domain/appearance-guests";
import type { AppearanceCardSession } from "@/lib/appearances";

function hasVisibleGuestInfo(info: AppearanceGuestInfo | undefined) {
  return info?.isHikaruGuest === true || (info?.guestNames.length ?? 0) > 0;
}

// Confirmed non-guest and unconfirmed roles have the same public presentation.
function sameVisibleGuestInfo(a: AppearanceGuestInfo | undefined, b: AppearanceGuestInfo | undefined) {
  const leftNames = a?.guestNames ?? [];
  const rightNames = b?.guestNames ?? [];
  return (a?.isHikaruGuest === true) === (b?.isHikaruGuest === true) &&
    leftNames.length === rightNames.length &&
    leftNames.every((name, index) => name === rightNames[index]);
}

function AppearanceGuestInfoDisplay({ info }: { info: AppearanceGuestInfo | undefined }) {
  if (!hasVisibleGuestInfo(info)) return null;

  return (
    <span className="appearance-guest-info">
      {info?.isHikaruGuest === true && (
        <span className="appearance-guest-info__badge">ゲスト出演</span>
      )}
      {(info?.guestNames.length ?? 0) > 0 && (
        <span className="appearance-guest-info__names">
          ゲスト：{info!.guestNames.join("・")}
        </span>
      )}
    </span>
  );
}

/** Render one shared label when all visible sessions agree, otherwise show each assignment by session. */
export function AppearanceGuestAssignments({
  sessions,
}: {
  sessions: AppearanceCardSession[];
}) {
  if (sessions.length === 0) return null;

  const firstInfo = sessions[0].guestInfo;
  if (sessions.every((session) => sameVisibleGuestInfo(firstInfo, session.guestInfo))) {
    return <AppearanceGuestInfoDisplay info={firstInfo} />;
  }

  const assignedSessions = sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => hasVisibleGuestInfo(session.guestInfo));
  if (assignedSessions.length === 0) return null;

  return (
    <ul className="appearance-guest-info__sessions" aria-label="公演ごとのゲスト情報">
      {assignedSessions.map(({ session, index }) => (
        <li key={session.id}>
          <span className="appearance-guest-info__session-label">
            {session.sessionLabel || `公演${index + 1}`}
          </span>
          <AppearanceGuestInfoDisplay info={session.guestInfo} />
        </li>
      ))}
    </ul>
  );
}

export function getCalendarGuestMarker(sessions: AppearanceCardSession[]) {
  const isHikaruGuest = sessions.some(({ guestInfo }) => guestInfo?.isHikaruGuest === true);
  const guestNames = [...new Set(sessions.flatMap(({ guestInfo }) => guestInfo?.guestNames ?? []))];
  const labels = [
    ...(isHikaruGuest ? ["ゲスト出演"] : []),
    ...(guestNames.length > 0 ? [`ゲスト：${guestNames.join("・")}`] : []),
  ];
  return labels.join("・") || null;
}
