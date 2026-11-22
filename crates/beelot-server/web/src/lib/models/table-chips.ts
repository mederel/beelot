// The chip row of the card table (US-119): the declare toggle and one chip per announcement. Before the reveal that
// follows the first trick the chips are the player's own announcements; after it, everyone's. The caller supplies the
// translated texts.
import type { Announcement, Board } from "$lib/api/types";

export interface Chip {
  id: string;
  text: string;
  scored: boolean;
  detail: string;
}

export interface ChipLabels {
  own: (announcements: Announcement[]) => string;
  name: (announcement: Announcement) => string;
  detail: (player: string, announcement: Announcement) => string;
}

export function tableChips(board: Pick<Board, "ownAnnouncements" | "revealedAnnouncements" | "completedTricks" | "reviewingCompletedTrick" | "currentPlayer">, label: ChipLabels): { declare: { label: string } | null; chips: Chip[] } {
  const own = board.ownAnnouncements || [];
  const revealed = board.revealedAnnouncements || [];
  const declare = own.length ? { label: label.own(own) } : null;
  const revealing = board.completedTricks === 1 && board.reviewingCompletedTrick;
  const showRevealed = revealed.length > 0 && (revealing || board.completedTricks > 1);
  const chips: Chip[] = [];
  if (showRevealed) {
    revealed.forEach((declaration, d) =>
      declaration.announcements.forEach((announcement, a) => {
        chips.push({ id: `revealed-${d}-${a}`, text: label.name(announcement), scored: Boolean(declaration.scored), detail: label.detail(declaration.player, announcement) });
      })
    );
  } else {
    own.forEach((announcement, a) => {
      chips.push({ id: `own-${a}`, text: label.name(announcement), scored: false, detail: label.detail(board.currentPlayer, announcement) });
    });
  }
  return { declare, chips };
}
