// The model of the online lobby (US-121): what the lobby sheet shows, from a table snapshot. Texts are English keys.
import type { TableInfo } from "$lib/api/types";
import { seatCountOf } from "./seat-count";

const TEAMS = ["North–South", "East–West"] as const;

export interface LobbySeat {
  position: number;
  team: (typeof TEAMS)[number];
  empty: boolean;
  you: boolean;
  name: string;
  type: "HUMAN" | "BOT" | null;
  ready: boolean;
  connection: "bot" | "disconnected" | "connected" | null;
  canSit: boolean;
}

function connectionOf(seat: { connectionState: string }): LobbySeat["connection"] {
  if (seat.connectionState === "BOT_TAKEOVER") return "bot";
  if (seat.connectionState === "DISCONNECTED") return "disconnected";
  return "connected";
}

export function lobbyModel(
  table: Pick<
    TableInfo,
    | "status"
    | "seats"
    | "ownerPosition"
    | "publicTable"
    | "invitationCode"
    | "turnTimerSeconds"
    | "announcements"
    | "spectatorsAllowed"
    | "variant"
    | "allTrumps"
    | "target"
    | "klaverjasRules"
  >
) {
  const waiting = table.status === "WAITING_FOR_PLAYERS";
  const taken = new Map((table.seats || []).map((seat) => [seat.position, seat]));
  const you = (table.seats || []).find((seat) => seat.you) || null;
  const owner = Boolean(you) && table.ownerPosition === you!.position;
  const isPublic = Boolean(table.publicTable);
  const seatCount = seatCountOf(table.variant);
  const seats: LobbySeat[] = [0, 1, 2, 3].slice(0, seatCount).map((position) => {
    const seat = taken.get(position);
    return {
      position,
      team: TEAMS[position % 2],
      empty: !seat,
      you: Boolean(seat?.you),
      name: seat ? seat.name : "",
      type: seat ? seat.type : null,
      ready: Boolean(seat?.ready),
      connection: seat ? connectionOf(seat) : null,
      canSit: !seat && waiting && !isPublic && Boolean(you)
    };
  });
  const seated = seats.filter((seat) => !seat.empty);
  const humans = seated.filter((seat) => seat.type !== "BOT");
  const rules = {
    timer: table.turnTimerSeconds || 0,
    announcements: Boolean(table.announcements),
    announcementsShown: table.variant !== "KLABERJASS" && table.variant !== "KLAVERJAS",
    spectators: Boolean(table.spectatorsAllowed),
    allTrumps: table.variant === "CONTREE" ? Boolean(table.allTrumps) : null,
    // The Klaverjas rule set (US-214); null at any other table.
    klaverjasRules: table.variant === "KLAVERJAS" ? (table.klaverjasRules ?? "AMSTERDAMS") : null,
    target: table.target
  };
  return {
    waiting,
    showCode: !isPublic,
    code: table.invitationCode || "",
    title: isPublic ? "Looking for players…" : "Gather your team.",
    seats,
    ready: { shown: Boolean(you) && waiting, on: Boolean(you?.ready) },
    start: {
      shown: owner && waiting && !isPublic,
      disabled: !(seated.length === seatCount && seated.every((seat) => seat.ready || seat.type === "BOT"))
    },
    startWithBots: {
      shown: owner && waiting && !isPublic && seated.length < seatCount,
      disabled: !humans.every((seat) => seat.ready)
    },
    rules: { shown: owner && waiting && !isPublic, ...rules },
    summary: { ...rules, variant: table.variant },
    publicWaiting: isPublic && waiting && Boolean(you)
  };
}

export type LobbyModel = ReturnType<typeof lobbyModel>;
