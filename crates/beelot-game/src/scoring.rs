//! The score of a round once its tricks are played, FFB-style (US-060). A team's total is its
//! card points, dix de der, Belote and announcements, and the taker's total decides the contract:
//! in Classic it must beat the defence's total, in Contrée it must reach the bid.

use serde::{Deserialize, Deserializer, Serialize};

use crate::announcements::Announcement;
use crate::card::{Seat, Team, Trump, Variant};

/// A player's declared announcements, and whether their team scores them. The team is
/// `Team::of(seat)`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Declaration {
    pub seat: Seat,
    pub announcements: Vec<Announcement>,
    pub scored: bool,
}

/// `capotTeam` is the empty string (or null) when nobody took every trick.
fn capot_team<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Team>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        Team(Team),
        Text(String),
    }
    match Option::<Raw>::deserialize(deserializer)? {
        None => Ok(None),
        Some(Raw::Team(team)) => Ok(Some(team)),
        Some(Raw::Text(text)) if text.is_empty() => Ok(None),
        Some(Raw::Text(text)) => Err(serde::de::Error::custom(format!("unknown team: {text}"))),
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundResult {
    pub north_south_card_points: i32,
    pub east_west_card_points: i32,
    pub north_south_dix_de_der: i32,
    pub east_west_dix_de_der: i32,
    pub north_south_belote_bonus: i32,
    pub east_west_belote_bonus: i32,
    pub contract_made: bool,
    pub north_south_awarded: i32,
    pub east_west_awarded: i32,
    /// The Contrée bid counted for this team (US-130), before a coinche doubles it; 0 in Classic
    /// and in rounds recorded before the bid was counted.
    #[serde(default)]
    pub north_south_bid: i32,
    #[serde(default)]
    pub east_west_bid: i32,
    #[serde(deserialize_with = "capot_team", default)]
    pub capot_team: Option<Team>,
    pub north_south_announcements: i32,
    pub east_west_announcements: i32,
    pub announcements: Vec<Declaration>,
}

/// A finished round: who declared, the trump, the Contrée contract (None in classic Belote), and
/// the result.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundSummary {
    pub declaring_team: Team,
    pub trump: Trump,
    pub contract_value: Option<i32>,
    pub coinched: bool,
    /// Bazar Blot (US-216): the bidding team answered the contra with a recontra; `coinched` is also set.
    #[serde(default)]
    pub recontra: bool,
    pub result: RoundResult,
}

/// A round's totals per team; the announcements are those that score, so one side is 0.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub variant: Variant,
    pub north_south_declares: bool,
    pub contract_value: i32,
    pub coinched: bool,
    /// Bazar Blot: a recontra answered the contra (`coinched`).
    #[serde(default)]
    pub recontra: bool,
    /// Bazar Blot: the contract is no trumps ("Boy"), whose bid counts more.
    #[serde(default)]
    pub no_trumps: bool,
    pub north_south_card_points: i32,
    pub east_west_card_points: i32,
    pub north_south_dix_de_der: i32,
    pub east_west_dix_de_der: i32,
    pub north_south_belote: i32,
    pub east_west_belote: i32,
    pub north_south_tricks: i32,
    pub north_south_announcements: i32,
    pub east_west_announcements: i32,
}

/// A failed contract gives the defence 162 and every announcement that scored, and leaves the
/// taker its Belote. A taker taking every trick scores 250 and its own announcements; a capoted
/// taker fails and the defence scores 250 and every announcement that scored. Belote always stays
/// with its team. In Contrée the bid is counted once, when the round is totalled: it goes to the
/// taker when the contract is made and to the defence when it fails (US-130). A coinche doubles
/// the winner's score, the bid included. A made coinched contract pays the taker everything, like a failed one pays the defence (FFB).
pub fn score(totals: &Totals, declarations: &[Declaration]) -> RoundResult {
    let t = totals;
    if t.variant == Variant::Klaverjas {
        return score_klaverjas(t);
    }
    if t.variant == Variant::BazarBlot {
        return score_bazar_blot(t, declarations);
    }
    let ns_total = t
        .north_south_card_points
        .wrapping_add(t.north_south_dix_de_der)
        .wrapping_add(t.north_south_belote)
        .wrapping_add(t.north_south_announcements);
    let ew_total = t
        .east_west_card_points
        .wrapping_add(t.east_west_dix_de_der)
        .wrapping_add(t.east_west_belote)
        .wrapping_add(t.east_west_announcements);
    let ns_declares = t.north_south_declares;
    let taker_total = if ns_declares { ns_total } else { ew_total };
    let defence_total = if ns_declares { ew_total } else { ns_total };
    let every_trick = if t.variant == Variant::Klaberjass {
        9
    } else {
        8
    };
    let capot_team = match t.north_south_tricks {
        tricks if tricks == every_trick => Some(Team::NorthSouth),
        0 => Some(Team::EastWest),
        _ => None,
    };
    let declaring_team = if ns_declares {
        Team::NorthSouth
    } else {
        Team::EastWest
    };
    let contract_made = match capot_team {
        None if t.variant == Variant::Contree => taker_total >= t.contract_value,
        None => taker_total > defence_total,
        Some(capot) => capot == declaring_team,
    };

    let all_announcements = t
        .north_south_announcements
        .wrapping_add(t.east_west_announcements);
    let bid = if t.variant == Variant::Contree {
        t.contract_value
    } else {
        0
    };
    // The bid goes to the team that wins the contract: the taker if it is made, else the defence.
    let bid_to_north_south = ns_declares == contract_made;
    let (mut ns_awarded, mut ew_awarded);
    if let Some(capot) = capot_team {
        let ns_capot = capot == Team::NorthSouth;
        let taker_capot = capot == declaring_team;
        let bonus = if taker_capot { 0 } else { all_announcements };
        // Bela's "štiglja" adds 90 to the 162 of the cards.
        let capot_base: i32 = if t.variant == Variant::Bela { 252 } else { 250 };
        let capot_score = capot_base.wrapping_add(bonus);
        ns_awarded = if ns_capot {
            capot_score
                .wrapping_add(if taker_capot {
                    t.north_south_announcements
                } else {
                    0
                })
                .wrapping_add(t.north_south_belote)
        } else {
            t.north_south_belote
        };
        ew_awarded = if ns_capot {
            t.east_west_belote
        } else {
            capot_score
                .wrapping_add(if taker_capot {
                    t.east_west_announcements
                } else {
                    0
                })
                .wrapping_add(t.east_west_belote)
        };
    } else if contract_made && !t.coinched {
        ns_awarded = ns_total;
        ew_awarded = ew_total;
    } else {
        // A failed contract, or a made one that was coinched: the winner takes every point.
        let winner = 162i32.wrapping_add(all_announcements);
        let ns_wins = ns_declares == contract_made;
        ns_awarded = if ns_wins {
            winner.wrapping_add(t.north_south_belote)
        } else {
            t.north_south_belote
        };
        ew_awarded = if ns_wins {
            t.east_west_belote
        } else {
            winner.wrapping_add(t.east_west_belote)
        };
    }
    let (ns_bid, ew_bid) = if bid_to_north_south {
        (bid, 0)
    } else {
        (0, bid)
    };
    ns_awarded = ns_awarded.wrapping_add(ns_bid);
    ew_awarded = ew_awarded.wrapping_add(ew_bid);
    if t.coinched {
        ns_awarded = ns_awarded.wrapping_mul(2);
        ew_awarded = ew_awarded.wrapping_mul(2);
    }
    RoundResult {
        north_south_card_points: t.north_south_card_points,
        east_west_card_points: t.east_west_card_points,
        north_south_dix_de_der: t.north_south_dix_de_der,
        east_west_dix_de_der: t.east_west_dix_de_der,
        north_south_belote_bonus: t.north_south_belote,
        east_west_belote_bonus: t.east_west_belote,
        contract_made,
        north_south_awarded: ns_awarded,
        east_west_awarded: ew_awarded,
        north_south_bid: ns_bid,
        east_west_bid: ew_bid,
        capot_team,
        north_south_announcements: t.north_south_announcements,
        east_west_announcements: t.east_west_announcements,
        announcements: declarations.to_vec(),
    }
}

/// The pit: 100 roem extra for a playing team that takes every trick of a Klaverjas round.
pub const PIT_BONUS: i32 = 100;

/// Klaverjas (US-213). Each team's total is its card points, last trick and roem (kept in the
/// announcement fields). The playing team must score more than half of all the points, so more
/// than the opponents; otherwise it is "nat": it scores 0 and the opponents score 162 and the roem
/// of both teams. A playing team taking every trick makes "pit", 100 roem extra, reported as the
/// capot team.
fn score_klaverjas(t: &Totals) -> RoundResult {
    let ns_total = t
        .north_south_card_points
        .wrapping_add(t.north_south_dix_de_der)
        .wrapping_add(t.north_south_announcements);
    let ew_total = t
        .east_west_card_points
        .wrapping_add(t.east_west_dix_de_der)
        .wrapping_add(t.east_west_announcements);
    let ns_plays = t.north_south_declares;
    let (playing_total, opponents_total) = if ns_plays {
        (ns_total, ew_total)
    } else {
        (ew_total, ns_total)
    };
    let made = playing_total > opponents_total;
    let playing_tricks = if ns_plays {
        t.north_south_tricks
    } else {
        8 - t.north_south_tricks
    };
    let pit = playing_tricks == 8;
    let playing_team = if ns_plays {
        Team::NorthSouth
    } else {
        Team::EastWest
    };
    let (playing_awarded, opponents_awarded) = if !made {
        let all_roem = t
            .north_south_announcements
            .wrapping_add(t.east_west_announcements);
        (0, 162i32.wrapping_add(all_roem))
    } else if pit {
        (playing_total.wrapping_add(PIT_BONUS), opponents_total)
    } else {
        (playing_total, opponents_total)
    };
    let (ns_awarded, ew_awarded) = if ns_plays {
        (playing_awarded, opponents_awarded)
    } else {
        (opponents_awarded, playing_awarded)
    };
    RoundResult {
        north_south_card_points: t.north_south_card_points,
        east_west_card_points: t.east_west_card_points,
        north_south_dix_de_der: t.north_south_dix_de_der,
        east_west_dix_de_der: t.east_west_dix_de_der,
        north_south_belote_bonus: 0,
        east_west_belote_bonus: 0,
        contract_made: made,
        north_south_awarded: ns_awarded,
        east_west_awarded: ew_awarded,
        north_south_bid: 0,
        east_west_bid: 0,
        capot_team: pit.then_some(playing_team),
        north_south_announcements: t.north_south_announcements,
        east_west_announcements: t.east_west_announcements,
        announcements: Vec::new(),
    }
}

/// The bid of kaput in Bazar Blot: every trick (US-216).
pub const KAPUT_BID: i32 = 25;

/// Points counted in tens, the "sai" of Bazar Blot: a half rounds down (112 → 11, 115 → 11, 116 → 12).
pub fn sai(points: i32) -> i32 {
    (points + 4).div_euclid(10)
}

/// How many times a Bazar Blot bid counts: 1 in a suit and 2 under no trumps; 2 and 3 with contra, 4 and 5 with
/// recontra.
pub fn bazar_multiplier(no_trumps: bool, coinched: bool, recontra: bool) -> i32 {
    match (no_trumps, coinched, recontra) {
        (false, _, true) => 4,
        (true, _, true) => 5,
        (false, true, false) => 2,
        (true, true, false) => 3,
        (false, false, false) => 1,
        (true, false, false) => 2,
    }
}

/// Bazar Blot (US-216), in tens. The bidding team must reach bid × 10 with its card points, last trick, scored
/// declarations and blot (252 when it takes every trick); a kaput bid needs every trick. The deal is worth 16, or 25 when
/// one team takes every trick. Made: the bidding team scores bid × multiplier + 16 − the defence's sai and its
/// declarations, the defence its sai and its declarations; under contra or recontra the bidding team scores bid ×
/// multiplier + 16 and every declaration, the defence nothing. Failed: the defence scores bid × multiplier + 16 and every
/// declaration. A blot always stays with its team.
fn score_bazar_blot(t: &Totals, declarations: &[Declaration]) -> RoundResult {
    let ns_declares = t.north_south_declares;
    let ns_tricks_points = t.north_south_card_points + t.north_south_dix_de_der;
    let ew_tricks_points = t.east_west_card_points + t.east_west_dix_de_der;
    let capot_team = match t.north_south_tricks {
        8 => Some(Team::NorthSouth),
        0 => Some(Team::EastWest),
        _ => None,
    };
    let declaring_team = if ns_declares {
        Team::NorthSouth
    } else {
        Team::EastWest
    };
    let (taker_tricks_points, defence_tricks_points) = if ns_declares {
        (ns_tricks_points, ew_tricks_points)
    } else {
        (ew_tricks_points, ns_tricks_points)
    };
    let (taker_announcements, defence_announcements) = if ns_declares {
        (t.north_south_announcements, t.east_west_announcements)
    } else {
        (t.east_west_announcements, t.north_south_announcements)
    };
    let (taker_blot, defence_blot) = if ns_declares {
        (t.north_south_belote, t.east_west_belote)
    } else {
        (t.east_west_belote, t.north_south_belote)
    };
    let taker_kaput = capot_team == Some(declaring_team);
    let taker_points = if taker_kaput {
        252
    } else {
        taker_tricks_points
    } + taker_announcements
        + taker_blot;
    let contract_made = if t.contract_value >= KAPUT_BID {
        taker_kaput
    } else {
        capot_team != Some(declaring_team.other()) && taker_points >= t.contract_value * 10
    };
    let deal = if capot_team.is_some() { 25 } else { 16 };
    let bid = t.contract_value * bazar_multiplier(t.no_trumps, t.coinched, t.recontra);
    let every_declaration = sai(taker_announcements) + sai(defence_announcements);
    let (taker_awarded, defence_awarded) = if !contract_made {
        (
            sai(taker_blot),
            bid + deal + every_declaration + sai(defence_blot),
        )
    } else if t.coinched {
        (
            bid + deal + every_declaration + sai(taker_blot),
            sai(defence_blot),
        )
    } else {
        let defence_sai = if taker_kaput {
            0
        } else {
            sai(defence_tricks_points)
        };
        (
            bid + deal - defence_sai + sai(taker_announcements) + sai(taker_blot),
            defence_sai + sai(defence_announcements) + sai(defence_blot),
        )
    };
    let (ns_awarded, ew_awarded) = if ns_declares {
        (taker_awarded, defence_awarded)
    } else {
        (defence_awarded, taker_awarded)
    };
    let bid_to_north_south = ns_declares == contract_made;
    let (ns_bid, ew_bid) = if bid_to_north_south {
        (bid, 0)
    } else {
        (0, bid)
    };
    RoundResult {
        north_south_card_points: t.north_south_card_points,
        east_west_card_points: t.east_west_card_points,
        north_south_dix_de_der: t.north_south_dix_de_der,
        east_west_dix_de_der: t.east_west_dix_de_der,
        north_south_belote_bonus: t.north_south_belote,
        east_west_belote_bonus: t.east_west_belote,
        contract_made,
        north_south_awarded: ns_awarded,
        east_west_awarded: ew_awarded,
        north_south_bid: ns_bid,
        east_west_bid: ew_bid,
        capot_team,
        north_south_announcements: t.north_south_announcements,
        east_west_announcements: t.east_west_announcements,
        announcements: declarations.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// North–South take the contract.
    #[allow(clippy::too_many_arguments)]
    fn classic(
        ns_cards: i32,
        ew_cards: i32,
        ns_dix: i32,
        ew_dix: i32,
        ns_belote: i32,
        ew_belote: i32,
        ns_tricks: i32,
        ns_ann: i32,
        ew_ann: i32,
    ) -> Totals {
        Totals {
            variant: Variant::Classic,
            north_south_declares: true,
            contract_value: 82,
            coinched: false,
            recontra: false,
            no_trumps: false,
            north_south_card_points: ns_cards,
            east_west_card_points: ew_cards,
            north_south_dix_de_der: ns_dix,
            east_west_dix_de_der: ew_dix,
            north_south_belote: ns_belote,
            east_west_belote: ew_belote,
            north_south_tricks: ns_tricks,
            north_south_announcements: ns_ann,
            east_west_announcements: ew_ann,
        }
    }

    #[test]
    fn a_bela_capot_scores_the_cards_and_90_more() {
        let totals = Totals {
            variant: Variant::Bela,
            ..classic(152, 0, 10, 0, 0, 0, 8, 0, 0)
        };
        let result = score(&totals, &[]);
        assert_eq!(result.north_south_awarded, 252);
        assert_eq!(result.east_west_awarded, 0);
        let classic = score(&classic(152, 0, 10, 0, 0, 0, 8, 0, 0), &[]);
        assert_eq!(classic.north_south_awarded, 250);
    }

    /// North–South bid the contract.
    #[allow(clippy::too_many_arguments)]
    fn contree(
        bid: i32,
        coinched: bool,
        ns_cards: i32,
        ew_cards: i32,
        ns_dix: i32,
        ew_dix: i32,
        ns_belote: i32,
        ew_belote: i32,
        ns_tricks: i32,
        ns_ann: i32,
        ew_ann: i32,
    ) -> Totals {
        Totals {
            variant: Variant::Contree,
            contract_value: bid,
            coinched,
            recontra: false,
            no_trumps: false,
            ..classic(
                ns_cards, ew_cards, ns_dix, ew_dix, ns_belote, ew_belote, ns_tricks, ns_ann, ew_ann,
            )
        }
    }

    fn run(totals: Totals) -> RoundResult {
        score(&totals, &[])
    }

    #[test]
    fn classic_belote_counts_towards_the_contract() {
        let result = run(classic(65, 87, 10, 0, 20, 0, 5, 0, 0));
        assert!(result.contract_made);
        assert_eq!(result.north_south_awarded, 95);
        assert_eq!(result.east_west_awarded, 87);
    }

    #[test]
    fn classic_tie_fails() {
        let result = run(classic(61, 91, 10, 0, 20, 0, 4, 0, 0));
        assert!(!result.contract_made);
        assert_eq!(result.north_south_awarded, 20);
        assert_eq!(result.east_west_awarded, 162);
    }

    #[test]
    fn contree_belote_counts_towards_the_bid() {
        let result = run(contree(100, false, 72, 80, 10, 0, 20, 0, 5, 0, 0));
        assert!(result.contract_made);
        assert_eq!(result.north_south_awarded, 102 + 100);
        assert_eq!(result.east_west_awarded, 80);
    }

    #[test]
    fn announcements_count_towards_the_contract() {
        let result = run(classic(66, 86, 10, 0, 0, 0, 5, 20, 0));
        assert!(result.contract_made);
        assert_eq!(result.north_south_awarded, 96);
        assert_eq!(result.east_west_awarded, 86);
        assert_eq!(result.north_south_announcements, 20);
        assert_eq!(result.east_west_announcements, 0);
    }

    #[test]
    fn failed_contract_gives_the_defence_every_scored_announcement() {
        let result = run(classic(40, 112, 0, 10, 0, 0, 2, 50, 0));
        assert!(!result.contract_made);
        assert_eq!(result.north_south_awarded, 0);
        assert_eq!(result.east_west_awarded, 212);
    }

    #[test]
    fn capot_adds_the_teams_own_announcements() {
        let result = run(classic(152, 0, 10, 0, 0, 20, 8, 50, 0));
        assert_eq!(result.capot_team, Some(Team::NorthSouth));
        assert_eq!(result.north_south_awarded, 300);
        assert_eq!(result.east_west_awarded, 20);
    }

    #[test]
    fn capoted_taker_fails_and_loses_its_announcements_to_the_defence() {
        let result = run(contree(80, false, 0, 152, 0, 10, 0, 0, 0, 200, 0));
        assert!(!result.contract_made);
        assert_eq!(result.capot_team, Some(Team::EastWest));
        assert_eq!(result.north_south_awarded, 0);
        assert_eq!(result.east_west_awarded, 450 + 80);
        assert_eq!(result.east_west_bid, 80);
    }

    #[test]
    fn coinche_gives_the_winner_everything_and_doubles_it() {
        // FFB: a coinched contract that is made pays the taker (162 + the bid) twice and the
        // defence nothing, as a failed one pays the defence.
        let result = run(contree(90, true, 66, 86, 10, 0, 0, 0, 5, 20, 0));
        assert!(result.contract_made);
        assert_eq!(result.north_south_awarded, (162 + 20 + 90) * 2);
        assert_eq!(result.east_west_awarded, 0);
        assert_eq!(result.north_south_bid, 90);
    }

    #[test]
    fn contree_made_contract_adds_the_bid_to_the_taker() {
        // 70 card points + 10 dix de der + 20 Belote + 30 announced = 130 reaches the bid of 100.
        let result = run(contree(100, false, 70, 82, 10, 0, 20, 0, 5, 30, 0));
        assert!(result.contract_made);
        assert_eq!(result.north_south_awarded, 130 + 100);
        assert_eq!(result.east_west_awarded, 82);
        assert_eq!((result.north_south_bid, result.east_west_bid), (100, 0));
    }

    #[test]
    fn contree_failed_contract_gives_the_defence_the_bid_on_top_of_162() {
        // 40 + 10 + 20 + 20 = 90 falls short of the bid of 100.
        let result = run(contree(100, false, 40, 112, 10, 0, 20, 0, 3, 20, 0));
        assert!(!result.contract_made);
        // The taker keeps its Belote; the defence gets 162, every announcement and the bid.
        assert_eq!(result.north_south_awarded, 20);
        assert_eq!(result.east_west_awarded, 162 + 20 + 100);
        assert_eq!((result.north_south_bid, result.east_west_bid), (0, 100));
    }

    #[test]
    fn contree_failed_contract_of_east_west_gives_north_south_the_bid() {
        let totals = Totals {
            north_south_declares: false,
            ..contree(90, false, 100, 52, 10, 0, 0, 0, 6, 0, 0)
        };
        let result = run(totals);
        assert!(!result.contract_made);
        assert_eq!(result.north_south_awarded, 162 + 90);
        assert_eq!(result.east_west_awarded, 0);
        assert_eq!((result.north_south_bid, result.east_west_bid), (90, 0));
    }

    #[test]
    fn contree_capot_by_the_taker_counts_the_bid_once() {
        let result = run(contree(100, false, 152, 0, 10, 0, 0, 20, 8, 50, 0));
        assert_eq!(result.capot_team, Some(Team::NorthSouth));
        assert!(result.contract_made);
        // 250 for the capot, the announcements, the bid once; the defence keeps its Belote.
        assert_eq!(result.north_south_awarded, 250 + 50 + 100);
        assert_eq!(result.east_west_awarded, 20);
        assert_eq!((result.north_south_bid, result.east_west_bid), (100, 0));
    }

    #[test]
    fn contree_capot_by_the_defence_gives_it_the_bid() {
        let result = run(contree(80, false, 0, 152, 0, 10, 0, 0, 0, 20, 0));
        assert!(!result.contract_made);
        assert_eq!(result.east_west_awarded, 250 + 20 + 80);
        assert_eq!(result.north_south_bid, 0);
        assert_eq!(result.east_west_bid, 80);
    }

    #[test]
    fn coinche_and_surcoinche_double_the_bid_with_the_other_points() {
        // The coinched flag covers both: the engine doubles once for either.
        let made = run(contree(90, true, 66, 86, 10, 0, 0, 0, 5, 20, 0));
        assert_eq!(made.north_south_awarded, 2 * (162 + 20 + 90));
        assert_eq!(made.east_west_awarded, 0);
        let failed = run(contree(120, true, 60, 92, 10, 0, 0, 0, 4, 0, 0));
        assert!(!failed.contract_made);
        assert_eq!(failed.east_west_awarded, 2 * (162 + 120));
    }

    #[test]
    fn classic_belote_has_no_bid() {
        let result = run(classic(82, 70, 0, 10, 0, 0, 5, 0, 0));
        assert_eq!((result.north_south_bid, result.east_west_bid), (0, 0));
        assert_eq!(result.north_south_awarded, 82);
    }

    #[test]
    fn without_announcements_card_points_decide() {
        assert!(run(classic(82, 70, 0, 10, 0, 0, 5, 0, 0)).contract_made);
        assert!(!run(classic(81, 71, 0, 10, 0, 0, 4, 0, 0)).contract_made);
    }

    #[test]
    fn round_result_reads_the_recorded_json() {
        let json = r#"{"northSouthCardPoints":53,"eastWestCardPoints":99,"northSouthDixDeDer":10,"eastWestDixDeDer":0,"northSouthBeloteBonus":20,"eastWestBeloteBonus":0,"contractMade":true,"northSouthAwarded":83,"eastWestAwarded":99,"capotTeam":"","northSouthAnnouncements":20,"eastWestAnnouncements":0,"announcements":[{"seat":2,"player":"South","team":"North–South","announcements":[{"kind":"TIERCE","cards":["10H","JH","QH"],"value":20,"suit":"HEARTS"}],"scored":true}]}"#;
        let result: RoundResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.capot_team, None);
        // A round recorded before the bid was counted has no bid line (US-130).
        assert_eq!((result.north_south_bid, result.east_west_bid), (0, 0));
        assert_eq!(result.announcements[0].seat, 2);
        assert!(result.announcements[0].scored);
        let capot = json.replace(r#""capotTeam":"""#, r#""capotTeam":"North–South""#);
        let result: RoundResult = serde_json::from_str(&capot).unwrap();
        assert_eq!(result.capot_team, Some(Team::NorthSouth));
    }

    /// A Klaverjas round where the given team plays; roem is in the announcement fields.
    fn klaverjas(
        ns_plays: bool,
        ns_cards: i32,
        ns_last: i32,
        ns_tricks: i32,
        ns_roem: i32,
        ew_roem: i32,
    ) -> Totals {
        Totals {
            variant: Variant::Klaverjas,
            north_south_declares: ns_plays,
            contract_value: 82,
            coinched: false,
            recontra: false,
            no_trumps: false,
            north_south_card_points: ns_cards,
            east_west_card_points: 152 - ns_cards,
            north_south_dix_de_der: ns_last,
            east_west_dix_de_der: 10 - ns_last,
            north_south_belote: 0,
            east_west_belote: 0,
            north_south_tricks: ns_tricks,
            north_south_announcements: ns_roem,
            east_west_announcements: ew_roem,
        }
    }

    #[test]
    fn klaverjas_made_scores_what_each_team_won() {
        let result = score(&klaverjas(true, 90, 10, 5, 20, 0), &[]);
        assert!(result.contract_made);
        assert_eq!(
            (result.north_south_awarded, result.east_west_awarded),
            (120, 62)
        );
        assert_eq!(result.capot_team, None);
    }

    #[test]
    fn klaverjas_nat_gives_the_opponents_162_and_all_roem() {
        // North–South play with 70 + 10 + 20 = 100 against 82 + 50 = 132: nat.
        let result = score(&klaverjas(true, 70, 10, 4, 20, 50), &[]);
        assert!(!result.contract_made);
        assert_eq!(
            (result.north_south_awarded, result.east_west_awarded),
            (0, 232)
        );
    }

    #[test]
    fn klaverjas_a_tie_is_nat() {
        let result = score(&klaverjas(false, 71, 10, 4, 0, 0), &[]);
        assert!(!result.contract_made, "81 against 81 is not more than half");
        assert_eq!(
            (result.north_south_awarded, result.east_west_awarded),
            (162, 0)
        );
    }

    #[test]
    fn klaverjas_pit_adds_a_hundred_to_the_playing_team() {
        let result = score(&klaverjas(false, 0, 0, 0, 0, 40), &[]);
        assert_eq!(result.capot_team, Some(Team::EastWest));
        assert_eq!(
            (result.north_south_awarded, result.east_west_awarded),
            (0, 302)
        );
    }

    #[test]
    fn klaverjas_opponents_taking_every_trick_leave_the_players_nat_without_a_pit() {
        let result = score(&klaverjas(true, 0, 0, 0, 0, 20), &[]);
        assert!(!result.contract_made);
        assert_eq!(result.capot_team, None);
        assert_eq!(
            (result.north_south_awarded, result.east_west_awarded),
            (0, 182)
        );
    }
}
