// The coach of the tutorial (US-199): the texts of the server's reasons and the lessons' titles, and what the coach panel
// says on the player's turn. The server sends codes (why a card is the one to play, why each other legal card is not);
// `{0}` is the coached card and `{1}` the other card, both as their localized names.
import type { Card, TutorialInfo } from "$lib/api/types";

// Why the coached card is right (the server's `CardReason`).
export const WHY: Record<string, string> = {
  LEAD_TRUMPS: "You lead, so start with trumps. {0} is your strongest trump: it draws out the opponents' trumps and keeps control of the round.",
  CASH_MASTER: "{0} is the highest card of its suit still in play, so it is sure to win. Play it now, before it can be beaten.",
  LEAD_LOW: "Lead a low card of a suit: {0} costs you almost nothing and lets your partner or your strong cards win later.",
  GIVE_POINTS: "Your partner is sure to win this trick, so the points are yours: add {0}, that card is worth points.",
  KEEP_PARTNERS_TRICK: "Your partner is winning this trick: do not take it from them. Play {0}, a low card, and keep your strong cards.",
  WIN_CHEAPLY: "Take the trick with the cheapest card that wins it: {0} wins and keeps your higher cards for later.",
  THROW_CHEAPEST: "You cannot win this trick: throw away your cheapest card, {0}, and keep the others.",
  BEST_FOR_ROUND: "{0} is the best play for the rest of the round, all things considered.",
  ONLY_LEGAL_CARD: "You must follow suit, and {0} is the only card of that suit you hold: there is no choice, it is the rule."
};

// Why another legal card is not the one (the server's `WhyNot`).
export const WHY_NOT: Record<string, string> = {
  OVERTAKES_PARTNER: "Not {1}: that would take the trick from your partner, who is already winning.",
  LOSES_THE_TRICK: "Not {1}: that card cannot win the trick, while {0} can.",
  TOO_STRONG: "Not {1}: that card wins too, but it is worth more. {0} does the same job for less.",
  GIVES_POINTS_AWAY: "Not {1}: that card would hand points to the opponents' trick.",
  KEEPS_POINTS_FROM_PARTNER: "Not {1}: {0} puts more points in your partner's trick.",
  KEEP_FOR_LATER: "Not {1}: that card is worth more than {0} and this trick does not need it. Keep it for later.",
  STRONGER_TRUMP_FIRST: "Not {1}: lead your strongest trump first, {0}.",
  KEEP_TRUMPS_BACK: "Not {1}: that is a trump, keep your trumps. Lead {0} instead.",
  ALSO_A_MASTER: "{1} is a master too, but {0} may as well go first: waiting costs nothing.",
  TRUMP_FIRST: "Not {1}: begin with a trump, {0}.",
  CASH_MASTER_FIRST: "Not {1}: that card is not sure to win, while {0} is a master.",
  WEAKER_FOR_THE_ROUND: "Not {1}: {0} is the better play for this round."
};

// The lessons, in the order of the server's `lessons()`.
export const LESSONS: { id: string; title: string; goal: string }[] = [
  { id: "lead-trump", title: "Lead with a trump", goal: "When you lead, your strong trumps clear the way." },
  { id: "win-cheaply", title: "Win cheaply", goal: "Take a trick with the smallest card that wins, then cash a master." },
  { id: "follow-suit", title: "Follow suit", goal: "You must play a card of the suit led when you have one." },
  { id: "cut", title: "Cut with a trump", goal: "No card of the suit led? Win the trick with your smallest trump." },
  { id: "partners-trick", title: "Leave it to your partner", goal: "When your partner is winning, do not take the trick from them." },
  { id: "give-points", title: "Give points to your partner", goal: "When your partner's trick is safe, put your points in it." }
];

export const cardKeyOf = (card: Pick<Card, "rank" | "suit">): string => `${card.rank}-${card.suit}`;

export interface CoachLines {
  /** Where the player stands: the lesson and its step, or the free game. */
  heading: { lesson: { number: number; lessons: number; title: string; step: number; steps: number } | null };
  instruction: { key: string; card: Card };
  why: { key: string; card: Card };
  /** Why the card the player tapped is not the one, once they tapped another legal card. */
  tapped: { key: string; best: Card; other: Card } | null;
}

// What the panel says on the player's turn; `tappedKey` is the legal card they tapped that is not the coached one.
export function coachLines(tutorial: TutorialInfo, tappedKey: string | null): CoachLines | null {
  const coach = tutorial.coach;
  if (!coach) return null;
  const lesson = coach.progress ? LESSONS[coach.progress.number - 1] : undefined;
  const other = tappedKey ? coach.others.find((entry) => cardKeyOf(entry.card) === tappedKey) : undefined;
  return {
    heading: {
      lesson:
        coach.progress && lesson
          ? { number: coach.progress.number, lessons: coach.progress.lessons, title: lesson.title, step: coach.progress.step + 1, steps: coach.progress.steps }
          : null
    },
    instruction: { key: "Play {0}.", card: coach.card },
    why: { key: WHY[coach.why] ?? WHY.BEST_FOR_ROUND, card: coach.card },
    tapped: other ? { key: WHY_NOT[other.whyNot] ?? WHY_NOT.WEAKER_FOR_THE_ROUND, best: coach.card, other: other.card } : null
  };
}

// The lesson after the one with this id, or none after the last.
export function nextLesson(id: string | undefined): string | null {
  const index = LESSONS.findIndex((lesson) => lesson.id === id);
  return index >= 0 && index < LESSONS.length - 1 ? LESSONS[index + 1].id : null;
}
