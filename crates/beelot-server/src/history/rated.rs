//! Public matches change the players' ratings (US-068). Only a finished public match with four human players counts:
//! matches with bots, private tables and solo games never do, and an abandoned match is never recorded. A guest or a
//! deleted account takes part with a new player's rating but keeps none.

use beelot_game::Team;
use sqlx::MySqlConnection;
use uuid::Uuid;

use crate::db::matches::{StoredMatch, variant_code};
use crate::db::ratings::{self, StoredRating};
use crate::rating::Glicko;
use crate::tables::finished::Mode;

/// Whether the match is one that moves ratings.
pub fn is_rated(stored: &StoredMatch) -> bool {
    stored.mode == Mode::Public
        && stored.seats.len() == 4
        && stored.seats.iter().all(|seat| !seat.bot)
}

fn other(team: Team) -> Team {
    match team {
        Team::NorthSouth => Team::EastWest,
        Team::EastWest => Team::NorthSouth,
    }
}

struct Player {
    account: Option<Uuid>,
    team: Team,
    glicko: Glicko,
    matches: i32,
}

/// Rates every signed-in player of the match against the opposing team, inside the transaction that stores it.
pub async fn apply(db: &mut MySqlConnection, stored: &StoredMatch) -> sqlx::Result<()> {
    if !is_rated(stored) {
        return Ok(());
    }
    let variant = variant_code(stored.variant);
    let mut players = Vec::with_capacity(stored.seats.len());
    for seat in &stored.seats {
        let known = match seat.account {
            Some(account) => ratings::find(&mut *db, account, variant).await?,
            None => None,
        };
        players.push(Player {
            account: seat.account,
            team: seat.team,
            glicko: known.as_ref().map_or(Glicko::NEW, |rating| rating.glicko),
            matches: known.map_or(0, |rating| rating.matches),
        });
    }
    let team_rating = |team: Team| {
        let members: Vec<Glicko> = players
            .iter()
            .filter(|player| player.team == team)
            .map(|player| player.glicko)
            .collect();
        Glicko::team(&members)
    };
    let (north_south, east_west) = (team_rating(Team::NorthSouth), team_rating(Team::EastWest));
    for player in &players {
        let Some(account) = player.account else {
            continue;
        };
        let opponents = if other(player.team) == Team::NorthSouth {
            north_south
        } else {
            east_west
        };
        let score = if player.team == stored.winning_team {
            1.0
        } else {
            0.0
        };
        let updated = StoredRating {
            variant: variant.to_string(),
            glicko: player.glicko.after(opponents, score),
            matches: player.matches + 1,
        };
        ratings::save(&mut *db, account, &updated, stored.id, stored.ended_at).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::matches::StoredSeat;
    use beelot_game::Variant;
    use time::OffsetDateTime;

    fn stored(mode: Mode, bots: usize) -> StoredMatch {
        StoredMatch {
            id: Uuid::nil(),
            ended_at: OffsetDateTime::UNIX_EPOCH,
            mode,
            variant: Variant::Classic,
            difficulty: None,
            north_south_score: 1000,
            east_west_score: 800,
            winning_team: Team::NorthSouth,
            announcements: false,
            all_trumps: false,
            target: 1000,
            seats: (0..4)
                .map(|position| StoredSeat {
                    account: None,
                    name: format!("P{position}"),
                    team: Team::of(position),
                    bot: position < bots,
                })
                .collect(),
            rounds: Vec::new(),
        }
    }

    #[test]
    fn only_public_matches_between_humans_are_rated() {
        assert!(is_rated(&stored(Mode::Public, 0)));
        assert!(!is_rated(&stored(Mode::Public, 1)));
        assert!(!is_rated(&stored(Mode::Private, 0)));
        assert!(!is_rated(&stored(Mode::Solo, 0)));
    }
}
